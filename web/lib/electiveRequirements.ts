// Turns a Registro requirement tree into what a student reads in the electives
// table (/embed/electivas): course NAMES, grouped the way the department talks
// about them. Pure + isomorphic: the detail API builds it, the widget renders it.
//
//   · "LENG 2999 O LENG 1156 O ENGL7 O INLE4 O RLEC1 O RLEN1" is ONE thing —
//     the English reading requirement — so an OR group made only of English
//     alternatives collapses to { k: "english", options }.
//   · Master's / doctoral standing (EXMA1, EXDO1) are alternatives an
//     undergraduate can't use: they stay, but after the course paths.
//   · A trailing "*" in Registro ("IELE 3102*") means it can be taken at the
//     same time: kept as `soft`.

import type { ReqNode } from "./types";
import { tokenName } from "./requirementTokens";
import { toSentenceCase } from "@/components/explorer/format";

export type ReqView =
  | { k: "course"; code: string; name: string | null; soft: boolean }
  | { k: "token"; code: string; label: string }
  | { k: "english"; options: string[] }
  | { k: "all"; items: ReqView[] }
  | { k: "any"; items: ReqView[] };

const ENGLISH_TOKENS = new Set(["ENGL7", "INLE4", "RLEC1", "RLEN1"]);
const STANDING_TOKENS = new Set(["EXMA1", "EXDO1"]);

/** "IELE3336L" → "IELE 3336L" */
export function spacedCode(code: string): string {
  return code.replace(/^([A-ZÑ]+)(\d)/, "$1 $2");
}

/** Registro names are upper case: same casing as the planner's course names
 * ("PROBABILIDAD Y ESTADÍSTICA I" → "Probabilidad y estadística I"). */
export function sentenceName(s: string): string {
  return toSentenceCase(s.trim().replace(/\s+/g, " "));
}

const isEnglishLeaf = (n: ReqNode) =>
  n.op === "COURSE" && !!n.code && (ENGLISH_TOKENS.has(n.code) || /^LENG\d/.test(n.code));

function leaf(n: ReqNode, names: Map<string, string>): ReqView {
  const code = n.code!;
  const tok = tokenName(code);
  if (tok) return { k: "token", code, label: tok.charAt(0).toUpperCase() + tok.slice(1) };
  const nm = names.get(code);
  return { k: "course", code, name: nm ? sentenceName(nm) : null, soft: !!n.soft };
}

/** label of one English alternative: "English 06 (LENG 1156)", or the bare code */
function englishOption(n: ReqNode, names: Map<string, string>): string {
  const code = n.code!;
  if (ENGLISH_TOKENS.has(code)) return code;
  const nm = names.get(code);
  return nm && /english/i.test(nm) ? `${sentenceName(nm)} (${spacedCode(code)})` : spacedCode(code);
}

/** The parser nests chains pairwise ("A O B O C" → OR(OR(A,B),C)): one level per operator. */
function flatten(node: ReqNode): ReqNode[] {
  return (node.items ?? []).filter(Boolean).flatMap((c) => (c.op === node.op ? flatten(c) : [c]));
}

const rank = (v: ReqView) => (v.k === "token" && STANDING_TOKENS.has(v.code) ? 1 : 0);

export function toReqView(node: ReqNode | null, names: Map<string, string>): ReqView | null {
  if (!node) return null;
  if (node.op === "COURSE") return node.code ? leaf(node, names) : null;
  const kids = flatten(node);
  if (node.op === "OR" && kids.length > 1 && kids.every(isEnglishLeaf))
    return { k: "english", options: kids.map((c) => englishOption(c, names)) };
  const items = kids.map((c) => toReqView(c, names)).filter((v): v is ReqView => !!v);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  if (node.op === "OR") return { k: "any", items: items.map((v, i) => [v, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([v]) => v) };
  return { k: "all", items };
}

/** One line of plain text (titles, screen readers, copy). */
export function reqViewText(v: ReqView | null, nested = false): string {
  if (!v) return "";
  switch (v.k) {
    case "course":
      return `${v.name ?? spacedCode(v.code)}${v.soft ? " (puede ser al tiempo)" : ""}`;
    case "token":
      return v.label;
    case "english":
      return `Requisito de lectura en inglés (${joinEs(v.options, "o")})`;
    case "any":
    case "all": {
      const t = v.items.map((i) => reqViewText(i, true)).join(v.k === "any" ? " o " : " y ");
      return nested ? `(${t})` : t;
    }
  }
}

/** "a, b o c" */
export function joinEs(items: string[], conj: "y" | "o"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}
