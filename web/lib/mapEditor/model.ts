// Phase B0 — the editable requirement model (pure, no I/O).
//
// A requirement tree (ReqNode) is edited as a list of GROUPS joined by AND; each
// group is a list of ALTERNATIVES joined by OR. That covers the common shapes
// (AND of OR-groups, plain AND, plain OR, single) as flat lists the canvas and the
// list editor can show. An alternative that is itself an AND (e.g. "(A Y B) O C")
// is kept verbatim as a `complex` alternative: editable only as a unit, so any
// tree round-trips losslessly.
//
// Every operation returns a new model and never mutates its input. Trees are
// rendered back through lib/registro/requirements so text and tree stay in sync.

import type { ReqNode } from "../types";
import { renderRegistroExpr } from "../registro/requirements";

export interface LeafAlt {
  kind: "leaf";
  code: string;
  soft: boolean;
}
/** An alternative that is itself an AND (or deeper): opaque, edited as a unit. */
export interface ComplexAlt {
  kind: "complex";
  tree: ReqNode;
}
export type Alt = LeafAlt | ComplexAlt;
export interface Group {
  alts: Alt[];
}
export interface ReqModel {
  groups: Group[];
}

export const EMPTY_MODEL: ReqModel = { groups: [] };

// ---------------------------------------------------------------- normalise

/** Flatten same-op nesting, drop empty nodes, collapse single-child nodes. */
export function normalizeTree(node: ReqNode | null): ReqNode | null {
  if (!node) return null;
  if (node.op === "COURSE") return node.code ? { op: "COURSE", code: node.code, soft: !!node.soft } : null;
  const items: ReqNode[] = [];
  const walk = (n: ReqNode) => {
    if (n.op === node.op) (n.items ?? []).forEach(walk);
    else {
      const c = normalizeTree(n);
      if (c) items.push(c);
    }
  };
  walk(node);
  // re-flatten children that became same-op after normalising
  const flat: ReqNode[] = [];
  for (const it of items) {
    if (it.op === node.op) flat.push(...(it.items ?? []));
    else flat.push(it);
  }
  if (flat.length === 0) return null;
  if (flat.length === 1) return flat[0];
  return { op: node.op, items: flat };
}

// -------------------------------------------------------------- tree <-> model

function leafOf(n: ReqNode): LeafAlt {
  return { kind: "leaf", code: n.code ?? "", soft: !!n.soft };
}
function altOf(n: ReqNode): Alt {
  return n.op === "COURSE" ? leafOf(n) : { kind: "complex", tree: n };
}
function groupOf(n: ReqNode): Group {
  if (n.op === "OR") return { alts: (n.items ?? []).map(altOf) };
  if (n.op === "COURSE") return { alts: [leafOf(n)] };
  return { alts: [altOf(n)] }; // unreachable for a normalised AND child
}

export function treeToModel(tree: ReqNode | null): ReqModel {
  const t = normalizeTree(tree);
  if (!t) return EMPTY_MODEL;
  if (t.op === "AND") return { groups: (t.items ?? []).map(groupOf) };
  return { groups: [groupOf(t)] };
}

function altToNode(a: Alt): ReqNode {
  return a.kind === "leaf" ? { op: "COURSE", code: a.code, soft: a.soft } : a.tree;
}

export function modelToTree(model: ReqModel): ReqNode | null {
  const groups = model.groups.filter((g) => g.alts.length > 0);
  const nodes = groups.map((g): ReqNode => {
    const alts = g.alts.map(altToNode);
    return alts.length === 1 ? alts[0] : { op: "OR", items: alts };
  });
  if (nodes.length === 0) return null;
  return normalizeTree(nodes.length === 1 ? nodes[0] : { op: "AND", items: nodes });
}

/** Spanish "A Y (B O C)" text for CatalogCourse.prereqText / coreqText ("" if empty). */
export function modelToText(model: ReqModel): string {
  return renderRegistroExpr(modelToTree(model));
}

/** True when every alternative is a plain course (fully drawable as edges). */
export function isSimple(model: ReqModel): boolean {
  return model.groups.every((g) => g.alts.every((a) => a.kind === "leaf"));
}

/** Codes referenced anywhere in the model, in order of first appearance. */
export function modelCodes(model: ReqModel): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (c: string) => {
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  const walk = (n: ReqNode) => {
    if (n.op === "COURSE") add(n.code ?? "");
    else (n.items ?? []).forEach(walk);
  };
  for (const g of model.groups) for (const a of g.alts) a.kind === "leaf" ? add(a.code) : walk(a.tree);
  return out;
}

// ----------------------------------------------------------------- operations

