// Requirement-expression helpers for the Registro wizard: which codes an
// expression references, and tree-level replace/drop + re-rendering back to the
// Spanish "Y / O" text the DB stores in CatalogCourse.prereqText.
//
// Everything goes through lib/import/requirementParser (single source of truth
// for the grammar) so the trees we write are exactly what the importer writes.

import type { ReqNode } from "../types";
import { collectCourseCodes, parseRequirement } from "../import/requirementParser";

/** Same convention as persistCatalog: coreq codes are hyphenated ("IELE-1118L"). */
export function parseCoreq(text: string | null | undefined): ReqNode | null {
  return parseRequirement((text ?? "").replace(/-/g, " "));
}

/** Codes referenced by a prereq + coreq text pair. */
export function referencedCodes(prereqText: string, coreqText: string): Set<string> {
  const out = collectCourseCodes(parseRequirement(prereqText));
  collectCourseCodes(parseCoreq(coreqText), out);
  return out;
}

/**
 * A token that looks like an exam/equivalence marker (ENGL7, INLE4, RLEC1, RLEN1)
 * rather than a real course code (IELE2100, IELE1118L). Real codes always have a
 * 4-digit number; these have 1–2 digits.
 */
export function isTokenCode(code: string): boolean {
  return /^[A-ZÑ]+\d{1,2}$/.test(code);
}

/** Apply `replace` (code -> new code) and `drop` (set of codes) to a tree. */
export function rewriteTree(
  node: ReqNode | null,
  replace: Map<string, string>,
  drop: Set<string>
): ReqNode | null {
  if (!node) return null;
  if (node.op === "COURSE") {
    const code = node.code ?? "";
    if (drop.has(code)) return null;
    const next = replace.get(code);
    return next ? { ...node, code: next } : node;
  }
  const items = dedupe(
    (node.items ?? [])
      .map((n) => rewriteTree(n, replace, drop))
      .filter((n): n is ReqNode => n !== null)
  );
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return { ...node, items };
}

/**
 * Collapse identical siblings ("A O A" -> "A"), which a replace can create
 * (FISI 1028 O FISI 1528, replacing 1028 by 1528). For the same course code the
 * result is "soft" (the * marker) only if every occurrence was soft, so a
 * replace never weakens a hard requirement.
 */
function dedupe(items: ReqNode[]): ReqNode[] {
  const out: ReqNode[] = [];
  const byCode = new Map<string, number>();
  const seen = new Set<string>();
  for (const it of items) {
    if (it.op === "COURSE" && it.code) {
      const at = byCode.get(it.code);
      if (at !== undefined) {
        if (!it.soft) out[at] = { ...out[at], soft: false };
        continue;
      }
      byCode.set(it.code, out.length);
      out.push(it);
      continue;
    }
    const k = JSON.stringify(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** "IELE2100" -> "IELE 2100"; fused exam tokens ("ENGL7") stay fused. */
function codeText(code: string, soft: boolean | undefined): string {
  const m = /^([A-ZÑ]+)(\d{3,}[A-Z]?)$/.exec(code);
  const base = m ? `${m[1]} ${m[2]}` : code;
  return soft ? `${base}*` : base;
}

function render(node: ReqNode, parent: "AND" | "OR" | null): string {
  if (node.op === "COURSE") return codeText(node.code ?? "", node.soft);
  const flat: ReqNode[] = [];
  const walk = (n: ReqNode) => {
    if (n.op === node.op) (n.items ?? []).forEach(walk);
    else flat.push(n);
  };
  walk(node);
  const inner = flat.map((n) => render(n, node.op as "AND" | "OR")).join(node.op === "AND" ? " Y " : " O ");
  return parent !== null && parent !== node.op ? `(${inner})` : inner;
}

/** Tree -> registro-style text ("A Y (B O C)"); null -> "". */
export function renderRegistroExpr(tree: ReqNode | null): string {
  return tree ? render(tree, null) : "";
}

/** Structural equality of two trees, ignoring nothing (order matters). */
export function sameTree(a: ReqNode | null, b: ReqNode | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
