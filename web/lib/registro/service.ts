// DB-facing orchestration for the Registro import wizard. All decisions live in
// the pure modules next to this file; this one only loads/stores and applies.
//
// Lifecycle of a RegistroImport:  parsed -> (scope/resolutions edited)* -> applied | discarded
//  - upload   : parse (~7 s) + reduce + store dictionary rows + keep the xlsx bytes
//  - scope    : re-parse the kept bytes with new options, replace the dictionary
//  - apply    : snapshot each changed catalog, write changes in ONE transaction, audit
// The xlsx bytes are dropped on apply/discard; the dictionary rows stay (the latest
// applied run is the code dictionary Phase B reads).

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { buildCatalogPayload } from "../catalogPayload";
import { parseRequirement } from "../import/requirementParser";
import { analyzeRegistro, pendingDecisions, planLinks, validateResolutions, type LinkPlan, type Resolutions } from "./analyze";
import { parseRegistroWorkbook } from "./parse";
import { reduceRegistro } from "./reduce";
import { parseCoreq } from "./requirements";
import { loadCourseInputs } from "../discrepancy/service";
import { annotateCourse, apiMentions, type StudentImpact } from "../discrepancy/wizard";
import {
  DEFAULT_SCOPE,
  type CatalogInput,
  type DictionaryEntry,
  type ParseStats,
  type ReduceStats,
  type ScopeOptions,
  type TermWindow,
  type UnresolvedItem,
} from "./types";

export class RegistroError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ------------------------------------------------------------------ loading

export async function loadCatalogInputs(): Promise<CatalogInput[]> {
  const catalogs = await prisma.catalog.findMany({
    orderBy: { slug: "asc" },
    include: {
      courses: {
        orderBy: { sortIndex: "asc" },
        include: { course: { select: { normalizedCode: true } } },
      },
    },
  });
  return catalogs.map((c) => ({
    slug: c.slug,
    courses: c.courses.map((cc) => ({
      id: cc.id,
      displayCode: cc.displayCode,
      code: cc.isPlaceholder ? null : (cc.course?.normalizedCode ?? null),
      name: cc.name,
      credits: cc.credits,
      isPlaceholder: cc.isPlaceholder,
      placeholderKind: cc.placeholderKind,
      prereqText: cc.prereqText,
      coreqText: cc.coreqText,
      manuallyEdited: cc.manuallyEdited,
      lockedFields: (cc.lockedFields as string[] | null) ?? [],
    })),
  }));
}

function boundCodes(catalogs: CatalogInput[]): string[] {
  return [...new Set(catalogs.flatMap((c) => c.courses.map((x) => x.code).filter((x): x is string => !!x)))];
}

async function loadEntries(importId: number): Promise<Map<string, DictionaryEntry>> {
  const rows = await prisma.registroCourse.findMany({ where: { importId }, orderBy: { normalizedCode: "asc" } });
  return new Map(
    rows.map((r) => [
      r.normalizedCode,
      {
        code: r.normalizedCode,
        displayCode: r.displayCode,
        name: r.nameEs,
        credits: r.credits,
        departamento: r.departamento,
        nivel: r.nivel,
        period: r.period,
        prereqText: r.prereqText ?? "",
        coreqText: r.coreqText ?? "",
        restrictions: (r.restrictions as Record<string, string> | null) ?? {},
        isCore: r.isCore,
      } satisfies DictionaryEntry,
    ])
  );
}

// ------------------------------------------------------------------ create / reprocess

function storeEntries(importId: number, entries: Map<string, DictionaryEntry>): Prisma.RegistroCourseCreateManyInput[] {
  return [...entries.values()].map((e) => ({
    importId,
    normalizedCode: e.code,
    displayCode: e.displayCode.slice(0, 64),
    nameEs: e.name.slice(0, 500),
    credits: e.credits,
    departamento: e.departamento.slice(0, 200),
    nivel: e.nivel.slice(0, 16),
    period: e.period,
    prereqText: e.prereqText || null,
    coreqText: e.coreqText || null,
    restrictions: json(e.restrictions),
    isCore: e.isCore,
  }));
}

