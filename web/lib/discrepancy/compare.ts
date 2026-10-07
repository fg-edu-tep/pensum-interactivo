// Canonical comparison of two requirement trees (ReqNode).
//
// Two expressions are "the same" when they ask for the same thing, regardless
// of how they were written:  (A O B) O C  ==  A O (B O C)  ==  C O B O A,
// duplicates collapse (A O A == A), and a single-item group is its item.
// The '*' (soft / concurrent) marker is compared separately so a difference
// that is ONLY the marker can be reported as minor.
//
// Pure: no I/O. Deliberately does NOT try to prove logical equivalence
// (absorption, distribution…) — if two trees differ structurally after
// normalisation they are reported as different, which is the safe direction
// for an alert.

import type { ReqNode } from "../types";
import { collectCourseCodes } from "../import/requirementParser";

type Norm = { c: string } | { op: "AND" | "OR"; i: Norm[] };

const key = (n: Norm) => JSON.stringify(n);

function norm(node: ReqNode | null | undefined, soft: boolean): Norm | null {
  if (!node) return null;
  if (node.op === "COURSE") {
    return node.code ? { c: node.code + (soft && node.soft ? "*" : "") } : null;
  }
  const flat: Norm[] = [];
  for (const it of node.items ?? []) {
    const n = norm(it, soft);
    if (!n) continue;
    if ("op" in n && n.op === node.op) flat.push(...n.i); // (A O B) O C -> A O B O C
    else flat.push(n);
  }
  const byKey = new Map<string, Norm>();
  for (const n of flat) byKey.set(key(n), n); // dedupe
  const items = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, n]) => n);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return { op: node.op, i: items };
}

/** Canonical string of a tree; null for "no requirement". */
export function canonicalKey(node: ReqNode | null | undefined, opts: { soft: boolean }): string | null {
  const n = norm(node, opts.soft);
  return n ? key(n) : null;
}

export type TreeRelation = "same" | "soft-only" | "different";

export interface TreeComparison {
  relation: TreeRelation;
  /** course codes only the API expression mentions */
  onlyInApi: string[];
  /** course codes only the document expression mentions */
  onlyInDocument: string[];
}

export function compareTrees(api: ReqNode | null, document: ReqNode | null): TreeComparison {
  const hardA = canonicalKey(api, { soft: false });
  const hardD = canonicalKey(document, { soft: false });
  const a = collectCourseCodes(api);
  const d = collectCourseCodes(document);
  const onlyInApi = [...a].filter((c) => !d.has(c)).sort();
  const onlyInDocument = [...d].filter((c) => !a.has(c)).sort();
  if (hardA !== hardD) return { relation: "different", onlyInApi, onlyInDocument };
  const same = canonicalKey(api, { soft: true }) === canonicalKey(document, { soft: true });
  return { relation: same ? "same" : "soft-only", onlyInApi, onlyInDocument };
}
