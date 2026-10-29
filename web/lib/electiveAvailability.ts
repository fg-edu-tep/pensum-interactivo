// Elective slots are enabled by REQUIREMENT, not by credit thresholds (agreed
// 2026-10-29): a slot reads as available when at least one course of its
// catalog can be taken now. The elective picker uses the same functions, so
// "Puedes tomarla" in the side panel and the slot's state can't disagree.
//
//   EFI (Electiva en Fundamentos de Ingeniería)  always enabled — any I*** course
//       counts and there's no closed catalog; the student checks prerequisites.
//   CLE (Curso de libre elección)                no closed catalog either → enabled.
//   ELECTIVA                                     the bag's electives for this program
//       (role column of the 2024-I pensum, narrowed by the slot's label).
//   CI (Curso integrador)                        the bag's integrador electives.
//
// A catalog nobody can evaluate yet (no codes / requirements in the data)
// stays enabled with a "verifica prerrequisitos" note, like EFI. Pure.

import type { Course, ElectiveDTO, ReqNode, RoleCell } from "./types";
import { satisfied } from "./availability";
import { parseRequirement } from "./import/requirementParser";
import { foldAccents } from "./import/textMatch";

/** role words that make a bag row usable in an elective slot (not
 * obligatoria / proyecto de grado / práctica / pasantía) */
export const ELECTIVE_ROLES = new Set(["electiva", "area_mayor", "curso_integrador", "cle", "maestria"]);

export function rolesFor(e: ElectiveDTO, programCode: string): RoleCell[] {
  const ele = e.roles.eleFrom2024;
  const elc = e.roles.elcFrom2024;
  if (programCode === "IELC") return [elc];
  if (programCode === "DOBLE") return [ele, elc];
  return [ele];
}

/** "ELECTIVA ÁREA MAYOR" → only area_mayor rows, etc. */
export function narrowFromSlot(slotLabel: string): string | null {
  const s = foldAccents(slotLabel);
  if (s.includes("AREA MAYOR")) return "area_mayor";
  if (s.includes("INTEGRADOR")) return "curso_integrador";
  if (s.includes("LIBRE") || s.includes("CLE")) return "cle";
  return null;
}

/** The bag electives a slot accepts. */
export function slotCatalog(
  electives: ElectiveDTO[],
  programCode: string,
  slot: { placeholderKind?: string | null; placeholderLabel?: string | null; code: string }
): ElectiveDTO[] {
  if (slot.placeholderKind === "CI") return electives.filter((e) => e.isCursoIntegrador);
  const want = narrowFromSlot(slot.placeholderLabel || slot.code);
  return electives.filter((e) => {
    const cells = rolesFor(e, programCode).filter((c) => c?.norm && ELECTIVE_ROLES.has(c.norm));
    if (cells.length === 0) return false;
    return !want || cells.some((c) => c.norm === want);
  });
}

/** this term's API prerequisites ("" = none) win over Registro's */
export function electiveTree(e: ElectiveDTO, livePrereqText?: string): ReqNode | null {
  if (livePrereqText !== undefined) return parseRequirement(livePrereqText);
  return e.registroPrereqText ? parseRequirement(e.registroPrereqText) : null;
}

/** Whether the data says anything about this elective's requirements. */
export function electiveEvaluable(e: ElectiveDTO, livePrereqText?: string): boolean {
  return livePrereqText !== undefined || !!e.code || !!e.registroPrereqText;
}

export interface ElectiveCtx {
  approved: Set<string>;
  cart: Set<string>;
  catalogCodes: Set<string>;
  /** credits(A) */
  approvedCredits: number;
  /** undergraduate plan: master's-only electives (Registro "INCLUYE MAGISTER") don't count */
  pregrado?: boolean;
}

/** "unknown": the data has nothing to evaluate (no code, no requirements) —
 * shown as "verifica prerrequisitos", never as "puedes tomarla" */
export type ElectiveState = "seen" | "now" | "blocked" | "unknown";

