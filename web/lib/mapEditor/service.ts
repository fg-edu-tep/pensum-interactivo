// Phase B1 — safe writes for the visual editor.
//
// applyMapBatch: validate everything first, then ONE transaction (rows locked,
// versions re-checked, two-phase sortIndex write). Records the exact per-row
// before/after in MapEdit so undoMapEdit can restore the table byte-for-byte,
// refusing if any row changed since. A `pre-map` CatalogSnapshot + AuditLog entry
// attribute every batch to the logged-in user.

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { buildCatalogPayload } from "../catalogPayload";
import { collectCourseCodes } from "../import/requirementParser";
import type { ReqNode } from "../types";
import type { MapBatch } from "./ops";
import { BatchError, canon, planBatch, planNodes, type PlanRow } from "./plan";
import { orderVersion, rowVersion } from "./version";
import { isKnownCode, validatePlan } from "./validate";

export { BatchError };

type JsonCol = "prereqTree" | "coreqTree" | "lockedFields";
const JSON_COLS: JsonCol[] = ["prereqTree", "coreqTree", "lockedFields"];

/** The columns a batch can change (the unit of undo). */
interface RowState {
  suggestedSemester: number;
  sortIndex: number;
  prereqText: string | null;
  prereqTree: unknown;
  coreqText: string | null;
  coreqTree: unknown;
  lockedFields: unknown;
}
const STATE_SELECT = {
  suggestedSemester: true, sortIndex: true, prereqText: true, prereqTree: true,
  coreqText: true, coreqTree: true, lockedFields: true,
} as const;

interface UndoRow {
  id: number;
  before: RowState;
  after: RowState;
  /** JSON columns that were SQL NULL (not JSON null) before the batch */
  sqlNull: JsonCol[];
}
interface UndoPayload {
  rows: UndoRow[];
  snapshotId: number | null;
}

/**
 * Prisma reads SQL NULL and JSON null alike. Ask the database which one a column holds, with
 * Prisma's own DbNull filter (no raw SQL, so it behaves the same on MySQL and Postgres).
 */