export class ModelError extends Error {}

/** Same normalisation the importer applies to typed codes: "iele 2100" -> "IELE2100". */
export function cleanCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

function hasLeaf(model: ReqModel, code: string): boolean {
  return model.groups.some((g) => g.alts.some((a) => a.kind === "leaf" && a.code === code));
}
function checkGroup(model: ReqModel, g: number) {
  if (!Number.isInteger(g) || g < 0 || g >= model.groups.length) throw new ModelError(`No existe el grupo ${g}`);
}

/** New AND-ed requirement (its own group). Duplicate leaves anywhere are refused. */
export function addRequirement(model: ReqModel, rawCode: string, soft = false): ReqModel {
  const code = cleanCode(rawCode);
  if (!code) throw new ModelError("Código vacío");
  if (hasLeaf(model, code)) throw new ModelError(`${code} ya es un requisito`);
  return { groups: [...model.groups, { alts: [{ kind: "leaf", code, soft }] }] };
}

/** Add an alternative (OR) to an existing group. */
export function addAlternative(model: ReqModel, g: number, rawCode: string, soft = false): ReqModel {
  checkGroup(model, g);
  const code = cleanCode(rawCode);
  if (!code) throw new ModelError("Código vacío");
  if (hasLeaf(model, code)) throw new ModelError(`${code} ya es un requisito`);
  return {
    groups: model.groups.map((grp, i) =>
      i === g ? { alts: [...grp.alts, { kind: "leaf", code, soft } as Alt] } : grp
    ),
  };
}

/** Remove one alternative; an emptied group disappears. */
export function removeAlt(model: ReqModel, g: number, a: number): ReqModel {
  checkGroup(model, g);
  if (!Number.isInteger(a) || a < 0 || a >= model.groups[g].alts.length) throw new ModelError(`No existe la alternativa ${a}`);
  return {
    groups: model.groups
      .map((grp, i) => (i === g ? { alts: grp.alts.filter((_, j) => j !== a) } : grp))
      .filter((grp) => grp.alts.length > 0),
  };
}

/** Remove every leaf with this code (used when a course is deleted from the plan). */
export function removeCode(model: ReqModel, code: string): ReqModel {
  return treeToModel(
    modelToTree({
      groups: model.groups.map((g) => ({
        alts: g.alts.filter((a) => !(a.kind === "leaf" && a.code === code)),
      })),
    })
  );
}

/** Merge several groups into one OR group ("Alternativas (O)"). Needs >= 2 groups. */
export function groupAsAlternatives(model: ReqModel, indexes: number[]): ReqModel {
  const uniq = [...new Set(indexes)].sort((x, y) => x - y);
  if (uniq.length < 2) throw new ModelError("Elige al menos dos requisitos para agruparlos");
  uniq.forEach((i) => checkGroup(model, i));
  const merged: Group = { alts: uniq.flatMap((i) => model.groups[i].alts) };
  const first = uniq[0];
  const out: Group[] = [];
  model.groups.forEach((g, i) => {
    if (i === first) out.push(merged);
    else if (!uniq.includes(i)) out.push(g);
  });
  return { groups: out };
}

/** Split an OR group back into one AND-ed requirement per alternative. */
export function ungroup(model: ReqModel, g: number): ReqModel {
  checkGroup(model, g);
  const alts = model.groups[g].alts;
  if (alts.length < 2) throw new ModelError("El grupo tiene una sola alternativa");
  return {
    groups: [
      ...model.groups.slice(0, g),
      ...alts.map((a): Group => ({ alts: [a] })),
      ...model.groups.slice(g + 1),
    ],
  };
}

/** Toggle the "soft" (*) marker on a leaf. */
export function setSoft(model: ReqModel, g: number, a: number, soft: boolean): ReqModel {
  checkGroup(model, g);
  const alt = model.groups[g].alts[a];
  if (!alt || alt.kind !== "leaf") throw new ModelError("Solo los cursos simples pueden marcarse como blandos (*)");
  return {
    groups: model.groups.map((grp, i) =>
      i === g ? { alts: grp.alts.map((x, j) => (j === a ? { ...alt, soft } : x)) } : grp
    ),
  };
}

/** Semantic equality (order inside AND/OR does not matter, duplicates collapse). */
export function canonical(tree: ReqNode | null): string {
  const t = normalizeTree(tree);
  const c = (n: ReqNode): string => {
    if (n.op === "COURSE") return `${n.code}${n.soft ? "*" : ""}`;
    const parts = [...new Set((n.items ?? []).map(c))].sort();
    return `${n.op}(${parts.join(",")})`;
  };
  return t ? c(t) : "";
}
