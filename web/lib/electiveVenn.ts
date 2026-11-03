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

// ---- the role matrix (2026-11: replaces the circles) ----
// A summary bar on top (to scale, each part filters the list) and one row per
// course with a cell per program × role, plus when it is taught. With both
// programs the bar splits by program (the few courses that differ); with one
// program it splits by role, the distinction students get wrong.

export type ProgramView = "ambos" | "elc" | "ele";
/** summary-bar parts: by program (ambos) or by role (one program) */
export type MatrixPart = "both" | "elc" | "ele" | "ei" | "i" | "e";

export interface MatrixRow {
  e: VennElective;
  /** the program cells shown, null = "no aplica" there */
  elc: ProgramTag | null;
  ele: ProgramTag | null;
  part: MatrixPart;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const roleBits = (t: ProgramTag | null) => (t ? (t.electiva ? 1 : 0) | (t.integrador ? 2 : 0) : 0);
const rolePart = (bits: number): MatrixPart => (bits === 3 ? "ei" : bits === 2 ? "i" : "e");

export interface MatrixFilters {
  program: ProgramView;
  type: VennType;
  term: string | null;
  query?: string;
}

/** Rows before the summary-bar part filter, plus the part of each. */
export function matrixBase(list: VennElective[], f: MatrixFilters): MatrixRow[] {
  const q = fold((f.query ?? "").trim());
  const out: MatrixRow[] = [];
  for (const e of list) {
    if (f.term && !e.offeredTerms.includes(f.term)) continue;
    if (q && !fold(`${e.name} ${e.code ?? ""}`).includes(q) && !fold((e.code ?? "").replace(/^([A-Z]+)/, "$1 ")).includes(q)) continue;
    const elc = f.program !== "ele" && passes(e.elc, f.type) ? e.elc : null;
    const ele = f.program !== "elc" && passes(e.ele, f.type) ? e.ele : null;
    if (!elc && !ele) continue;
    const part: MatrixPart =
      f.program === "ambos" ? (elc && ele ? "both" : elc ? "elc" : "ele") : rolePart(roleBits(elc ?? ele));
    // the tags stay whole whatever the type filter (2026-10-29 §2.1)
    out.push({ e, elc: elc ? e.elc : null, ele: ele ? e.ele : null, part });
  }
  // differences between programs first, then electiva + integrador, solo
  // integrador, solo electiva — the order a student needs to notice them
  const rank = (r: MatrixRow) => {
    const differs = f.program === "ambos" && r.part !== "both" ? 0 : 1;
    const bits = roleBits(r.elc) | roleBits(r.ele);
    return differs * 10 + (bits === 3 ? 0 : bits === 2 ? 1 : 2);
  };
  return out.sort((a, b) => rank(a) - rank(b) || a.e.name.localeCompare(b.e.name, "es"));
}

/** The summary bar's parts, in display order, with counts (zeros kept so the bar is stable). */
export function matrixSummary(rows: MatrixRow[], program: ProgramView): { part: MatrixPart; count: number }[] {
  const order: MatrixPart[] = program === "ambos" ? ["both", "elc", "ele"] : ["e", "ei", "i"];
  return order.map((part) => ({ part, count: rows.filter((r) => r.part === part).length }));
}
