// A course's group on the map ("grupo"), from the TIPO column of the
// department's PLANES file. Mauricio writes either the four generic values
// (Obligatorio, Proyecto, Electiva, CBU) or the seven categories of the
// department's pensum PDF (Fundamentos de Ingeniería, …). Colours follow the
// PDF (components/explorer/tokens.css); the legend shows the groups a plan has.

import type { CourseType } from "./types";
import { foldAccents } from "./import/textMatch";

export type CourseCategory =
  | "obligatorio"
  | "fing"
  | "ftiee"
  | "fesp"
  | "terminal"
  | "electiva"
  | "ciencias"
  | "proyecto"
  | "edugen"
  | "cbu";

/** Legend order: the PDF's, with each generic value next to its PDF family. */
export const CATEGORY_ORDER: CourseCategory[] = [
  "obligatorio",
  "fing",
  "ftiee",
  "fesp",
  "terminal",
  "electiva",
  "ciencias",
  "proyecto",
  "edugen",
  "cbu",
];

export const CATEGORY_LABEL: Record<CourseCategory, string> = {
  obligatorio: "Obligatorio",
  fing: "Fundamentos de Ingeniería",
  ftiee: "Fundamentos Transversales IEE",
  fesp: "Fundamentos Específicos",
  terminal: "Ciclo Terminal",
  electiva: "Electiva",
  ciencias: "Ciclo de Ciencias y Matemáticas",
  proyecto: "Proyectos",
  edugen: "Educación General",
  cbu: "CBU",
};

/** the four values the file used before the PDF categories */
export const GENERIC_CATEGORIES: ReadonlySet<CourseCategory> = new Set(["obligatorio", "proyecto", "electiva", "cbu"]);

const BY_TEXT: [RegExp, CourseCategory][] = [
  [/^OBLIGATORI[OA]S?$/, "obligatorio"],
  [/^PROYECTOS?$/, "proyecto"],
  [/^ELECTIVAS?$/, "electiva"],
  [/^CBU$/, "cbu"],
  [/^FUNDAMENTOS (DE )?INGENIERIA$/, "fing"],
  [/^FUNDAMENTOS TRANSVERSALES( IEE)?$/, "ftiee"],
  [/^FUNDAMENTOS ESPECIFICOS$/, "fesp"],
  [/^CICLO TERMINAL$/, "terminal"],
  [/^(CICLO DE )?CIENCIAS( Y MATEMATICAS)?$/, "ciencias"],
  [/^EDUCACION GENERAL$/, "edugen"],
];

/** "Fundamentos específicos" / "OBLIGATORIO" → key; null when unknown or blank. */
export function parseCategory(raw: string | null | undefined): CourseCategory | null {
  const t = foldAccents(String(raw ?? "")).replace(/\s+/g, " ").trim();
  if (!t) return null;
  return BY_TEXT.find(([re]) => re.test(t))?.[1] ?? null;
}

export function isCourseCategory(v: unknown): v is CourseCategory {
  return typeof v === "string" && (CATEGORY_ORDER as string[]).includes(v);
}

/** The planner's course type for a (non-slot) course of this group. */
export function courseTypeOfCategory(c: CourseCategory): CourseType {
  if (c === "proyecto") return "proyecto";
  if (c === "cbu") return "cbu";
  if (c === "electiva" || c === "terminal") return "electiva";
  return "nucleo";
}
