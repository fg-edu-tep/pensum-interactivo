// Phase B1 — pure batch planner: given the plan's rows and a list of operations,
// compute the resulting rows (no I/O). The service validates and persists the
// result; the same function can run client-side for previews.

import type { ReqNode } from "../types";
import { collectCourseCodes } from "../import/requirementParser";
import { canonical, modelCodes, modelToText, modelToTree, type ReqModel } from "./model";
import type { MapOp, RequirementKind } from "./ops";
import type { PlanNode } from "./validate";

export interface PlanRow {
  id: number;
  /** normalised code of the bound course; null for placeholders / unbound slots */
  code: string | null;
  semester: number;
  sortIndex: number;
  prereqText: string | null;
  coreqText: string | null;
  prereqTree: ReqNode | null;
  coreqTree: ReqNode | null;
  lockedFields: string[];
}

export class BatchError extends Error {
  constructor(message: string, readonly status = 422, readonly detail?: unknown) {
    super(message);
  }
}

/** JSON.stringify with sorted keys (MySQL reorders object keys in JSON columns). */
export function canon(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object")
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, walk(val)])
      );
    return x ?? null;
  };
  return JSON.stringify(walk(v));
}

const CODE_RE = /^[A-ZÑ]{2,}\d{1,4}[A-Z]?$/;

export interface PlanResult {
  rows: PlanRow[];
  /** per changed row: the fields that were deliberately changed (these get pinned) */
  changed: Map<number, string[]>;
}

const sortByIndex = (rows: PlanRow[]) => [...rows].sort((a, b) => a.sortIndex - b.sortIndex);

function applyMove(rows: PlanRow[], op: Extract<MapOp, { op: "move" }>): PlanRow[] {
  const target = rows.find((r) => r.id === op.courseId);
  if (!target) throw new BatchError(`Curso ${op.courseId} no está en este plan.`, 404);
  if (!Number.isInteger(op.semester) || op.semester < 1) throw new BatchError(`Semestre inválido: ${op.semester}`);
  if (!Number.isInteger(op.position) || op.position < 0) throw new BatchError(`Posición inválida: ${op.position}`);

  const order = sortByIndex(rows);
  const slots = order.map((r) => r.sortIndex); // keep the same set of sortIndex values
  const without = order.filter((r) => r.id !== op.courseId);
  const inSem = without.filter((r) => r.semester === op.semester);
  const pos = Math.min(op.position, inSem.length);

  // insert before the row currently at `pos` in the target semester; otherwise after
  // the semester's last row; for an empty semester, before the first later semester.
  let at: number;
  if (pos < inSem.length) at = without.indexOf(inSem[pos]);
  else if (inSem.length) at = without.indexOf(inSem[inSem.length - 1]) + 1;
  else {
    const later = without.findIndex((r) => r.semester > op.semester);
    at = later === -1 ? without.length : later;
  }
  const moved: PlanRow = { ...target, semester: op.semester };
  const next = [...without.slice(0, at), moved, ...without.slice(at)];
  const byId = new Map(next.map((r, i) => [r.id, { ...r, sortIndex: slots[i] }]));
  return rows.map((r) => byId.get(r.id)!);
}

function applySetRequirement(rows: PlanRow[], op: Extract<MapOp, { op: "setRequirement" }>): PlanRow[] {
  const row = rows.find((r) => r.id === op.courseId);
  if (!row) throw new BatchError(`Curso ${op.courseId} no está en este plan.`, 404);
  const kind: RequirementKind = op.kind;
  if (kind !== "prereq" && kind !== "coreq") throw new BatchError(`Tipo de requisito inválido: ${kind}`);
  for (const c of modelCodes(op.model)) {
    if (!CODE_RE.test(c)) throw new BatchError(`Código inválido: "${c}"`, 422, { code: c });
  }
  const tree = modelToTree(op.model);
  const oldTree = kind === "prereq" ? row.prereqTree : row.coreqTree;
  if (canonical(tree) === canonical(oldTree)) return rows; // nothing semantically changed
  const text = modelToText(op.model) || null;
  return rows.map((r) =>
    r.id !== row.id
      ? r
      : kind === "prereq"
        ? { ...r, prereqText: text, prereqTree: tree }
        : { ...r, coreqText: text, coreqTree: tree }
  );
}

export function planBatch(rows: PlanRow[], ops: MapOp[]): PlanResult {
  if (!ops.length) throw new BatchError("El lote no tiene operaciones.", 400);
  let cur = rows.map((r) => ({ ...r }));
  for (const op of ops) {
    if (op.op === "move") cur = applyMove(cur, op);
    else if (op.op === "setRequirement") cur = applySetRequirement(cur, op);
    else throw new BatchError(`Operación desconocida: ${(op as { op: string }).op}`, 400);
  }
  const before = new Map(rows.map((r) => [r.id, r]));
  const changed = new Map<number, string[]>();
  for (const r of cur) {
    const b = before.get(r.id)!;
    const fields: string[] = [];
    if (r.semester !== b.semester) fields.push("suggestedSemester");
    if (canon(r.prereqTree) !== canon(b.prereqTree) || r.prereqText !== b.prereqText) fields.push("prereqText");
    if (canon(r.coreqTree) !== canon(b.coreqTree) || r.coreqText !== b.coreqText) fields.push("coreqText");
    const pinnable = fields.length > 0;
    if (pinnable || r.sortIndex !== b.sortIndex) changed.set(r.id, fields);
  }
  return { rows: cur, changed };
}

export function planNodes(rows: PlanRow[]): PlanNode[] {
  const out: PlanNode[] = [];
  for (const r of rows) {
    if (!r.code) continue;
    out.push({
      code: r.code,
      semester: r.semester,
      prereqs: [...collectCourseCodes(r.prereqTree)],
      coreqs: [...collectCourseCodes(r.coreqTree)],
    });
  }
  return out;
}
