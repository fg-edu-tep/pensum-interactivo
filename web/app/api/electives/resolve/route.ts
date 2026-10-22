// Best-effort resolver: given an elective's long name, find the matching live
// course in the Uniandes offering so a student can drop a *real* course (with its
// real code + credit count) into an elective slot in "Mi avance" mode.
//
// GET /api/electives/resolve?q=<name>&term=<term>&program=IELE|IELC|DOBLE[&code=<known code>]
//   200 { code, title, credits, sectionCount, offered }   on a confident match
//   404 { error }                                          no match
//   502 { error }                                          API unavailable

import { NextResponse } from "next/server";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { electiveOfferingRows, matchElective } from "@/lib/electiveMatch";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const byCode = await electiveOfferingRows(term).catch(() => null);
  if (!byCode) return NextResponse.json({ error: "API no disponible" }, { status: 502 });

  const best = matchElective(byCode, q, searchParams.get("code"));
  if (!best) return NextResponse.json({ error: "sin coincidencia clara" }, { status: 404 });

  return NextResponse.json({
    code: best.code,
    title: best.title,
    credits: best.credits,
    sectionCount: best.sectionCount,
    offered: true,
    matchScore: best.score,
  });
}
