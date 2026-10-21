// Electives: the bag (BOLSA DE ELECTIVAS.xlsx → Elective rows) is the source of
// WHICH electives exist; the live Uniandes offering only ENRICHES them (real
// code, credits, section count) when it can be matched. An elective the API
// doesn't know is still listed with its Excel data.
//
// Used by /api/electives/enrich (whole bag at once) and /api/electives/resolve
// (one name). Section rows per prefix are cached for a few minutes so the two
// routes and repeat visits don't re-hit the API.

import { fetchSections, groupByCode, urlByPrefix } from "./shared-oferta/fetcher";
import type { SeccionAPI } from "./shared-oferta/ofertaDeCursosAPI";
import { tokenSetRatio } from "./import/textMatch";
import { normalizeCode } from "./import/normalizeCode";

// Electives across the bag live under a handful of prefixes; IELE covers the
// large majority. Extra prefixes are cheap (one fetch each, cached).
export const ELECTIVE_PREFIXES = ["IELE", "MATE", "ISIS", "IIND", "FISI", "IMEC", "IBIO", "IQUI"];
export const MIN_MATCH_SCORE = 0.45;
const TTL_MS = 10 * 60 * 1000;

export interface OfferingMatch {
  code: string;
  title: string;
  credits: number | null;
  sectionCount: number;
  score: number;
}

const cache = new Map<string, { at: number; rows: SeccionAPI[] }>();

/** Section rows for the elective prefixes, or null when the API is down. */
export async function electiveOfferingRows(term: string): Promise<Map<string, SeccionAPI[]> | null> {
  const results = await Promise.allSettled(
    ELECTIVE_PREFIXES.map(async (p) => {
      const key = `${term}:${p}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
      const rows = await fetchSections(urlByPrefix(p, term), { timeoutMs: 7000, retries: 1 });
      cache.set(key, { at: Date.now(), rows });
      return rows;
    })
  );
  if (results.every((r) => r.status === "rejected")) return null;
  const rows = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return groupByCode(rows);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMatch(code: string, secs: SeccionAPI[], score: number): OfferingMatch {
  const first = secs[0];
  return {
    code,
    title: String(first?.title ?? ""),
    credits: num(first?.credits) || null,
    sectionCount: new Set(secs.map((s) => String(s.nrc))).size,
    score: Math.round(score * 100) / 100,
  };
}

/** Best offering for an elective: its known code first, else the closest title. */
export function matchElective(
  byCode: Map<string, SeccionAPI[]>,
  name: string,
  knownCode?: string | null
): OfferingMatch | null {
  const code = knownCode ? normalizeCode(knownCode) : "";
  if (code && byCode.has(code)) return toMatch(code, byCode.get(code)!, 1);
  let best: { code: string; score: number; secs: SeccionAPI[] } | null = null;
  for (const [c, secs] of byCode) {
    const score = tokenSetRatio(name, String(secs[0]?.title ?? ""));
    if (!best || score > best.score) best = { code: c, score, secs };
  }
  if (!best || best.score < MIN_MATCH_SCORE) return null;
  return toMatch(best.code, best.secs, best.score);
}
