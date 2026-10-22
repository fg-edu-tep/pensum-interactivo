// Sorts the elective bag into the three sets of the embeddable Venn diagram
// (/embed/electivas): electives of Eléctrica, of Electrónica, and maestría
// courses. Pure + isomorphic so the server page and the client chart share it.
//
// - Eléctrica / Electrónica: the current-pensum role column (DESDE 2024-I) of
//   that program holds an elective-type role. Obligatoria / proyecto de grado /
//   práctica / pasantía are part of the bag sheet but are not electives.
// - Maestría: listed in the bag's MAESTRÍA section, or a 4000-level code
//   (graduate numbering at Uniandes: MAIA 4341, IELE 4111…).

export const VENN_ELE = 1;
export const VENN_ELC = 2;
export const VENN_MAE = 4;

/** role words (RoleNorm) that make a bag row an elective for that program */
const ELECTIVE_ROLES = new Set(["electiva", "area_mayor", "curso_integrador", "cle", "maestria"]);

export interface VennElectiveInput {
  id: number;
  name: string;
  code: string | null;
  level: string;
  ciclo: string | null;
  roles: { eleFrom2024?: { norm: string | null } | null; elcFrom2024?: { norm: string | null } | null } | null;
  offeredTerms: string[];
}

export interface VennElective {
  id: number;
  name: string;
  code: string | null;
  ciclo: string | null;
  /** bit set of VENN_ELE | VENN_ELC | VENN_MAE; 0 = in none of the sets */
  mask: number;
  offeredTerms: string[];
}

const isElective = (cell: { norm: string | null } | null | undefined) =>
  !!cell?.norm && ELECTIVE_ROLES.has(cell.norm);

/** "MAIA4341" / "IELE 4111" → graduate (4000-level) course */
export function isGraduateCode(code: string | null): boolean {
  return /^[A-Z]{3,5}\s*-?\s*4\d{3}[A-Z]?$/i.test((code ?? "").trim());
}

export function vennMask(e: VennElectiveInput): number {
  let m = 0;
  if (isElective(e.roles?.eleFrom2024)) m |= VENN_ELE;
  if (isElective(e.roles?.elcFrom2024)) m |= VENN_ELC;
  if (e.level === "maestria" || isGraduateCode(e.code)) m |= VENN_MAE;
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
  }));
}

/** The 7 regions of a 3-set Venn, keyed by exact mask. */
export const VENN_REGIONS: { mask: number; label: string }[] = [
  { mask: VENN_ELE, label: "Solo Eléctrica" },
  { mask: VENN_ELC, label: "Solo Electrónica" },
  { mask: VENN_MAE, label: "Solo maestría" },
  { mask: VENN_ELE | VENN_ELC, label: "Eléctrica y Electrónica" },
  { mask: VENN_ELE | VENN_MAE, label: "Eléctrica y maestría" },
  { mask: VENN_ELC | VENN_MAE, label: "Electrónica y maestría" },
  { mask: VENN_ELE | VENN_ELC | VENN_MAE, label: "Las tres" },
];

export function countByMask(list: VennElective[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of list) out.set(e.mask, (out.get(e.mask) ?? 0) + 1);
  return out;
}
