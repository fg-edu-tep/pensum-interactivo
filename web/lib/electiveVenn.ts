// Sorts the elective bag into the TWO sets of the embeddable Venn diagram
// (/embed/electivas): electives of Eléctrica and of Electrónica — "both" is
// the intersection, derived, not stored (agreed 2026-10-29: no master's set;
// no master's-only course is a valid elective, and master's-level courses
// that count as electives sit in whichever set they belong to).
//
// Membership (official bag, 2026-11): the program's ELECTIVA or CINTEGRAD
// attribute, unless the course is OBLIGATORIA there. Older bags: the
// current-pensum role column (DESDE 2024-I) of each program holds an
// elective-type role. Obligatoria / proyecto de grado / práctica /
// pasantía rows, and rows that are only in the master's catalogue (role
// "maestría"), are part of the bag sheet but are not electives — they stay
// outside the circles. When the coordinator's classification file (one list
// per program) arrives, it replaces the role columns as the source.
// Pure + isomorphic so the server page and the client chart share it.

export const VENN_ELE = 1;
export const VENN_ELC = 2;

/** role words (RoleNorm) that make a bag row an elective for that program */
const ELECTIVE_ROLES = new Set(["electiva", "area_mayor", "curso_integrador", "cle"]);

export interface VennElectiveInput {
  id: number;
  name: string;
  code: string | null;
  level: string;
  ciclo: string | null;
  roles: { eleFrom2024?: { norm: string | null } | null; elcFrom2024?: { norm: string | null } | null } | null;
  offeredTerms: string[];
  isCursoIntegrador?: boolean;
  /** official bag (BOLSAS): per-program attributes; wins over `roles` */
  attrs?: Partial<Record<"IELE" | "IELC", { obligatoria?: boolean; electiva?: boolean; integrador?: boolean }>> | null;
  /** the bag's raw PROXIMO ("202810" | "SEM" | "NODEF" | null) */
  projection?: string | null;
}

/** What a course is worth to one program (2026-10-29: independent attributes —
 * integrador is NOT a subset of electiva). */
export interface ProgramTag {
  electiva: boolean;
  integrador: boolean;
}

export interface VennElective {
  id: number;
  name: string;
  code: string | null;
  ciclo: string | null;
  /** bit set of VENN_ELE | VENN_ELC; 0 = in neither set */
  mask: number;
  offeredTerms: string[];
  isCursoIntegrador: boolean;
  /** per program; absent = not valid for it (obligatoria there, or nothing) */
  ele: ProgramTag | null;
  elc: ProgramTag | null;
  projection: string | null;
}

const isElective = (cell: { norm: string | null } | null | undefined) =>
  !!cell?.norm && ELECTIVE_ROLES.has(cell.norm);

/** A course mandatory in a program's pensum is not one of its electives
 * (Electrónica de potencia: obligatoria in Eléctrica, electiva in Electrónica). */
export function programTag(e: VennElectiveInput, program: "IELE" | "IELC"): ProgramTag | null {
  const a = e.attrs?.[program];
  if (e.attrs) {
    if (!a || a.obligatoria || !(a.electiva || a.integrador)) return null;
    return { electiva: !!a.electiva, integrador: !!a.integrador };
  }
  const cell = program === "IELE" ? e.roles?.eleFrom2024 : e.roles?.elcFrom2024;
  if (!isElective(cell)) return null;
  return { electiva: cell!.norm !== "curso_integrador", integrador: cell!.norm === "curso_integrador" || !!e.isCursoIntegrador };
}

export function vennMask(e: VennElectiveInput): number {
  let m = 0;
  if (programTag(e, "IELE")) m |= VENN_ELE;
  if (programTag(e, "IELC")) m |= VENN_ELC;
  return m;
}

export function toVennElectives(rows: VennElectiveInput[]): VennElective[] {
  return rows.map((e) => {
    const ele = programTag(e, "IELE");
    const elc = programTag(e, "IELC");
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      ciclo: e.ciclo,
      mask: (ele ? VENN_ELE : 0) | (elc ? VENN_ELC : 0),
      offeredTerms: e.offeredTerms,
      isCursoIntegrador: !!(ele?.integrador || elc?.integrador || (!e.attrs && e.isCursoIntegrador)),
      ele,
      elc,
      projection: e.projection ?? null,
    };
  });
}

/** "Electiva + Integrador" | "Solo integrador" | "Solo electiva" */
export function tagText(t: ProgramTag): string {
  if (t.electiva && t.integrador) return "Electiva + Integrador";
  return t.integrador ? "Solo integrador" : "Solo electiva";
}

export type VennType = "todas" | "electivas" | "integradores";

/** Does the course count for `program` under the type filter? */
export function passes(t: ProgramTag | null, type: VennType): boolean {
  if (!t) return false;
  if (type === "electivas") return t.electiva;
  if (type === "integradores") return t.integrador;
  return true;
}

export interface VennRow {
  e: VennElective;
  ele: boolean;
  elc: boolean;
}

/** Rows of the list, aligned one to one by course (agreed 2026-10-29): with
 * both programs on, a course valid in one only leaves an empty slot in the
 * other column. Filters (type, period) apply to both columns at once. */
export function vennRows(
  list: VennElective[],
  opts: { programs: { ele: boolean; elc: boolean }; type: VennType; term: string | null }
): VennRow[] {
  const anyProgram = opts.programs.ele || opts.programs.elc;
  const showEle = anyProgram ? opts.programs.ele : true;
  const showElc = anyProgram ? opts.programs.elc : true;
  return list
    .filter((e) => !opts.term || e.offeredTerms.includes(opts.term))
    .map((e) => ({ e, ele: showEle && passes(e.ele, opts.type), elc: showElc && passes(e.elc, opts.type) }))
    .filter((r) => r.ele || r.elc)
    .sort((a, b) => a.e.name.localeCompare(b.e.name, "es"));
}

/** The 3 regions of a 2-set Venn, keyed by exact mask. */
export const VENN_REGIONS: { mask: number; label: string }[] = [
  { mask: VENN_ELE, label: "Solo Eléctrica" },
  { mask: VENN_ELE | VENN_ELC, label: "Eléctrica y Electrónica" },
  { mask: VENN_ELC, label: "Solo Electrónica" },
];

export function countByMask(list: VennElective[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of list) out.set(e.mask, (out.get(e.mask) ?? 0) + 1);
  return out;
}

export interface VennFilters {
  integrador: boolean;
  /** only electives in this semester's offering: ids the live API matched */
  offeredIds: Set<number> | null;
}

export function filterVenn(list: VennElective[], f: VennFilters): VennElective[] {
  return list.filter((e) => (!f.integrador || e.isCursoIntegrador) && (!f.offeredIds || f.offeredIds.has(e.id)));
}

/** Venn counts under the type / period filters (each program's set evaluated on its own tag). */
export function vennCounts(list: VennElective[], type: VennType, term: string | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of list) {
    if (term && !e.offeredTerms.includes(term)) continue;
    const m = (passes(e.ele, type) ? VENN_ELE : 0) | (passes(e.elc, type) ? VENN_ELC : 0);
    out.set(m, (out.get(m) ?? 0) + 1);
  }
  return out;
}
