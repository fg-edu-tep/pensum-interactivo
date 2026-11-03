// Electives as ONE credit bag (agreed 2026-10-29, release gate 3). A plan's
// 2-credit ELECTIVA boxes are one bag of 1-credit halves, in pensum order. The
// student's chosen electives are an ordered list (the order they were added);
// the layout is a pure function of that list and is never stored:
//
//   expand the boxes into halves (2 per box) → each course takes the next k
//   free halves → whatever doesn't fit is overflow ("excedente")
//
// So any sequence of 1–4 credit courses works (3, 2, 4, 1, 4, 1, 4 …), removing
// one moves the later ones up, and a course can be split between the bag and
// the overflow ("2 cr en electivas + 1 cr excedente"). Boxes a student marked
// as seen without naming a course ("vista sin especificar") are left out of
// the bag so nothing is placed over them. Pure, isomorphic.

export interface BagItem {
  /** stable key: "e<electiveId>" for a bag course, "u<n>" for an unnamed one */
  key: string;
  electiveId?: number;
  code: string | null;
  title: string;
  credits: number;
  sectionCount?: number;
  /** "Electiva sin especificar" — the student didn't name the course */
  unnamed?: boolean;
}

/** The synthetic course id a bag item uses in the approved / cart sets. */
export const bagCourseId = (key: string) => `bag:${key}`;
export const isBagCourseId = (id: string) => id.startsWith("bag:");
export const bagKeyOf = (id: string) => id.slice(4);

export interface HalfCell {
  key: string;
  title: string;
  credits: number;
  /** the course started in an earlier box ("(cont.)") */
  cont: boolean;
}

export interface ItemPlacement {
  /** credits that landed in the bag */
  inBag: number;
  /** credits beyond the bag */
  overflow: number;
  /** boxes it touches, in order */
  boxes: string[];
}

export interface BagLayout {
  /** box id → its two halves (null = free) */
  boxes: Map<string, [HalfCell | null, HalfCell | null]>;
  items: Map<string, ItemPlacement>;
  capacity: number;
  used: number;
  overflow: number;
}

export function layoutBag(boxIds: string[], items: BagItem[], skipBoxes: Set<string> = new Set()): BagLayout {
  const usable = boxIds.filter((b) => !skipBoxes.has(b));
  const slots: { box: string; h: 0 | 1 }[] = usable.flatMap((box) => [
    { box, h: 0 as const },
    { box, h: 1 as const },
  ]);
  const boxes = new Map<string, [HalfCell | null, HalfCell | null]>();
  for (const b of boxIds) boxes.set(b, [null, null]);
  const placements = new Map<string, ItemPlacement>();
  let next = 0;
  let overflow = 0;
  for (const it of items) {
    const k = Math.max(0, Math.round(it.credits));
    const taken = slots.slice(next, next + k);
    next += taken.length;
    const firstBox = taken[0]?.box;
    for (const s of taken) {
      boxes.get(s.box)![s.h] = { key: it.key, title: it.title, credits: it.credits, cont: s.box !== firstBox };
    }
    const over = k - taken.length;
    overflow += over;
    placements.set(it.key, { inBag: taken.length, overflow: over, boxes: [...new Set(taken.map((s) => s.box))] });
  }
  return { boxes, items: placements, capacity: slots.length, used: next, overflow };
}

/** "A · A", "A (cont.) · B", "C · 1 cr libre" — the text of one box, for tests and aria. */
export function boxText(pair: [HalfCell | null, HalfCell | null]): string {
  const label = (c: HalfCell | null) => (c ? `${c.title}${c.cont ? " (cont.)" : ""}` : "libre");
  return `${label(pair[0])} · ${label(pair[1])}`;
}

/** "Esta materia vale 3 créditos: ocupa 1½ casillas" */
export function spanText(credits: number): string {
  const boxes = credits / 2;
  const whole = Math.floor(boxes);
  const n = boxes === whole ? String(whole) : whole === 0 ? "½" : `${whole}½`;
  return `Esta materia vale ${credits} crédito${credits === 1 ? "" : "s"}: ocupa ${n} casilla${boxes > 1 ? "s" : ""}`;
}

/** "2 cr en electivas + 1 cr excedente" for a split course, else null. */
export function splitText(p: ItemPlacement | undefined): string | null {
  if (!p || p.overflow === 0) return null;
  if (p.inBag === 0) return `${p.overflow} cr excedente (las casillas de electivas ya están llenas)`;
  return `${p.inBag} cr en electivas + ${p.overflow} cr excedente`;
}

let counter = 0;
/** A fresh key for an unnamed elective. */
export function unnamedKey(existing: BagItem[]): string {
  const used = new Set(existing.map((i) => i.key));
  let k = `u${Date.now().toString(36)}${counter++}`;
  while (used.has(k)) k = `u${Date.now().toString(36)}${counter++}`;
  return k;
}

/** Older saves (one box = one course with stored halves) → bag items, in the
 * pensum order of their first box; their box ids in approved / plan become the
 * item's. Returns null when there's nothing to migrate. */
export function migrateToBag(
  boxIds: string[],
  assignments: Record<string, { code: string | null; title: string; credits: number | null; electiveId?: number; sectionCount?: number; halves?: string[] }>,
  approved: Set<string>,
  planned: Map<string, string>
): { items: BagItem[]; assignments: typeof assignments; approved: Set<string>; planned: Map<string, string> } | null {
  const boxSet = new Set(boxIds);
  const anchors = Object.keys(assignments).filter((k) => boxSet.has(k));
  if (anchors.length === 0) return null;
  anchors.sort((a, b) => boxIds.indexOf(a) - boxIds.indexOf(b));
  const items: BagItem[] = [];
  const nextAssignments = { ...assignments };
  const nextApproved = new Set(approved);
  const nextPlanned = new Map(planned);
  for (const a of anchors) {
    const x = assignments[a];
    const key = x.electiveId != null ? `e${x.electiveId}` : `m${a}`;
    if (items.some((i) => i.key === key)) continue;
    items.push({ key, electiveId: x.electiveId, code: x.code, title: x.title, credits: x.credits ?? 2, sectionCount: x.sectionCount });
    delete nextAssignments[a];
    const id = bagCourseId(key);
    if (approved.has(a)) nextApproved.add(id);
    const t = planned.get(a);
    if (t) nextPlanned.set(id, t);
  }
  // the boxes themselves no longer carry the state (the items do)
  for (const a of anchors) {
    const covered = new Set([a, ...(assignments[a].halves ?? []).map((h) => h.slice(0, h.lastIndexOf("#")))]);
    for (const b of covered) {
      nextApproved.delete(b);
      nextPlanned.delete(b);
    }
  }
  return { items, assignments: nextAssignments, approved: nextApproved, planned: nextPlanned };
}