/** Real course codes (IELE3102, MATE2210L) must be approved even when they're
 * outside this pensum (an Eléctrica course for an Electrónica student);
 * exam / equivalence tokens (EXMA1, ENGL7, RLEC1) and the English-language
 * courses (LENG …, tracked by the "Requisito de lectura en inglés" in the
 * graduation checklist, as on the map) stay informational. */
export function requiredCourseCodes(tree: ReqNode | null): Set<string> {
  const out = new Set<string>();
  const walk = (n: ReqNode | null) => {
    if (!n) return;
    if (n.op === "COURSE") {
      if (n.code && /^[A-Z]{4}\d{4}[A-Z]?$/.test(n.code) && !/^(LENG|ENGL|RLEC|RLEN|INLE|IDIO)/.test(n.code)) out.add(n.code);
    } else n.items?.forEach(walk);
  };
  walk(tree);
  return out;
}

/** Registro's level restriction includes only graduate levels. */
export function graduateOnly(level: string | null | undefined): boolean {
  const s = foldAccents(level ?? "").toUpperCase();
  return /INCLUYE/.test(s) && /(MAGISTER|DOCTORADO|ESPECIALIZACION)/.test(s) && !/PREGRADO/.test(s);
}

/** Same rule as lib/planning.ts "now": hard prerequisites approved, "*" ones
 * approved or in the cart, the credit restriction met by credits(A). */
export function electiveState(e: ElectiveDTO, ctx: ElectiveCtx, livePrereqText?: string, liveCode?: string): ElectiveState {
  const code = liveCode ?? e.code;
  if (code && ctx.approved.has(code)) return "seen";
  if (!electiveEvaluable(e, livePrereqText)) return "unknown";
  if (ctx.pregrado && graduateOnly(e.registroLevel)) return "blocked";
  const tree = electiveTree(e, livePrereqText);
  const together = new Set([...ctx.approved, ...ctx.cart]);
  if (!satisfied(tree, ctx.approved, requiredCourseCodes(tree), (c) => together.has(c))) return "blocked";
  if (typeof e.minCredits === "number" && ctx.approvedCredits < e.minCredits) return "blocked";
  return "now";
}

export type SlotOpenness = { open: boolean; reason: "always" | "takeable" | "unevaluable" | "none" };

export function slotOpenness(
  slot: Course,
  electives: ElectiveDTO[],
  programCode: string,
  ctx: ElectiveCtx
): SlotOpenness {
  const kind = slot.placeholderKind ?? "";
  if (kind === "EFI" || kind === "CLE" || isEfiLabel(slot)) return { open: true, reason: "always" };
  const catalog = slotCatalog(electives, programCode, slot);
  const evaluable = catalog.filter((e) => electiveEvaluable(e));
  if (evaluable.length === 0) return { open: true, reason: "unevaluable" };
  return evaluable.some((e) => electiveState(e, ctx) === "now" || electiveState(e, ctx) === "seen")
    ? { open: true, reason: "takeable" }
    : { open: false, reason: "none" };
}

/** "ELECTIVA EN FUND. ING." classified as a plain ELECTIVA is still an EFI. */
export function isEfiLabel(c: { placeholderKind?: string | null; placeholderLabel?: string | null; name: string }): boolean {
  if (c.placeholderKind === "EFI") return true;
  const label = foldAccents(`${c.placeholderLabel ?? ""} ${c.name}`).toUpperCase();
  return /FUNDAMENTOS? DE INGENIER|FUND\.? ?(DE )?ING/.test(label);
}

/** slot id → open, for every elective-type slot of the plan */
export function slotOpenMap(courses: Course[], electives: ElectiveDTO[], programCode: string, ctx: ElectiveCtx): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const c of courses) {
    if (!c.isPlaceholder) continue;
    const kind = c.placeholderKind ?? "";
    if (kind !== "ELECTIVA" && kind !== "EFI" && kind !== "CI" && kind !== "CLE" && c.type !== "electiva") continue;
    out.set(c.id, slotOpenness(c, electives, programCode, ctx).open);
  }
  return out;
}
