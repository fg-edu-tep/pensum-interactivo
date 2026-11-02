// Registro's semester-exclusion restriction, read as a credit requirement
// (agreed 2026-10-29). The "Restricción de periodo" column says e.g.
//
//   EXCLUYE INGRESA A PRIMER SEMESTRE & EXCLUYE INGRESA A SEGUNDO SEMESTRE &
//   EXCLUYE INGRESA A  TERCER SEMESTRE & EXCLUYE INGRESA A CUARTO SEMESTRE
//
// Read literally it counts semesters enrolled (someone enrolled 4 semesters
// who never passed Cálculo would qualify). The coordinator wants the student
// to take it when actually advanced, so: required approved credits =
// 15 × (highest excluded semester). "Excluye 1–4" → 60 credits. 15 is an
// agreed constant (the real average is ~17). "EXCLUYE ESTUDIANTE NUEVO" is
// read as "no primer semestre" (n ≥ 1). INCLUYE clauses are ignored. Pure.

import { foldAccents } from "./textMatch";

export const CREDITS_PER_SEMESTER = 15;

const ORDINAL: Record<string, number> = {
  PRIMER: 1, PRIMERO: 1,
  SEGUNDO: 2,
  TERCER: 3, TERCERO: 3,
  CUARTO: 4,
  QUINTO: 5,
  SEXTO: 6,
  SEPTIMO: 7, SETIMO: 7,
  OCTAVO: 8,
  NOVENO: 9,
  DECIMO: 10,
};

/** Highest semester excluded by "EXCLUYE INGRESA A <n> SEMESTRE", or 0. */
export function highestExcludedSemester(restriction: string | null | undefined): number {
  if (!restriction) return 0;
  let max = 0;
  for (const clause of foldAccents(restriction).toUpperCase().split("&")) {
    if (/EXCLUYE\s+ESTUDIANTE\s+NUEVO/.test(clause)) {
      max = Math.max(max, 1);
      continue;
    }
    // "EXCLUYE INGRESA A  TERCER SEMESTRE" (Registro pads with spaces) or "… A SEMESTRE 12"
    const m = clause.match(/EXCLUYE\s+INGRESA\s+A\s+(?:SEMESTRE\s+(\d+)|(\w+)\s+SEMESTRE)/);
    if (!m) continue;
    const word = m[1] ?? m[2];
    const n = ORDINAL[word] ?? (/^\d+$/.test(word) ? Number(word) : 0);
    max = Math.max(max, n);
  }
  return max;
}

/** { semesters, minCredits } for a restriction text, or null when it has none. */
export function restrictionToCredits(restriction: string | null | undefined): { semesters: number; minCredits: number } | null {
  const n = highestExcludedSemester(restriction);
  return n > 0 ? { semesters: n, minCredits: CREDITS_PER_SEMESTER * n } : null;
}
