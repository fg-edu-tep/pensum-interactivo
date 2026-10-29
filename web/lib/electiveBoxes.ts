// Half-box electives (agreed 2026-10-29). The pensum draws its elective credits
// as 2-credit boxes; electives are worth 2, 3 or 4 credits. Each box is two
// 1-credit halves, and a k-credit course fills k halves: it starts at the box
// the student chose and continues into the next free elective box in pensum
// order (top to bottom in a semester, then the next semester).
//
//   2 cr → one box · 3 cr → one box + the first half of the next · 4 cr → two boxes
//
// Boxes always read "2 cr"; a course's real credits count once. Removing a
// course frees its halves without moving the others (no reflow), so courses
// never jump between boxes. Not enough free halves left → what's left is
// filled and the rest is reported as overflow ("+N cr por encima").
//
// Positions are "<boxId>#0" / "<boxId>#1". An assignment is stored under the
// box the student chose (its anchor) and lists the halves it occupies. Pure.

import type { Course, ElectiveAssignment } from "./types";

export type Assignments = Record<string, ElectiveAssignment>;

/** The 2-credit ELECTIVA boxes of the plan, in pensum order. */
export function electiveBoxIds(courses: Course[]): string[] {
  return courses
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.isPlaceholder && c.placeholderKind === "ELECTIVA" && c.credits === 2)
    .sort((a, b) => a.c.semester - b.c.semester || a.i - b.i)
    .map(({ c }) => c.id);
}

export const half = (boxId: string, h: 0 | 1) => `${boxId}#${h}`;
const boxOf = (pos: string) => pos.slice(0, pos.lastIndexOf("#"));

function allHalves(boxIds: string[]): string[] {
  return boxIds.flatMap((b) => [half(b, 0), half(b, 1)]);
}

/** position → anchor key of the assignment occupying it */
export function occupancy(assignments: Assignments, except?: string): Map<string, string> {
  const occ = new Map<string, string>();
  for (const [key, a] of Object.entries(assignments)) {
    if (key === except) continue;
    for (const pos of a.halves ?? []) occ.set(pos, key);
  }
  return occ;
}

/** Where a k-credit course anchored at `anchorId` goes. */
export function placeHalves(
  boxIds: string[],
  assignments: Assignments,
  anchorId: string,
  credits: number
): { halves: string[]; overflow: number } {
  const occ = occupancy(assignments, anchorId);
  const order = allHalves(boxIds);
  const start = Math.max(0, boxIds.indexOf(anchorId)) * 2;
  const halves: string[] = [];
  const k = Math.max(0, Math.round(credits));
  for (let i = start; i < order.length && halves.length < k; i++) if (!occ.has(order[i])) halves.push(order[i]);
  return { halves, overflow: k - halves.length };
}

/** The assignment covering a box (as anchor or continuation), if any. */
export function ownerOf(boxId: string, assignments: Assignments): string | null {
  if (assignments[boxId]?.halves?.some((p) => boxOf(p) === boxId)) return boxId;
  const occ = occupancy(assignments);
  return occ.get(half(boxId, 0)) ?? occ.get(half(boxId, 1)) ?? (assignments[boxId] ? boxId : null);
}

/** Older assignments (one box = one course, credits relabelled) get halves,
 * placed in pensum order of their boxes. Non-box slots are left alone. */
export function migrateAssignments(boxIds: string[], assignments: Assignments): Assignments {
  if (!Object.entries(assignments).some(([k, a]) => boxIds.includes(k) && !a.halves)) return assignments;
  const out: Assignments = {};
  for (const [k, a] of Object.entries(assignments)) if (!boxIds.includes(k) || a.halves) out[k] = a;
  for (const b of boxIds) {
    const a = assignments[b];
    if (!a || a.halves) continue;
    const { halves, overflow } = placeHalves(boxIds, out, b, a.credits ?? 2);
    out[b] = { ...a, halves, overflow };
  }
  return out;
}

export interface BoxHalf {
  /** anchor key of the assignment */
  key: string;
  title: string;
  credits: number;
  /** a continuation half (the course started in an earlier half) */
  cont: boolean;
}

/** box id → its two halves, for rendering */
export function boxHalves(boxIds: string[], assignments: Assignments): Map<string, [BoxHalf | null, BoxHalf | null]> {
  const occ = occupancy(assignments);
  const out = new Map<string, [BoxHalf | null, BoxHalf | null]>();
  for (const b of boxIds) {
    const pair = ([0, 1] as const).map((h) => {
      const key = occ.get(half(b, h));
      if (!key) return null;
      const a = assignments[key];
      return { key, title: a.title, credits: a.credits ?? 2, cont: (a.halves ?? [])[0] !== half(b, h) };
    }) as [BoxHalf | null, BoxHalf | null];
    out.set(b, pair);
  }
  return out;
}

/** Credits each box contributes when seen: its occupied halves (1 each), the
 * anchor box also carries the course's overflow; an empty box counts 2 (a box
 * marked as seen without naming a course). */
export function boxCredits(boxIds: string[], assignments: Assignments): Map<string, number> {
  const occ = occupancy(assignments);
  const out = new Map<string, number>();
  for (const b of boxIds) {
    const used = [half(b, 0), half(b, 1)].filter((p) => occ.has(p)).length;
    out.set(b, used === 0 ? 2 : used);
  }
  for (const [key, a] of Object.entries(assignments)) {
    if (!a.overflow || !a.halves?.length) continue;
    const anchorBox = boxOf(a.halves[0]);
    out.set(anchorBox, (out.get(anchorBox) ?? 0) + a.overflow);
    void key;
  }
  return out;
}

/** Boxes covered by each assignment (anchor first). */
export function boxesOf(a: ElectiveAssignment): string[] {
  return [...new Set((a.halves ?? []).map(boxOf))];
}
