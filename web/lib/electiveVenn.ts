// Sorts the elective bag into the TWO sets of the embeddable Venn diagram
// (/embed/electivas): electives of Eléctrica and of Electrónica — "both" is
// the intersection, derived, not stored (agreed 2026-10-29: no master's set;
// no master's-only course is a valid elective, and master's-level courses
// that count as electives sit in whichever set they belong to).
//
// Membership: the current-pensum role column (DESDE 2024-I) of each program
// holds an elective-type role. Obligatoria / proyecto de grado / práctica /
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
}

const isElective = (cell: { norm: string | null } | null | undefined) =>
  !!cell?.norm && ELECTIVE_ROLES.has(cell.norm);

export function vennMask(e: VennElectiveInput): number {
  let m = 0;
  if (isElective(e.roles?.eleFrom2024)) m |= VENN_ELE;
  if (isElective(e.roles?.elcFrom2024)) m |= VENN_ELC;
  return m;
}

export function toVennElectives(rows: VennElectiveInput[]): VennElective[] {
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.code,
    ciclo: e.ciclo,
    mask: vennMask(e),
    offeredTerms: e.offeredTerms,
    isCursoIntegrador: !!e.isCursoIntegrador,
  }));
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