export async function createImport(file: { name: string; bytes: Buffer }, actor: string): Promise<number> {
  const { rows, stats } = parseRegistroWorkbook(file.bytes);
  const catalogs = await loadCatalogInputs();
  const scope: ScopeOptions = { ...DEFAULT_SCOPE };
  const red = reduceRegistro(rows, scope, boundCodes(catalogs));
  if (!red.window) {
    throw new RegistroError(
      "El archivo no contiene filas del departamento esperado (Ingeniería Eléctrica y Electrónica) en ningún semestre regular."
    );
  }

  const rec = await prisma.registroImport.create({
    data: {
      filename: file.name,
      uploadedBy: actor,
      status: "parsed",
      fileBytes: new Uint8Array(file.bytes),
      scope: json(scope),
      termWindow: json(red.window),
      parseStats: json(stats),
      reduceStats: json(red.stats),
    },
  });
  await prisma.registroCourse.createMany({ data: storeEntries(rec.id, red.entries) });
  await writeAudit({
    actor,
    action: "registro.upload",
    entityType: "RegistroImport",
    entityId: rec.id,
    after: { filename: file.name, window: red.window.selectedRegular, parse: stats, reduce: red.stats },
  });
  return rec.id;
}

export async function reprocessImport(id: number, patch: Partial<ScopeOptions>, actor?: string): Promise<void> {
  const rec = await prisma.registroImport.findUnique({ where: { id } });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  if (rec.status !== "parsed") throw new RegistroError("Esta importación ya no se puede modificar.", 409);
  if (!rec.fileBytes) throw new RegistroError("El archivo original ya no está disponible.", 409);

  const scope: ScopeOptions = { ...(rec.scope as unknown as ScopeOptions), ...patch };
  if (!scope.levels.length) throw new RegistroError("Elige al menos un nivel (PREG / POST).");
  const { rows } = parseRegistroWorkbook(Buffer.from(rec.fileBytes));
  const catalogs = await loadCatalogInputs();
  const red = reduceRegistro(rows, scope, boundCodes(catalogs));
  if (!red.window) throw new RegistroError("Con ese alcance no queda ningún semestre regular con cursos del departamento.");

  // keep only decisions whose item still exists under the new scope
  const entries = red.entries;
  const items = analyzeRegistro(entries, catalogs);
  const keys = new Set(items.map((i) => i.key));
  const kept = Object.fromEntries(
    Object.entries((rec.resolutions as Resolutions | null) ?? {}).filter(([k]) => keys.has(k))
  );

  await prisma.$transaction(async (tx) => {
    await tx.registroCourse.deleteMany({ where: { importId: id } });
    await tx.registroCourse.createMany({ data: storeEntries(id, entries) });
    await tx.registroImport.update({
      where: { id },
      data: {
        scope: json(scope),
        termWindow: json(red.window),
        reduceStats: json(red.stats),
        resolutions: json(kept),
      },
    });
  });
  await writeAudit({
    actor,
    action: "registro.scope",
    entityType: "RegistroImport",
    entityId: id,
    after: { levels: scope.levels, window: red.window.selectedRegular, reduce: red.stats },
  });
}

export async function saveResolutions(id: number, resolutions: Resolutions, actor?: string): Promise<void> {
  const rec = await prisma.registroImport.findUnique({ where: { id }, select: { status: true } });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  if (rec.status !== "parsed") throw new RegistroError("Esta importación ya no se puede modificar.", 409);

  const [entries, catalogs] = await Promise.all([loadEntries(id), loadCatalogInputs()]);
  const items = analyzeRegistro(entries, catalogs);
  const errors = validateResolutions(items, resolutions, entries);
  if (errors.length) throw new RegistroError(errors.join(" "));
  await prisma.registroImport.update({ where: { id }, data: { resolutions: json(resolutions) } });
  await writeAudit({ actor, action: "registro.resolve", entityType: "RegistroImport", entityId: id, after: resolutions });
}

