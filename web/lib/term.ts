// Uniandes academic terms. Isomorphic + pure (no I/O) — safe in client components.
//
// Banner term code = YYYYPP:
//   10  first semester   (Jan–May)  → "2026-1"
//   19  intersemestral   (Jun–Jul)  → "2026-Inter"   (the vacation term)
//   20  second semester  (Aug–Dec)  → "2026-2"
// Dates are read in Bogotá time (UTC-5, no DST) so a server in another zone
// doesn't flip the term hours early/late.
//
// Codes outside this set are NOT guessed at: they display as the raw code and
// never anchor "next term" maths (see `parseTerm`).

export type TermPeriod = "10" | "19" | "20";

const TERM_RE = /^(\d{4})(10|19|20)$/;
const BOGOTA_OFFSET_MS = -5 * 3600 * 1000;

export function parseTerm(code: string): { year: number; period: TermPeriod } | null {
  const m = TERM_RE.exec(code);
  return m ? { year: Number(m[1]), period: m[2] as TermPeriod } : null;
}

/** The academic term a calendar date falls in. */
export function termFromDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  if (month <= 5) return `${year}10`;
  if (month >= 8) return `${year}20`;
  return `${year}19`;
}

/** The next *regular* semester after `code` — the intersemestral is skipped
 * (planning looks one semester ahead, D-6). Unknown codes fall back to "today". */
export function nextRegularTerm(code: string): string {
  const t = parseTerm(code) ?? parseTerm(termFromDate())!;
  return t.period === "20" ? `${t.year + 1}10` : `${t.year}20`;
}

/** The term the planner/basket targets right now: the next regular semester
 * after the one the calendar is in. */
export function planTerm(now: Date = new Date()): string {
  return nextRegularTerm(termFromDate(now));
}

/** "202620" -> "2026-2"; "202619" -> "2026-Inter"; anything else -> as given. */
export function termLabel(code: string): string {
  const t = parseTerm(code);
  if (!t) return code;
  return `${t.year}-${t.period === "10" ? "1" : t.period === "20" ? "2" : "Inter"}`;
}
