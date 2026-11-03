// "Se dicta en P" without the course API (agreed 2026-10-29 / Mauricio's email
// of 2026-10-29): the requisitos export lists, per period, every course that
// has prerequisites or corequisites and is open that period — so a row for P
// means it is taught in P. Courses with no requisites at all never appear
// there (IELE-2110), so for them, and for periods the export doesn't cover,
// the bag's projection (PROXIMO) decides:
//
//   row for P in the export                  → offered     (source "requisitos")
//   PROXIMO = P                              → offered     (source "proyeccion")
//   PROXIMO = SEM and P not covered          → offered     (source "proyeccion")
//   export covers P, has other rows, none P  → not offered (source "requisitos")
//   PROXIMO is another period / blank        → not offered (source "proyeccion")
//   anything else                            → unknown (no badge; the API decides)
//
// The live API, when it answers for P, always wins (CourseOffering.source).

import type { Projection } from "./bolsas";

export type OfferingStatus = "offered" | "not_offered" | "unknown";

export interface OfferingVerdict {
  status: OfferingStatus;
  source: "requisitos" | "proyeccion" | null;
}

export function offeringFor(
  periods: readonly string[], // periods the code has a row for in the export
  coveredPeriods: ReadonlySet<string>, // periods the export covers at all
  term: string,
  projection: Projection | null
): OfferingVerdict {
  if (periods.includes(term)) return { status: "offered", source: "requisitos" };
  if (projection?.kind === "term" && projection.term === term) return { status: "offered", source: "proyeccion" };
  const covered = coveredPeriods.has(term);
  if (covered && periods.length > 0) return { status: "not_offered", source: "requisitos" };
  if (!covered && projection?.kind === "sem") return { status: "offered", source: "proyeccion" };
  if (projection?.kind === "term" && projection.term > term) return { status: "not_offered", source: "proyeccion" };
  if (projection?.kind === "none" && periods.length > 0) return { status: "not_offered", source: "proyeccion" };
  return { status: "unknown", source: null };
}