// ------------------------------------------------------------------ view

export interface ImportView {
  id: number;
  filename: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  scope: ScopeOptions;
  window: TermWindow | null;
  parseStats: ParseStats | null;
  reduceStats: ReduceStats | null;
  entries: DictionaryEntry[];
  items: UnresolvedItem[];
  resolutions: Resolutions;
  pending: string[];
  plan: LinkPlan;
  /** catalogCourseId -> what students will see for each planned requirement change */
  impact: Record<number, StudentImpact[]>;
  /** "ref-missing:CODE" -> courses whose OFFICIAL API expression still lists CODE */
  apiMentions: Record<string, string[]>;
  applyResult: unknown;
  canRescope: boolean;
}

export async function getImportView(id: number, opts: { force?: boolean; slugs?: string[] } = {}): Promise<ImportView> {
  const rec = await prisma.registroImport.findUnique({
    where: { id },
    select: {
      id: true, filename: true, status: true, createdAt: true, appliedAt: true, scope: true,
      termWindow: true, parseStats: true, reduceStats: true, resolutions: true, applyResult: true,
    },
  });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  const hasBytes = (await prisma.registroImport.count({ where: { id, fileBytes: { not: null } } })) > 0;

  const [entries, catalogs, courseInputs] = await Promise.all([loadEntries(id), loadCatalogInputs(), loadCourseInputs()]);
  const items = analyzeRegistro(entries, catalogs);
  const resolutions = (rec.resolutions as Resolutions | null) ?? {};
  const plan = planLinks(entries, catalogs, items, resolutions, opts);
  const inputById = new Map([...courseInputs.values()].flatMap((c) => c.inputs).map((i) => [i.catalogCourseId, i] as const));
  const impact: Record<number, StudentImpact[]> = {};
  for (const cp of plan.courses) {
    if (!cp.changes.length) continue;
    const a = annotateCourse(cp, inputById.get(cp.catalogCourseId));
    if (a.length) impact[cp.catalogCourseId] = a;
  }
  const mentions = apiMentions(items, [...inputById.values()]);
  return {
    id: rec.id,
    filename: rec.filename,
    status: rec.status,
    createdAt: rec.createdAt.toISOString(),
    appliedAt: rec.appliedAt?.toISOString() ?? null,
    scope: rec.scope as unknown as ScopeOptions,
    window: rec.termWindow as unknown as TermWindow | null,
    parseStats: rec.parseStats as unknown as ParseStats | null,
    reduceStats: rec.reduceStats as unknown as ReduceStats | null,
    entries: [...entries.values()],
    items,
    resolutions,
    pending: pendingDecisions(items, resolutions).map((i) => i.key),
    plan,
    impact,
    apiMentions: mentions,
    applyResult: rec.applyResult
      ? (() => {
          const { undo, ...rest } = rec.applyResult as unknown as ApplyResult & { undoneAt?: string };
          return { ...rest, undoRows: undo?.length ?? 0 };
        })()
      : null,
    canRescope: rec.status === "parsed" && hasBytes,
  };
}

// ------------------------------------------------------------------ apply / discard

export interface UndoRow {
  id: number;
  slug: string;
  displayCode: string;
  /** exact column values before apply (for restore) */
  before: RowState;
  /** which JSON columns were SQL NULL (vs JSON null) before apply */
  sqlNull: NullableJsonCol[];
  /** exact column values right after apply (to detect later edits) */
  after: RowState;
}
export interface RowState {
  prereqText: string | null;
  prereqTree: unknown;
  coreqText: string | null;
  coreqTree: unknown;
  name: string;
  credits: number;
  courseId: number | null;
  displayCode: string;
  lockedFields: unknown;
}
/** JSON columns whose null must be restored as SQL NULL (not JSON null) */
type NullableJsonCol = "prereqTree" | "coreqTree" | "lockedFields";
const JSON_COLS: NullableJsonCol[] = ["prereqTree", "coreqTree", "lockedFields"];

