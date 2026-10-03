// Server-side: decide which term to sync offerings for.
//
// Precedence:
//   1. OFFERINGS_TERM, if set to a real code (explicit pin — "auto"/blank = skip)
//   2. the live API: a blank-`term` query returns the term Uniandes is
//      currently offering (verified: 202620 on 2026-10-02; unpublished and past
//      terms return 0 rows), so it's the authority on "what can I register for"
//   3. the calendar (termFromDate) when the API is unreachable/empty

import { fetchSections, urlByPrefix } from "./shared-oferta/fetcher";
import { parseTerm, termFromDate } from "./term";

export type TermSource = "env" | "api" | "date";
export interface ResolvedTerm {
  term: string;
  source: TermSource;
  /** the calendar's term, for comparing against `term` (they legitimately
   * differ while registration for the next term is already open) */
  dateTerm: string;
}

export async function resolveOfferingTerm(): Promise<ResolvedTerm> {
  const dateTerm = termFromDate();
  const pinned = (process.env.OFFERINGS_TERM ?? "").trim();
  if (pinned && pinned.toLowerCase() !== "auto") {
    return { term: pinned, source: "env", dateTerm };
  }
  try {
    const rows = await fetchSections(urlByPrefix("IELE", ""), { timeoutMs: 8000, retries: 1 });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.term ?? "");
      if (parseTerm(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) return { term: best[0], source: "api", dateTerm };
  } catch {
    /* fall through to the calendar */
  }
  return { term: dateTerm, source: "date", dateTerm };
}
