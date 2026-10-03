// Best-effort resolver: given an elective's long name, find the matching live
// course in the Uniandes offering so a student can drop a *real* course (with its
// real code + credit count) into an elective slot in "Mi avance" mode.
//
// GET /api/electives/resolve?q=<name>&term=<term>&program=IELE|IELC|DOBLE
//   200 { code, title, credits, sectionCount, offered }   on a confident match
//   404 { error }                                          no match
//   502 { error }                                          API unavailable

import { NextResponse } from "next/server";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { fetchSections, urlByPrefix, sectionCode } from "@/lib/shared-oferta/fetcher";
import { tokenSetRatio } from "@/lib/import/textMatch";
import type { SeccionAPI } from "@/lib/shared-oferta/ofertaDeCursosAPI";

export const dynamic = "force-dynamic";

// Electives across the bolsa live under a handful of prefixes; IELE covers the
// large majority. Extra prefixes are cheap (one fetch each, cached upstream).
const PREFIXES = ["IELE", "MATE", "ISIS", "IIND", "FISI", "IMEC", "IBIO", "IQUI"];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  let rows: SeccionAPI[] = [];
  try {
    const batches = await Promise.allSettled(
      PREFIXES.map((p) => fetchSections(urlByPrefix(p, term), { timeoutMs: 7000, retries: 1 }))
    );
    for (const b of batches) if (b.status === "fulfilled") rows = rows.concat(b.value);
    if (rows.length === 0 && batches.every((b) => b.status === "rejected")) {
      return NextResponse.json({ error: "API no disponible" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "API no disponible" }, { status: 502 });
  }

  // best title match
  const byCode = new Map<string, SeccionAPI[]>();
  for (const s of rows) {
    const k = sectionCode(s);
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k)!.push(s);
  }

  let best: { code: string; score: number; secs: SeccionAPI[] } | null = null;
  for (const [code, secs] of byCode) {
    const score = tokenSetRatio(q, secs[0]?.title ?? "");
    if (!best || score > best.score) best = { code, score, secs };
  }

  if (!best || best.score < 0.45) {
    return NextResponse.json({ error: "sin coincidencia clara" }, { status: 404 });
  }

  const first = best.secs[0];
  const nrcs = new Set(best.secs.map((s) => String(s.nrc)));
  return NextResponse.json({
    code: best.code,
    title: first.title,
    credits: num(first.credits) || null,
    sectionCount: nrcs.size,
    offered: true,
    matchScore: Math.round(best.score * 100) / 100,
  });
}