/**
 * Prisma reads SQL NULL and JSON null both as null; ask the database which one it is, with Prisma's
 * DbNull filter (portable across MySQL and Postgres — no raw SQL).
 */
async function sqlNullColumns(ids: number[]): Promise<Map<number, NullableJsonCol[]>> {
  const out = new Map<number, NullableJsonCol[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  for (const col of JSON_COLS) {
    const rows = await prisma.catalogCourse.findMany({
      where: { id: { in: ids }, [col]: { equals: Prisma.DbNull } },
      select: { id: true },
    });
    for (const r of rows) out.get(r.id)!.push(col);
  }
  return out;
}
const ROW_SELECT = {
  prereqText: true, prereqTree: true, coreqText: true, coreqTree: true,
  name: true, credits: true, courseId: true, displayCode: true, lockedFields: true,
} as const;

export interface ApplyResult {
  perCatalog: { slug: string; changed: number; skipped: number; snapshotId: number | null }[];
  fieldsChanged: Record<string, number>;
  rebinds: number;
  lockedPinned: number;
  /** per-row before/after, so apply can be undone exactly (see undoImport) */
  undo: UndoRow[];
}

export async function applyImport(
  id: number,
  opts: { slugs: string[]; force?: boolean; actor?: string }
): Promise<ApplyResult> {
  const rec = await prisma.registroImport.findUnique({ where: { id }, select: { status: true, resolutions: true } });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  if (rec.status !== "parsed") throw new RegistroError("Esta importación ya fue aplicada o descartada.", 409);
  if (!opts.slugs.length) throw new RegistroError("Elige al menos un catálogo.");

  // re-plan from the live DB right now, so a concurrent edit can't be clobbered
  const [entries, catalogs] = await Promise.all([loadEntries(id), loadCatalogInputs()]);
  const known = new Set(catalogs.map((c) => c.slug));
  const unknown = opts.slugs.filter((s) => !known.has(s));
  if (unknown.length) throw new RegistroError(`Catálogo(s) desconocido(s): ${unknown.join(", ")}`);

  const items = analyzeRegistro(entries, catalogs);
  const resolutions = (rec.resolutions as Resolutions | null) ?? {};
  const pending = pendingDecisions(items, resolutions);
  if (pending.length) {
    throw new RegistroError(`Faltan ${pending.length} decisión(es) por resolver antes de aplicar.`, 409);
  }
  const plan = planLinks(entries, catalogs, items, resolutions, { force: opts.force, slugs: opts.slugs });

  const result: ApplyResult = { perCatalog: [], fieldsChanged: {}, rebinds: 0, lockedPinned: 0, undo: [] };
  const withChanges = plan.courses.filter((c) => c.changes.length);

  // exact pre-apply column values, for undo (the snapshot is the student VIEW —
  // live API prereqs win over document text there — so it can't restore these)
  const sqlNulls = await sqlNullColumns(withChanges.map((c) => c.catalogCourseId));
  const beforeRows = new Map(
    (await prisma.catalogCourse.findMany({
      where: { id: { in: withChanges.map((c) => c.catalogCourseId) } },
      select: { id: true, ...ROW_SELECT },
    })).map((r) => [r.id, r])
  );

  // snapshots first (read-only w.r.t. catalog data), one per catalog that will change
  const snapshotBySlug = new Map<string, number>();
  for (const slug of new Set(withChanges.map((c) => c.slug))) {
    const cat = await prisma.catalog.findUnique({ where: { slug }, select: { id: true } });
    const payload = await buildCatalogPayload(slug);
    if (!cat || !payload) continue;
    const snap = await prisma.catalogSnapshot.create({
      data: { catalogId: cat.id, payload: payload as object, reason: "pre-registro", createdBy: opts.actor ?? "admin" },
    });
    snapshotBySlug.set(slug, snap.id);
  }

  const lockedBefore = new Map(
    (await prisma.catalogCourse.findMany({
      where: { id: { in: withChanges.map((c) => c.catalogCourseId) } },
      select: { id: true, lockedFields: true },
    })).map((r) => [r.id, (r.lockedFields as string[] | null) ?? []])
  );

  await prisma.$transaction(
    async (tx) => {
      for (const cp of withChanges) {
        const entry = entries.get(cp.targetCode);
        const data: Prisma.CatalogCourseUncheckedUpdateInput = {};
        const pins = new Set<string>(lockedBefore.get(cp.catalogCourseId) ?? []);
        const before = pins.size;

        for (const ch of cp.changes) {
          result.fieldsChanged[ch.field] = (result.fieldsChanged[ch.field] ?? 0) + 1;
          switch (ch.field) {
            case "prereqText": {
              const text = ch.after == null ? "" : String(ch.after);
              data.prereqText = text || null;
              data.prereqTree = (parseRequirement(text) ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
              break;
            }
            case "coreqText": {
              const text = ch.after == null ? "" : String(ch.after);
              data.coreqText = text || null;
              data.coreqTree = (parseCoreq(text) ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
              break;
            }
            case "name":
              data.name = String(ch.after);
              break;
            case "credits":
              data.credits = Number(ch.after);
              break;
            case "binding": {
              if (!entry) break;
              const course = await tx.course.upsert({
                where: { normalizedCode: entry.code },
                create: { normalizedCode: entry.code, nameEs: entry.name, defaultCredits: entry.credits },
                update: {},
              });
              data.courseId = course.id;
              data.displayCode = entry.displayCode;
              result.rebinds++;
              break;
            }
          }
          // deliberate deviations from the registro are pinned so a re-run can't undo them
          if (ch.override) pins.add(ch.field === "binding" ? "displayCode" : ch.field);
        }
        if (pins.size !== before) {
          data.lockedFields = [...pins] as unknown as Prisma.InputJsonValue;
          result.lockedPinned += pins.size - before;
        }
        await tx.catalogCourse.update({ where: { id: cp.catalogCourseId }, data });
      }

      await tx.registroImport.update({
        where: { id },
        data: { status: "applied", appliedAt: new Date(), fileBytes: null },
      });
    },
    { timeout: 60_000 }
  );

  const afterRows = new Map(
    (await prisma.catalogCourse.findMany({
      where: { id: { in: withChanges.map((c) => c.catalogCourseId) } },
      select: { id: true, ...ROW_SELECT },
    })).map((r) => [r.id, r])
  );
  for (const cp of withChanges) {
    const b = beforeRows.get(cp.catalogCourseId);
    const a = afterRows.get(cp.catalogCourseId);
    if (!b || !a) continue;
    const { id: _b, ...bState } = b;
    const { id: _a, ...aState } = a;
    void _b; void _a;
    result.undo.push({
      id: cp.catalogCourseId, slug: cp.slug, displayCode: cp.displayCode,
      before: bState, sqlNull: sqlNulls.get(cp.catalogCourseId) ?? [], after: aState,
    });
  }

  for (const slug of opts.slugs) {
    result.perCatalog.push({
      slug,
      changed: plan.courses.filter((c) => c.slug === slug && c.changes.length).length,
      skipped: plan.courses.filter((c) => c.slug === slug && c.skipped).length,
      snapshotId: snapshotBySlug.get(slug) ?? null,
    });
  }
  await prisma.registroImport.update({ where: { id }, data: { applyResult: json(result) } });
  await writeAudit({
    actor: opts.actor,
    action: "registro.apply",
    entityType: "RegistroImport",
    entityId: id,
    after: { ...result, slugs: opts.slugs, force: !!opts.force },
  });
  return result;
}

/** JSON.stringify with recursively sorted keys — MySQL reorders object keys in JSON columns. */
function canon(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, walk(val)])
      );
    }
    return x ?? null;
  };
  return JSON.stringify(walk(v));
}
const sameJson = (a: unknown, b: unknown) => canon(a) === canon(b);
const jsonOrNull = (v: unknown) => (v == null ? Prisma.JsonNull : (v as unknown as Prisma.InputJsonValue));

