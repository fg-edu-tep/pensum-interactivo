// B2/B3 — grid geometry of the admin canvas. Deliberately re-implements the
// student canvas layout (components/explorer/MapCanvas.tsx) without importing it:
// a card sits in the column of its semester and in the row given by its index
// among that semester's courses in sortIndex order. A parity test reads the
// student constants from source so the two cannot drift.

export const GEO = {
  COL_PITCH: 168,
  ROW_PITCH: 70,
  CARD_W: 148,
  CARD_H: 60,
  BAND_HEADER_H: 52,
  INSET_X: 20,
  INSET_TOP: 16,
} as const;

export interface LayoutRow {
  id: number;
  semester: number;
  sortIndex: number;
}

export interface Slot {
  semester: number;
  /** 0-based row among that semester's courses */
  row: number;
}

export interface Layout {
  positions: Map<number, { x: number; y: number } & Slot>;
  /** semesters drawn: 1..max (+1 empty "new semester" column when `spare`) */
  semesters: number[];
  maxRows: number;
  bandHeight: number;
}

export const cardX = (semester: number) => GEO.INSET_X + (semester - 1) * GEO.COL_PITCH;
export const cardY = (row: number) => GEO.INSET_TOP + GEO.BAND_HEADER_H + row * GEO.ROW_PITCH;

export function layoutPlan(rows: LayoutRow[], opts: { spare?: boolean } = {}): Layout {
  const by = new Map<number, LayoutRow[]>();
  for (const r of [...rows].sort((a, b) => a.sortIndex - b.sortIndex)) {
    if (!by.has(r.semester)) by.set(r.semester, []);
    by.get(r.semester)!.push(r);
  }
  const maxSem = Math.max(0, ...by.keys());
  const semesters = Array.from({ length: maxSem + (opts.spare ? 1 : 0) }, (_, i) => i + 1);
  const maxRows = Math.max(1, ...[...by.values()].map((l) => l.length));
  const positions: Layout["positions"] = new Map();
  for (const [semester, list] of by)
    list.forEach((r, row) => positions.set(r.id, { x: cardX(semester), y: cardY(row), semester, row }));
  return { positions, semesters, maxRows, bandHeight: GEO.BAND_HEADER_H + maxRows * GEO.ROW_PITCH + 16 };
}

/** Which slot does a card dropped with its top-left at (x, y) belong to? */
export function slotFromPoint(rows: LayoutRow[], movingId: number, x: number, y: number): Slot {
  const maxSem = Math.max(1, ...rows.map((r) => r.semester));
  const semester = Math.min(maxSem + 1, Math.max(1, Math.round((x - GEO.INSET_X) / GEO.COL_PITCH) + 1));
  const others = rows.filter((r) => r.id !== movingId && r.semester === semester).length;
  const row = Math.min(others, Math.max(0, Math.round((y - cardY(0)) / GEO.ROW_PITCH)));
  return { semester, row };
}
