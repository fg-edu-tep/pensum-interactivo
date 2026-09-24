import type { Course, ReqNode } from "@/lib/types";

export interface ReqOption {
  code: string;
  label: string;
  inPensum: boolean;
}
export type ReqGroup =
  | { kind: "course"; number: number; code: string; label: string; inPensum: boolean }
  | { kind: "or"; number: number; options: ReqOption[] }
  | { kind: "requirement"; number: number; key: string; label: string };

/** Numbers the AND-level terms of a course's prerequisite tree, per PNL-07/08.
 * A bare OR (or single COURSE) tree counts as one term. RequirementNode-backed
 * "requirements" (e.g. the English-reading node) bypass prereqTree entirely —
 * catalogPayload injects them straight into prereqCourseIds — so they're
 * appended here as their own numbered rows per PNL-09. Returns null when the
 * tree shape isn't one this renderer understands (caller falls back to text). */
export function numberRequirementGroups(
  course: Course,
  allCourses: Course[],
  catalogCodes: Set<string>
): ReqGroup[] | null {
  const byId = new Map(allCourses.map((c) => [c.id, c]));
  const byNormalized = new Map(allCourses.map((c) => [c.codeNormalized, c]));
  const label = (code: string) => byNormalized.get(code)?.name ?? code;

  const groups: ReqGroup[] = [];
  let n = 0;
  const seenCodes = new Set<string>();

  function pushCourse(code: string) {
    seenCodes.add(code);
    n += 1;
    groups.push({ kind: "course", number: n, code, label: label(code), inPensum: catalogCodes.has(code) });
  }
  function pushOr(node: ReqNode) {
    const options: ReqOption[] = (node.items ?? [])
      .filter((it) => it.op === "COURSE")
      .map((it) => ({ code: it.code!, label: label(it.code!), inPensum: catalogCodes.has(it.code!) }));
    if (options.length !== (node.items ?? []).length) return null; // nested non-COURSE inside OR — bail
    for (const o of options) seenCodes.add(o.code);
    n += 1;
    groups.push({ kind: "or", number: n, options });
    return true;
  }

  const tree = course.prereqTree;
  if (tree) {
    if (tree.op === "COURSE") {
      pushCourse(tree.code!);
    } else if (tree.op === "OR") {
      if (pushOr(tree) === null) return null;
    } else {
      // AND: each item is one numbered term
      for (const item of tree.items ?? []) {
        if (item.op === "COURSE") {
          pushCourse(item.code!);
        } else if (item.op === "OR") {
          if (pushOr(item) === null) return null;
        } else {
          return null; // deeper nesting than this renderer handles
        }
      }
    }
  }

  // RequirementNode-backed rows (bypass prereqTree — see catalogPayload.ts)
  for (const id of course.prereqCourseIds) {
    if (seenCodes.has(id)) continue;
    const req = byId.get(id);
    if (req?.placeholderKind === "REQING") {
      n += 1;
      groups.push({ kind: "requirement", number: n, key: id, label: req.name });
    }
  }

  return groups;
}
