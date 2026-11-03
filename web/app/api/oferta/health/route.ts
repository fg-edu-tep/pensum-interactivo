// Preflight for the Uniandes course API (agreed 2026-10-29: when the API fails,
// the planner must not give partial or wrong answers). One light, known query
// — a single course — with a ~5 s timeout, cached briefly. An EMPTY answer is
// fine (the API is up, the course just isn't offered); only an error counts as
// down.
//
// GET /api/oferta/health → { ok, checkedAt, error? }
// OFERTA_PREFLIGHT=off skips the check (local development without network).

import { NextResponse } from "next/server";
import { fetchSections, urlByCourse } from "@/lib/shared-oferta/fetcher";

export const dynamic = "force-dynamic";

const PROBE_CODE = "IELE1002";
const TTL_OK_MS = 5 * 60 * 1000;
const TTL_DOWN_MS = 30 * 1000;
let last: { at: number; ok: boolean; error?: string } | null = null;

export async function GET() {
  if (process.env.OFERTA_PREFLIGHT === "off") {
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), skipped: true });
  }
  const now = Date.now();
  if (last && now - last.at < (last.ok ? TTL_OK_MS : TTL_DOWN_MS)) {
    return NextResponse.json({ ok: last.ok, checkedAt: new Date(last.at).toISOString(), error: last.error });
  }
  try {
    // no term: the API answers with its current offering (one request, no lookups)
    await fetchSections(urlByCourse(PROBE_CODE, ""), { timeoutMs: 5000, retries: 0 });
    last = { at: now, ok: true };
  } catch (e) {
    last = { at: now, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return NextResponse.json(
    { ok: last.ok, checkedAt: new Date(last.at).toISOString(), error: last.error },
    { headers: { "Cache-Control": "no-store" } }
  );
}
