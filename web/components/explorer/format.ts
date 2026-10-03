import type { Course } from "@/lib/types";
import { termLabel, planTerm } from "@/lib/term";

/** DATA-01 stand-in: derive the display group from the code prefix — the
 * design doc's own default when an admin-editable `grupo` field is empty. */
export type CourseGroup = "iele" | "cb" | "otr" | "pro" | "ele" | "cbu" | "req";

export function groupOf(course: Course): CourseGroup {
  if (course.type === "proyecto") return "pro";
  if (course.isPlaceholder) {
    const kind = course.placeholderKind ?? "";
    if (kind === "CBU") return "cbu";
    if (kind === "REQING") return "req";
    if (course.type === "electiva" || kind === "ELECTIVA" || kind === "EFI" || kind === "CI" || kind === "CLE")
      return "ele";
    // DEPT/CODEX and other slots fall back on the prefix rule below
  }
  const code = course.codeNormalized;
  if (/^(IELE|IELC)/.test(code)) return "iele";
  if (/^(MATE|FISI)/.test(code)) return "cb";
  return "otr";
}

const GROUP_TYPE_CLASS: Record<CourseGroup, string> = {
  iele: "typeIele",
  cb: "typeCb",
  otr: "typeOtr",
  pro: "typePro",
  ele: "slotEle",
  cbu: "slotCbu",
  req: "slotReq",
};

export function groupClass(group: CourseGroup): string {
  return GROUP_TYPE_CLASS[group];
}

const GROUP_COLOR_VAR: Record<CourseGroup, string> = {
  iele: "var(--t-iele)",
  cb: "var(--t-cb)",
  otr: "var(--t-otr)",
  pro: "var(--t-pro)",
  ele: "var(--t-ele)",
  cbu: "var(--t-cbu)",
  req: "var(--t-req)",
};
export function groupColor(group: CourseGroup): string {
  return GROUP_COLOR_VAR[group];
}

export const GROUP_LABEL: Record<CourseGroup, string> = {
  iele: "IELE",
  cb: "Ciencias básicas",
  otr: "Otras facultades",
  pro: "Proyecto",
  ele: "Electiva",
  cbu: "CBU",
  req: "Requisito de grado",
};

/** DATA-02 stand-in: sentence-case the (all-caps, as-imported) title, keeping
 * known acronyms upper-cased. Display-only — never written back to the DB. */
const ACRONYMS = ["IEE", "IELC", "IELE", "SD", "CBU", "EFI"];

export function toSentenceCase(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLocaleLowerCase("es");
  const sentence = lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
  return sentence.replace(/\p{L}+/gu, (word) => {
    const upper = word.toLocaleUpperCase("es");
    return ACRONYMS.includes(upper) ? upper : word;
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
export function nextTermShort(): string {
  return termLabel(planTerm());
}
export function nextTermCode(): string {
  return planTerm();
}
