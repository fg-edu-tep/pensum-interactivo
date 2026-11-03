import type { Course } from "@/lib/types";
import { CATEGORY_LABEL, CATEGORY_ORDER, type CourseCategory } from "@/lib/courseCategory";
import { termLabel, planTerm } from "@/lib/term";

/** The map group: the department's TIPO for the course (lib/courseCategory.ts),
 * plus "req" for the 0-credit requirement nodes. Rows without a TIPO (older
 * loads) derive it from the course type. */
export type CourseGroup = CourseCategory | "req";

export function groupOf(course: Course): CourseGroup {
  const kind = course.isPlaceholder ? (course.placeholderKind ?? "") : "";
  if (kind === "REQING") return "req";
  if (course.category) return course.category;
  if (course.type === "proyecto") return "proyecto";
  if (kind === "CBU" || course.type === "cbu") return "cbu";
  if (course.isPlaceholder && (course.type === "electiva" || kind === "ELECTIVA" || kind === "EFI" || kind === "CI" || kind === "CLE"))
    return "electiva";
  return "obligatorio";
}

/** CSS-module class per group: sets --card-color and --on-type-2 */
const GROUP_TYPE_CLASS: Record<CourseGroup, string> = {
  obligatorio: "catObligatorio",
  fing: "catFing",
  ftiee: "catFtiee",
  fesp: "catFesp",
  terminal: "catTerminal",
  electiva: "catTerminal",
  ciencias: "catCiencias",
  proyecto: "catProyecto",
  edugen: "catEdugen",
  cbu: "catEdugen",
  req: "slotReq",
};

export function groupClass(group: CourseGroup): string {
  return GROUP_TYPE_CLASS[group];
}

// The PDF's families: Electiva is Ciclo Terminal's pink, CBU is Educación
// General's purple (components/explorer/tokens.css).
const GROUP_COLOR_VAR: Record<CourseGroup, string> = {
  obligatorio: "var(--t-iele)",
  fing: "var(--t-fing)",
  ftiee: "var(--t-ftiee)",
  fesp: "var(--t-fesp)",
  terminal: "var(--t-ele)",
  electiva: "var(--t-ele)",
  ciencias: "var(--t-ciencias)",
  proyecto: "var(--t-pro)",
  edugen: "var(--t-cbu)",
  cbu: "var(--t-cbu)",
  req: "var(--t-req)",
};
export function groupColor(group: CourseGroup): string {
  return GROUP_COLOR_VAR[group];
}

export const GROUP_LABEL: Record<CourseGroup, string> = { ...CATEGORY_LABEL, req: "Requisito de grado" };

/** The groups a plan uses, in legend order; `dashed` when every member is a
 * slot (drawn dashed on the map). */
export function groupsOf(courses: Course[]): { group: CourseGroup; dashed: boolean }[] {
  const slotsOnly = new Map<CourseGroup, boolean>();
  for (const c of courses) {
    const g = groupOf(c);
    if (g === "req") continue;
    slotsOnly.set(g, (slotsOnly.get(g) ?? true) && c.isPlaceholder);
  }
  return CATEGORY_ORDER.filter((g) => slotsOnly.has(g)).map((g) => ({ group: g, dashed: slotsOnly.get(g)! }));
}

/** DATA-02 stand-in: sentence-case the (all-caps, as-imported) title, keeping
 * known acronyms upper-cased. Display-only — never written back to the DB. */
const ACRONYMS = ["IEE", "IELC", "IELE", "SD", "CBU", "EFI"];

export function toSentenceCase(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLocaleLowerCase("es");
  const sentence = lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
  return sentence.replace(/\p{L}+/gu, (word, offset: number, all: string) => {
    const upper = word.toLocaleUpperCase("es");
    if (ACRONYMS.includes(upper)) return upper;
    // roman numerals: "Física II", "Taller IEE 1", "Cálculo III" ("i"/"v" only
    // when they end the name or precede a parenthesis, so the word "i" never is)
    if (/^(II|III|IV|VI|VII|VIII|IX)$/.test(upper)) return upper;
    if (/^(I|V|X)$/.test(upper) && offset > 0 && /^\s*(\(|$)/.test(all.slice(offset + word.length))) return upper;
    return word;
  });
}

/** Space a bare external code so "IELE1118L" reads as "IELE 1118L". */
export function spaceCode(code: string): string {
  return code.replace(/^([A-ZÑ]{2,6})(\d.*)$/, "$1 $2");
}

/** "202620" -> "2026-2" (see lib/term.ts) */
export const termShort = termLabel;

/** The term the basket/planner targets — derived from today's date, not from
 * the (seed-time) catalog term, so it rolls over on its own. */
// The period the cart plans for: the one the official load opened for planning
// (payload.terms.planning), set once by PensumExplorer; the calendar's next
// regular semester before that.
let planningOverride: string | null = null;
export function setPlanningTerm(code: string | null | undefined) {
  planningOverride = code && /^\d{6}$/.test(code) ? code : null;
}
export function nextTermShort(): string {
  return termLabel(nextTermCode());
}
export function nextTermCode(): string {
  return planningOverride ?? planTerm();
}
