// One elective's detail for the Venn widget's inline panel (agreed 2026-10-29):
// what it is and what it takes to enroll, with requirements as course NAMES.
// One query per click, nothing preloaded. Source priority as everywhere: this
// semester's offering (API) first; when the API doesn't list it, or is down,
// the Registro data stored on the elective.
//
// GET /api/electives/detail?id=<electiveId>&term=<YYYYPP>
//   200 { name, code, credits, offered, source, prereq, coreqs, minCredits,
//         minCreditsSemesters, lastOfferedTerm, nextOfferingTerm }
//   404 { error }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ReqNode } from "@/lib/types";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { parseRequirement, collectCourseCodes } from "@/lib/import/requirementParser";
import { fetchCourseDetails, fetchSections, groupByCode, urlByCourse, urlCourseDetails } from "@/lib/shared-oferta/fetcher";

export const dynamic = "force-dynamic";

function toTitle(s: string): string {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Fundamentos de electrónica y (Lectura en inglés o …)" — names, not codes */
function renderNames(node: ReqNode, names: Map<string, string>, parent: "AND" | "OR" | null = null): string {
  if (node.op === "COURSE") {
    const n = names.get(node.code!);
    const label = n ? toTitle(n) : node.code!.replace(/^([A-Z]+)(\d)/, "$1 $2");
    return node.soft ? `${label} (puede ser al tiempo)` : label;
  }
  const inner = (node.items ?? []).map((it) => renderNames(it, names, node.op as "AND" | "OR")).join(node.op === "AND" ? " y " : " o ");
  return parent && parent !== node.op ? `(${inner})` : inner;
}

async function namesFor(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;
  for (const c of await prisma.course.findMany({ where: { normalizedCode: { in: codes } }, select: { normalizedCode: true, nameEs: true } }))
    out.set(c.normalizedCode, c.nameEs);
  const missing = codes.filter((c) => !out.has(c));
  if (missing.length) {
    for (const r of await prisma.registroCourse.findMany({ where: { normalizedCode: { in: missing } }, select: { normalizedCode: true, nameEs: true }, orderBy: { importId: "desc" } }))
      if (!out.has(r.normalizedCode)) out.set(r.normalizedCode, r.nameEs);
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();
  const e = Number.isFinite(id) ? await prisma.elective.findUnique({ where: { id } }) : null;
  if (!e) return NextResponse.json({ error: "electiva no encontrada" }, { status: 404 });

  let offered: boolean | null = null; // null: couldn't ask the API
  let credits = e.registroCredits ?? null;
  let prereqText: string | null = null;
  let coreqs: string[] = [];
  let source: "api" | "registro" | null = null;

  if (e.code) {
    try {
      const secs = groupByCode(await fetchSections(urlByCourse(e.code, term), { timeoutMs: 6000, retries: 0 })).get(e.code) ?? [];
      offered = secs.length > 0;
      if (secs[0]) {
        const cr = Number(secs[0].credits);
        if (Number.isFinite(cr) && cr > 0) credits = cr;
        const d = await fetchCourseDetails(urlCourseDetails(term, String(secs[0].ptrm ?? ""), secs[0].nrc), { timeoutMs: 6000, retries: 0 });
        if (d) {
          prereqText = (d.prereq[0]?.code ?? "").trim();
          coreqs = d.coreq.map((c) => toTitle(c.title || `${c.subject} ${c.coursenumber}`));
          source = "api";
        }
      }
    } catch {
      offered = null;
    }
  }
  if (source === null && e.registroPrereqText) {
    prereqText = e.registroPrereqText;
    source = "registro";
  }

  const tree = parseRequirement(prereqText);
  const names = await namesFor(tree ? [...collectCourseCodes(tree)] : []);
  return NextResponse.json({
    name: e.name,
    code: e.code,
    credits,
    offered,
    source,
    prereq: tree ? renderNames(tree, names) : null,
    coreqs,
    minCredits: e.minCredits,
    minCreditsSemesters: e.minCredits ? Math.round(e.minCredits / 15) : null,
    lastOfferedTerm: e.lastOfferedTerm,
    nextOfferingTerm: e.nextOfferingTerm,
  });
}