async function sqlNullColumns(
  db: Prisma.TransactionClient | typeof prisma,
  ids: number[]
): Promise<Map<number, JsonCol[]>> {
  const out = new Map<number, JsonCol[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  for (const col of JSON_COLS) {
    const rows = await db.catalogCourse.findMany({
      where: { id: { in: ids }, [col]: { equals: Prisma.DbNull } },
      select: { id: true },
    });
    for (const r of rows) out.get(r.id)!.push(col);
  }
  return out;
}

type DbRow = { id: number; course: { normalizedCode: string } | null } & RowState;

function toPlanRow(r: DbRow): PlanRow {
  return {
    id: r.id,
    code: r.course?.normalizedCode ?? null,
    semester: r.suggestedSemester,
    sortIndex: r.sortIndex,
    prereqText: r.prereqText,
    coreqText: r.coreqText,
    prereqTree: (r.prereqTree as ReqNode | null) ?? null,
    coreqTree: (r.coreqTree as ReqNode | null) ?? null,
    lockedFields: (r.lockedFields as string[] | null) ?? [],
  };
}
const stateOf = (r: DbRow): RowState => ({
  suggestedSemester: r.suggestedSemester, sortIndex: r.sortIndex,
  prereqText: r.prereqText, prereqTree: r.prereqTree,
  coreqText: r.coreqText, coreqTree: r.coreqTree, lockedFields: r.lockedFields,
});

const dbSelect = { id: true, course: { select: { normalizedCode: true } }, ...STATE_SELECT } as const;

/** Code dictionary = the latest applied Registro run; null if none was ever applied. */
export async function loadDictionary(): Promise<Set<string> | null> {
  const run = await prisma.registroImport.findFirst({
    where: { status: "applied" }, orderBy: { id: "desc" }, select: { id: true },
  });
  if (!run) return null;
  const rows = await prisma.registroCourse.findMany({
    where: { importId: run.id }, select: { normalizedCode: true },
  });
  return new Set(rows.map((r) => r.normalizedCode));
}

const codesOf = (rows: PlanRow[]) => {
  const s = new Set<string>();
  for (const r of rows) {
    collectCourseCodes(r.prereqTree, s);
    collectCourseCodes(r.coreqTree, s);
  }
  return s;
};

/** Everything the canvas needs to edit one plan, with the versions to send back. */
export async function loadMapView(slug: string) {
  const cat = await prisma.catalog.findUnique({ where: { slug }, select: { id: true, slug: true, programName: true, variantLabel: true } });
  if (!cat) throw new BatchError("Catálogo no encontrado.", 404);
  const dbRows = await prisma.catalogCourse.findMany({
    where: { catalogId: cat.id }, orderBy: { sortIndex: "asc" },
    select: {
      ...dbSelect, displayCode: true, name: true, credits: true, courseType: true,
      isPlaceholder: true, placeholderKind: true, placeholderLabel: true,
    },
  });
  const plan = dbRows.map((r) => toPlanRow(r));
  return {
    catalog: cat,
    rows: dbRows.map(({ course: _c, ...r }, i) => {
      void _c;
      return {
        ...r,
        code: plan[i].code,
        version: rowVersion(plan[i]),
        // text present but no tree = the parser could not read it (the canvas must show it, not hide it)
        prereqUnparsed: !!r.prereqText && !plan[i].prereqTree,
        coreqUnparsed: !!r.coreqText && !plan[i].coreqTree,
      };
    }),
    orderVersion: orderVersion(plan),
  };
}

export interface ApplyOutcome {
  editId: number;
  changedRows: number;
  snapshotId: number | null;
  warnings: string[];
}

export async function applyMapBatch(batch: MapBatch, actor: string): Promise<ApplyOutcome> {
  if (!batch || typeof batch.catalogSlug !== "string" || !Array.isArray(batch.ops))
    throw new BatchError("Lote inválido.", 400);
  const cat = await prisma.catalog.findUnique({ where: { slug: batch.catalogSlug }, select: { id: true } });
  if (!cat) throw new BatchError("Catálogo no encontrado.", 404);

  const rows0 = (await prisma.catalogCourse.findMany({ where: { catalogId: cat.id }, select: dbSelect })).map(toPlanRow);
  const touched = new Set<number>();
  for (const op of batch.ops) if (op && typeof op.courseId === "number") touched.add(op.courseId);
  const hasMove = batch.ops.some((o) => o?.op === "move");

  checkVersions(rows0, batch, touched, hasMove);

  const result = planBatch(rows0, batch.ops);
  if (result.changed.size === 0) throw new BatchError("El lote no cambia nada.", 422);

  // validate the end state; only NEW problems block (existing data may already be imperfect)
  const dictionary = await loadDictionary();
  const issuesBefore = validatePlan(planNodes(rows0), { dictionary });
  const issuesAfter = validatePlan(planNodes(result.rows), {
    dictionary, sortIndexes: result.rows.map((r) => r.sortIndex),
  });
  const knownBefore = new Set(issuesBefore.map((i) => i.message));
  const fresh = issuesAfter.filter((i) => !knownBefore.has(i.message));
  const errors = fresh.filter((i) => i.severity === "error");
  if (errors.length) throw new BatchError(errors.map((e) => e.message).join("; "), 422, { issues: errors });
  const inPlan = new Set(result.rows.map((r) => r.code).filter(Boolean) as string[]);
  const before = codesOf(rows0);
  const allow = new Set((batch.allowUnknown ?? []).map(String));
  const unknown = [...codesOf(result.rows)].filter(
    (c) => !before.has(c) && !isKnownCode(c, inPlan, dictionary) && !allow.has(c)
  );
  if (unknown.length)
    throw new BatchError(
      `Códigos fuera del Registro: ${unknown.join(", ")}. Confirma para agregarlos.`, 409, { unknownCodes: unknown }
    );
  const warnings = fresh.filter((i) => i.severity === "warning").map((i) => i.message);

  // snapshot (the student view, for audit) before touching anything
  const payload = await buildCatalogPayload(batch.catalogSlug);
  const snap = payload
    ? await prisma.catalogSnapshot.create({
        data: { catalogId: cat.id, payload: payload as object, reason: "pre-map", createdBy: actor },
      })
    : null;

  const ids = [...result.changed.keys()];
  const undoRows: UndoRow[] = [];

  await prisma.$transaction(
    async (tx) => {
      // lock the plan, then re-check versions against what we just locked
      // serialise concurrent batches on this plan: writing the catalog row takes a row lock (portable;
      // no raw SQL) held until commit, and everything below is read after it is acquired
      await tx.catalog.update({ where: { id: cat.id }, data: { updatedAt: new Date() } });
      const locked = await tx.catalogCourse.findMany({ where: { catalogId: cat.id }, select: dbSelect });
      checkVersions(locked.map(toPlanRow), batch, touched, hasMove);
      const sqlNulls = await sqlNullColumns(tx, ids);
      const lockedById = new Map(locked.map((r) => [r.id, r]));

      // phase 1: park every row whose sortIndex changes on a unique negative value
      const reindexed = result.rows.filter((r) => lockedById.get(r.id)!.sortIndex !== r.sortIndex);
      for (const r of reindexed)
        await tx.catalogCourse.update({ where: { id: r.id }, data: { sortIndex: -r.id - 1 } });

      for (const id of ids) {
        const next = result.rows.find((r) => r.id === id)!;
        const cur = lockedById.get(id)!;
        const fields = result.changed.get(id)!;
        const pins = new Set<string>(((cur.lockedFields as string[] | null) ?? []).map(String));
        const pinsBefore = pins.size;
        fields.forEach((f) => pins.add(f));
        const data: Prisma.CatalogCourseUncheckedUpdateInput = {
          suggestedSemester: next.semester,
          sortIndex: next.sortIndex,
        };
        // untouched columns keep their exact SQL value (incl. SQL NULL vs JSON null)
        if (canon(next.prereqTree) !== canon(cur.prereqTree) || next.prereqText !== cur.prereqText) {
          data.prereqText = next.prereqText;
          data.prereqTree = (next.prereqTree ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
        }
        if (canon(next.coreqTree) !== canon(cur.coreqTree) || next.coreqText !== cur.coreqText) {
          data.coreqText = next.coreqText;
          data.coreqTree = (next.coreqTree ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
        }
        if (pins.size !== pinsBefore) data.lockedFields = [...pins] as unknown as Prisma.InputJsonValue;
        await tx.catalogCourse.update({ where: { id }, data });
        const after = await tx.catalogCourse.findUniqueOrThrow({ where: { id }, select: STATE_SELECT });
        undoRows.push({ id, before: stateOf(cur), after, sqlNull: sqlNulls.get(id) ?? [] });
      }
    },
    // READ COMMITTED (Postgres' default; MySQL defaults to REPEATABLE READ, whose snapshot is fixed before the
    // lock wait and would hide the winner's commit from the re-check below)
    { timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );

  const payloadUndo: UndoPayload = { rows: undoRows, snapshotId: snap?.id ?? null };
  const edit = await prisma.mapEdit.create({
    data: {
      catalogId: cat.id, actor, ops: batch.ops as unknown as Prisma.InputJsonValue,
      undo: payloadUndo as unknown as Prisma.InputJsonValue, snapshotId: snap?.id ?? null,
    },
  });
  await writeAudit({
    actor, action: "map.apply", entityType: "Catalog", entityId: batch.catalogSlug,
    after: { editId: edit.id, ops: batch.ops.length, rows: ids.length, snapshotId: snap?.id ?? null },
  });
  return { editId: edit.id, changedRows: ids.length, snapshotId: snap?.id ?? null, warnings };
}

function checkVersions(rows: PlanRow[], batch: MapBatch, touched: Set<number>, hasMove: boolean) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const stale: number[] = [];
  for (const id of touched) {
    const row = byId.get(id);
    if (!row) throw new BatchError(`Curso ${id} no está en este plan.`, 404);
    const v = batch.versions?.[id];
    if (typeof v !== "string") throw new BatchError(`Falta la versión del curso ${id}.`, 400);
    if (v !== rowVersion(row)) stale.push(id);
  }
  if (hasMove) {
    if (typeof batch.orderVersion !== "string") throw new BatchError("Falta orderVersion para mover cursos.", 400);
    if (batch.orderVersion !== orderVersion(rows)) stale.push(-1);
  }
  if (stale.length)
    throw new BatchError(
      "El plan cambió desde que lo abriste (otra edición). Recarga y vuelve a intentar; no se escribió nada.",
      409, { stale }
    );
}

const jsonOrNull = (v: unknown, sqlNull: boolean) =>
  v == null ? (sqlNull ? Prisma.DbNull : Prisma.JsonNull) : (v as Prisma.InputJsonValue);

/** Restore every row a batch touched; all-or-nothing, refuses on later edits unless forced. */
export async function undoMapEdit(
  editId: number,
  opts: { force?: boolean; actor: string }
): Promise<{ restored: number; conflicts: number[] }> {
  const edit = await prisma.mapEdit.findUnique({ where: { id: editId } });
  if (!edit) throw new BatchError("Edición no encontrada.", 404);
  if (edit.status !== "applied") throw new BatchError("Esta edición ya fue deshecha.", 409);
  const undo = edit.undo as unknown as UndoPayload;

  const conflictsOf = (cur: Map<number, { id: number } & RowState>) =>
    undo.rows
      .filter((u) => {
        const c = cur.get(u.id);
        if (!c) return true;
        const { id: _i, ...state } = c;
        void _i;
        return canon(state) !== canon(u.after);
      })
      .map((u) => u.id);
  const load = async (db: Prisma.TransactionClient | typeof prisma) =>
    new Map(
      (await db.catalogCourse.findMany({
        where: { id: { in: undo.rows.map((u) => u.id) } }, select: { id: true, ...STATE_SELECT },
      })).map((r) => [r.id, r])
    );
  const refuse = (conflicts: number[]) =>
    new BatchError(
      `${conflicts.length} curso(s) se editaron después; no se deshizo nada. Revisa o fuerza.`, 409, { conflicts }
    );

  // fast refusal before taking any lock
  const early = conflictsOf(await load(prisma));
  if (early.length && !opts.force) throw refuse(early);

  let toRestore: UndoRow[] = [];
  let conflicts: number[] = [];
  await prisma.$transaction(
    async (tx) => {
      // same serialisation as apply: lock the plan, then decide on what is committed *now*
      await tx.catalog.update({ where: { id: edit.catalogId }, data: { updatedAt: new Date() } });
      const current = await load(tx);
      conflicts = conflictsOf(current);
      if (conflicts.length && !opts.force) throw refuse(conflicts);
      toRestore = undo.rows.filter((u) => current.has(u.id));
      for (const u of toRestore)
        await tx.catalogCourse.update({ where: { id: u.id }, data: { sortIndex: -u.id - 1 } });
      for (const u of toRestore) {
        const b = u.before;
        const nul = (c: JsonCol) => u.sqlNull.includes(c);
        await tx.catalogCourse.update({
          where: { id: u.id },
          data: {
            suggestedSemester: b.suggestedSemester,
            sortIndex: b.sortIndex,
            prereqText: b.prereqText,
            prereqTree: jsonOrNull(b.prereqTree, nul("prereqTree")),
            coreqText: b.coreqText,
            coreqTree: jsonOrNull(b.coreqTree, nul("coreqTree")),
            lockedFields: jsonOrNull(b.lockedFields, nul("lockedFields")),
          },
        });
      }
      await tx.mapEdit.update({ where: { id: editId }, data: { status: "undone", undoneAt: new Date() } });
    },
    { timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
  await writeAudit({
    actor: opts.actor, action: "map.undo", entityType: "MapEdit", entityId: editId,
    after: { restored: toRestore.length, forced: !!opts.force, conflicts },
  });
  return { restored: toRestore.length, conflicts };
}

export async function listMapEdits(slug: string, limit = 20) {
  return prisma.mapEdit.findMany({
    where: { catalog: { slug } }, orderBy: { id: "desc" }, take: limit,
    select: { id: true, actor: true, status: true, createdAt: true, undoneAt: true, ops: true },
  });
}

export interface DictionaryInfo {
  importId: number | null;
  /** newest period among the dictionary rows (e.g. "202620") */
  period: string | null;
  /** the term the plan's offerings are synced against */
  planTerm: string;
  /** decision 4: no age warning; the dictionary is current while it covers the plan's term */
  coversCurrentTerm: boolean;
  entries: { code: string; name: string; credits: number | null; period: string }[];
}

export async function loadDictionaryInfo(planTerm: string): Promise<DictionaryInfo> {
  const run = await prisma.registroImport.findFirst({
    where: { status: "applied" }, orderBy: { id: "desc" }, select: { id: true },
  });
  if (!run) return { importId: null, period: null, planTerm, coversCurrentTerm: false, entries: [] };
  const rows = await prisma.registroCourse.findMany({
    where: { importId: run.id }, orderBy: { normalizedCode: "asc" },
    select: { normalizedCode: true, nameEs: true, credits: true, period: true },
  });
  const period = rows.reduce<string | null>((m, r) => (m === null || r.period > m ? r.period : m), null);
  return {
    importId: run.id, period, planTerm,
    coversCurrentTerm: period !== null && period >= planTerm,
    entries: rows.map((r) => ({ code: r.normalizedCode, name: r.nameEs, credits: r.credits, period: r.period })),
  };
}
