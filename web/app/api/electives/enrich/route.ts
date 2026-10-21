// Enriches the whole elective bag with the live offering in one call. The bag
// (Excel → Elective rows) stays the list; this only adds code / credits /
// sections where the API has a confident match.
//
// GET /api/electives/enrich?term=<term>
//   200 { apiAvailable: true,  matches: { [electiveId]: { code, title, credits, sectionCount } } }
//   200 { apiAvailable: false, matches: {} }       API down — the picker keeps the Excel data

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { electiveOfferingRows, matchElective, type OfferingMatch } from "@/lib/electiveMatch";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();

  const byCode = await electiveOfferingRows(term).catch(() => null);
  if (!byCode) return NextResponse.json({ apiAvailable: false, matches: {} });

  const electives = await prisma.elective.findMany({ select: { id: true, name: true, code: true } });
  const matches: Record<number, Omit<OfferingMatch, "score">> = {};
  for (const e of electives) {
    const m = matchElective(byCode, e.name, e.code);
    if (m) matches[e.id] = { code: m.code, title: m.title, credits: m.credits, sectionCount: m.sectionCount };
  }
  return NextResponse.json(
    { apiAvailable: true, matches },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