/**
 * Restores every row apply touched to its exact pre-apply column values.
 * All-or-nothing: if any row was edited since apply (its current state no longer
 * matches what apply wrote) nothing is restored and the conflicts are returned,
 * unless `force` is set.
 */
export async function undoImport(
  id: number,
  opts: { force?: boolean; actor?: string } = {}
): Promise<{ restored: number; conflicts: { id: number; slug: string; displayCode: string }[] }> {
  const rec = await prisma.registroImport.findUnique({ where: { id }, select: { status: true, applyResult: true } });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  const applied = rec.applyResult as (ApplyResult & { undoneAt?: string }) | null;
  if (rec.status !== "applied" || !applied?.undo) {
    throw new RegistroError("Solo se puede deshacer una importación aplicada.", 409);
  }
  if (applied.undoneAt) throw new RegistroError("Esta importación ya fue deshecha.", 409);

  const current = new Map(
    (await prisma.catalogCourse.findMany({
      where: { id: { in: applied.undo.map((u) => u.id) } },
      select: { id: true, ...ROW_SELECT },
    })).map((r) => [r.id, r])
  );
  const conflicts: { id: number; slug: string; displayCode: string }[] = [];
  for (const u of applied.undo) {
    const cur = current.get(u.id);
    if (!cur) {
      conflicts.push({ id: u.id, slug: u.slug, displayCode: u.displayCode });
      continue;
    }
    const { id: _i, ...state } = cur;
    void _i;
    if (!sameJson(state, u.after)) conflicts.push({ id: u.id, slug: u.slug, displayCode: u.displayCode });
  }
  if (conflicts.length && !opts.force) {
    throw Object.assign(
      new RegistroError(
        `${conflicts.length} curso(s) se editaron después de aplicar; no se deshizo nada. Revisa o usa "forzar".`,
        409
      ),
      { conflicts }
    );
  }

  const toRestore = applied.undo.filter((u) => current.has(u.id));
  await prisma.$transaction(
    async (tx) => {
      for (const u of toRestore) {
        const b = u.before;
        // null restores as SQL NULL where it was SQL NULL, else as JSON null
        const nul = (col: NullableJsonCol, v: unknown) =>
          v == null ? ((u.sqlNull ?? []).includes(col) ? Prisma.DbNull : Prisma.JsonNull) : (v as Prisma.InputJsonValue);
        await tx.catalogCourse.update({
          where: { id: u.id },
          data: {
            prereqText: b.prereqText,
            prereqTree: nul("prereqTree", b.prereqTree),
            coreqText: b.coreqText,
            coreqTree: nul("coreqTree", b.coreqTree),
            name: b.name,
            credits: b.credits,
            courseId: b.courseId,
            displayCode: b.displayCode,
            lockedFields: nul("lockedFields", b.lockedFields),
          },
        });
      }
      await tx.registroImport.update({
        where: { id },
        data: { applyResult: json({ ...applied, undoneAt: new Date().toISOString() }) },
      });
    },
    { timeout: 60_000 }
  );
  await writeAudit({
    actor: opts.actor,
    action: "registro.undo",
    entityType: "RegistroImport",
    entityId: id,
    after: { restored: toRestore.length, forced: !!opts.force, conflicts },
  });
  return { restored: toRestore.length, conflicts };
}

export async function discardImport(id: number, actor?: string): Promise<void> {
  const rec = await prisma.registroImport.findUnique({ where: { id }, select: { status: true } });
  if (!rec) throw new RegistroError("Importación no encontrada.", 404);
  if (rec.status === "applied") throw new RegistroError("Una importación aplicada no se puede descartar.", 409);
  await prisma.registroImport.update({ where: { id }, data: { status: "discarded", fileBytes: null } });
  await prisma.registroCourse.deleteMany({ where: { importId: id } });
  await writeAudit({ actor, action: "registro.discard", entityType: "RegistroImport", entityId: id });
}
