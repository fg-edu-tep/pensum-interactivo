// Enriches the whole elective bag with the live offering in one call. The bag
// (Excel → Elective rows) stays the list; this only adds code / credits /
// sections where the API has a confident match.
//
// GET /api/electives/enrich?term=<term>
//   200 { apiAvailable: true,  matches: { [electiveId]: { code, title, credits, sectionCount, prereqText? } } }
//        prereqText: this term's prerequisites ("" = none; absent = couldn't read them)
//   200 { apiAvailable: false, matches: {} }       API down — the picker keeps the Excel data

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { electiveOfferingRows, matchElective, offeringPrereqText, type OfferingMatch } from "@/lib/electiveMatch";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();

  const byCode = await electiveOfferingRows(term).catch(() => null);
  if (!byCode) return NextResponse.json({ apiAvailable: false, matches: {} });

  const electives = await prisma.elective.findMany({ select: { id: true, name: true, code: true } });
  const matches: Record<number, Omit<OfferingMatch, "score"> & { prereqText?: string }> = {};
  const found: { id: number; m: OfferingMatch }[] = [];
  for (const e of electives) {
    const m = matchElective(byCode, e.name, e.code);
    if (m) found.push({ id: e.id, m });
  }
  // this term's prerequisites (the API wins over Registro), 4 at a time
  for (let i = 0; i < found.length; i += 4) {
    await Promise.all(
      found.slice(i, i + 4).map(async ({ id, m }) => {
        const prereqText = await offeringPrereqText(term, m.code, byCode.get(m.code) ?? []);
        matches[id] = { code: m.code, title: m.title, credits: m.credits, sectionCount: m.sectionCount, prereqText };
      })
    );
  }
  return NextResponse.json(
    { apiAvailable: true, matches },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
