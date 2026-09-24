import type { Course } from "@/lib/types";

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

/** "202620" -> "2026-2" */
export function termShort(term: string): string {
  const year = term.slice(0, 4);
  const period = term.slice(4);
  return `${year}-${period === "10" ? "1" : period === "30" ? "V" : "2"}`;
}

/** Best-effort "next term" label for planner CTAs — display only. */
export function nextTermShort(term: string): string {
  const year = Number(term.slice(0, 4));
  const period = term.slice(4);
  if (period === "10") return `${year}-2`;
  return `${year + 1}-1`;
}
export function nextTermCode(term: string): string {
  const year = Number(term.slice(0, 4));
  const period = term.slice(4);
  return period === "10" ? `${year}20` : `${year + 1}10`;
}
