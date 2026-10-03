// Section/schedule shapes shared by /api/sections and the basket modal, plus the
// small pure helpers around them (formatting, conflict detection). No I/O.

/** 0 = Lunes … 6 = Domingo (the API's l,m,i,j,v,s,d columns; "i" is miércoles). */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Meeting {
  day: DayIndex;
  /** minutes from midnight */
  start: number;
  end: number;
  room: string;
  building: string;
}

export interface SectionInfo {
  nrc: string;
  section: string;
  instructors: string[];
  seatsMax: number;
  seatsEnrolled: number;
  /** seats left; negative = over-enrolled */
  seatsAvail: number;
  campus: string;
  periodDesc: string; // "16 SEMANAS", "8A"…
  meetings: Meeting[];
}

export interface CourseSections {
  /** the term the sections belong to */
  term: string;
  /** the term the caller asked for (differs when it isn't published yet) */
  requestedTerm: string;
  /** true when `term` !== `requestedTerm`: shown as "referencia" */
  isReference: boolean;
  sections: SectionInfo[];
}

export interface SectionsResponse {
  /** keyed by normalized course code ("IELE1002") */
  courses: Record<string, CourseSections>;
  /** codes whose lookup failed (API down / timeout) */
  failed: string[];
}

export const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const DAY_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

/** "0800" -> 480 */
export function parseHHMM(v: string | number | null | undefined): number {
  const s = String(v ?? "").padStart(4, "0");
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
}

/** 480 -> "8:00", 810 -> "13:30" (24h, as Uniandes prints it) */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
}

/** "SALAZAR GOMEZ ANTONIO JOSE" -> "Salazar Gómez Antonio José" is not
 * recoverable (accents were stripped upstream) — just fix the casing. */
export function titleCaseName(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Meetings of a section grouped by identical time/room, days merged:
 * "Mié · Vie  8:00–9:20  ML_608". Keeps the list short in the UI. */
export function summarizeMeetings(meetings: Meeting[]): { days: DayIndex[]; start: number; end: number; room: string }[] {
  const byKey = new Map<string, { days: DayIndex[]; start: number; end: number; room: string }>();
  for (const m of meetings) {
    const key = `${m.start}-${m.end}-${m.room}`;
    const cur = byKey.get(key);
    if (cur) {
      if (!cur.days.includes(m.day)) cur.days.push(m.day);
    } else {
      byKey.set(key, { days: [m.day], start: m.start, end: m.end, room: m.room });
    }
  }
  return [...byKey.values()].map((g) => ({ ...g, days: g.days.sort((a, b) => a - b) }));
}

/** Do two sections meet at the same time on the same day? */
export function sectionsConflict(a: SectionInfo, b: SectionInfo): boolean {
  for (const x of a.meetings) {
    for (const y of b.meetings) {
      if (x.day === y.day && x.start < y.end && y.start < x.end) return true;
    }
  }
  return false;
}
