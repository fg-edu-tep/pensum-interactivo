// B2/B4 — requirement edges for the canvas (pure). One edge per course leaf of a
// requirement model, tagged with where it sits in the model so an edit can address
// it. Two layers: "doc" (editable) and "api" (official, read-only). Where both layers
// agree the edge is drawn once (the doc edge, flagged `agrees`).

import { treeToModel, type ReqModel } from "./model";
import type { ReqNode } from "../types";
import type { RequirementKind } from "./ops";

export interface EdgeRow {
  id: number;
  code: string | null;
  prereq: ReqModel;
  coreq: ReqModel;
}

export interface EdgeSpec {
  /** stable id, also the React Flow edge id */
  id: string;
  layer: "doc" | "api";
  kind: RequirementKind;
  /** row id of the prerequisite / corequisite course */
  source: number;
  /** row id of the course that has the requirement */
  target: number;
  soft: boolean;
  /** position in the target's model */
  group: number;
  alt: number;
  /** number of alternatives in the group (>1 = part of an OR group) */
  groupSize: number;
  /** part of a deeper expression: shown, but edited only in the list */
  complex: boolean;
  /** doc edge that the official API also has */
  agrees: boolean;
}

function leavesOf(t: ReqNode, out: string[] = []): string[] {
  if (t.op === "COURSE") {
    if (t.code) out.push(t.code);
  } else t.items?.forEach((i) => leavesOf(i, out));
  return out;
}

function edgesOfModel(
  layer: "doc" | "api", kind: RequirementKind, target: number, model: ReqModel, byCode: Map<string, number>
): EdgeSpec[] {
  const out: EdgeSpec[] = [];
  model.groups.forEach((g, gi) =>
    g.alts.forEach((a, ai) => {
      const codes = a.kind === "leaf" ? [a.code] : leavesOf(a.tree);
      for (const code of codes) {
        const source = byCode.get(code);
        if (source === undefined || source === target) continue;
        out.push({
          id: `${layer}:${kind}:${target}:${gi}.${ai}:${code}`,
          layer, kind, source, target,
          soft: a.kind === "leaf" ? a.soft : false,
          group: gi, alt: ai, groupSize: g.alts.length,
          complex: a.kind === "complex", agrees: false,
        });
      }
    })
  );
  return out;
}

const codeIndex = (rows: EdgeRow[]) => new Map(rows.filter((r) => r.code).map((r) => [r.code!, r.id]));

export function docEdges(rows: EdgeRow[]): EdgeSpec[] {
  const byCode = codeIndex(rows);
  return rows.flatMap((row) => [
    ...edgesOfModel("doc", "prereq", row.id, row.prereq, byCode),
    ...edgesOfModel("doc", "coreq", row.id, row.coreq, byCode),
  ]);
}

/** Official-API edges not already drawn as doc edges; marks the doc edges that agree. */
export function mergeApiEdges(
  doc: EdgeSpec[],
  rows: EdgeRow[],
  api: Map<number, { prereq: ReqNode | null; coreq: ReqNode | null }>
): { doc: EdgeSpec[]; api: EdgeSpec[] } {
  const byCode = codeIndex(rows);
  const has = new Set(doc.map((e) => `${e.kind}:${e.target}:${e.source}`));
  const agree = new Set<string>();
  const apiOnly: EdgeSpec[] = [];
  for (const [target, trees] of api) {
    for (const kind of ["prereq", "coreq"] as const) {
      const tree = trees[kind];
      if (!tree) continue;
      for (const e of edgesOfModel("api", kind, target, treeToModel(tree), byCode)) {
        const key = `${kind}:${target}:${e.source}`;
        if (has.has(key)) agree.add(key);
        else apiOnly.push(e);
      }
    }
  }
  return {
    doc: doc.map((e) => (agree.has(`${e.kind}:${e.target}:${e.source}`) ? { ...e, agrees: true } : e)),
    api: apiOnly,
  };
}
