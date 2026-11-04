// One elective's detail for the electives table's inline panel (/embed/electivas):
// what it takes to enroll, for the PLANNING period (2027-1 while 2026-2 runs),
// with requirements as course NAMES grouped for reading (lib/electiveRequirements).
// One query per click, nothing preloaded. Source priority as everywhere:
//   override  an admin pinned the course's plan value (CatalogCourse.*Override)
//   api       the live course details for that period
//   registro  the PRERREQUISITOS_<periodo> row stored on the elective by the
//             official load (planning period's row, else the newest earlier one)
// Prereqs and coreqs are resolved independently.
//
// GET /api/electives/detail?id=<electiveId>&term=<YYYYPP>
//   200 { name, code, credits, offered, term, prereq, prereqSource, coreq,
//         coreqSource, reqTerm, minCredits, minCreditsSemesters,
//         lastOfferedTerm, nextOfferingTerm, projection }
//   404 { error }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ReqNode } from "@/lib/types";
import { planningTermSetting } from "@/lib/import/official/settings";
import { planTerm } from "@/lib/term";
import { parseRequirement, collectCourseCodes } from "@/lib/import/requirementParser";
import { parseCoreqText } from "@/lib/requirementResolve";
import { toReqView, type ReqView } from "@/lib/electiveRequirements";
import { fetchCourseDetails, fetchSections, groupByCode, urlByCourse, urlCourseDetails } from "@/lib/shared-oferta/fetcher";

export const dynamic = "force-dynamic";

type Source = "override" | "api" | "registro" | null;

async function namesFor(codes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;
  for (const c of await prisma.course.findMany({ where: { normalizedCode: { in: codes } }, select: { normalizedCode: true, nameEs: true } }))
    out.set(c.normalizedCode, c.nameEs);
  for (const c of await prisma.codeName.findMany({ where: { code: { in: codes.filter((x) => !out.has(x)) } }, select: { code: true, name: true } }).catch(() => []))
    out.set(c.code, c.name);
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
  const asked = (searchParams.get("term") ?? "").trim();
  const term = /^\d{6}$/.test(asked) ? asked : (await planningTermSetting()) ?? planTerm();
  const e = Number.isFinite(id) ? await prisma.elective.findUnique({ where: { id } }) : null;
  if (!e) return NextResponse.json({ error: "electiva no encontrada" }, { status: 404 });

  let offered: boolean | null = null; // null: couldn't ask the API
  let credits = e.registroCredits ?? null;
  let prereqTree: ReqNode | null = null;
  let coreqTree: ReqNode | null = null;
  let prereqSource: Source = null;
  let coreqSource: Source = null;

  // 0. an admin override on a plan row of the same course (MCP / admin editor)
  if (e.code) {
    const pinned = await prisma.catalogCourse.findFirst({
      where: { course: { normalizedCode: e.code }, OR: [{ prereqOverride: true }, { coreqOverride: true }], catalog: { status: { not: "archived" } } },
      select: { prereqOverride: true, coreqOverride: true, prereqText: true, coreqText: true },
    });
    if (pinned?.prereqOverride) {
      prereqTree = parseRequirement(pinned.prereqText ?? "");
      prereqSource = "override";
    }
    if (pinned?.coreqOverride) {
      coreqTree = parseCoreqText(pinned.coreqText ?? "");
      coreqSource = "override";
    }
  }

  // 1. the live API for that period
  if (e.code) {
    try {
      const secs = groupByCode(await fetchSections(urlByCourse(e.code, term), { timeoutMs: 6000, retries: 0 })).get(e.code) ?? [];
      offered = secs.length > 0;
      if (secs[0]) {
        const cr = Number(secs[0].credits);
        if (Number.isFinite(cr) && cr > 0) credits = cr;
        const d = await fetchCourseDetails(urlCourseDetails(term, String(secs[0].ptrm ?? ""), secs[0].nrc), { timeoutMs: 6000, retries: 0 });
        if (d) {
          if (!prereqSource) {
            prereqTree = parseRequirement((d.prereq[0]?.code ?? "").trim());
            prereqSource = "api";
          }
          if (!coreqSource) {
            coreqTree = parseCoreqText(d.coreq.map((c) => `${c.subject} ${c.coursenumber}`).join(" Y "));
            coreqSource = "api";
          }
        }
      }
    } catch {
      offered = null;
    }
  }

  // 2. the Registro file stored on the elective
  if (!prereqSource && e.registroPrereqText) {
    prereqTree = parseRequirement(e.registroPrereqText);
    prereqSource = "registro";
  }
  if (!coreqSource && e.coreqText) {
    coreqTree = parseCoreqText(e.coreqText);
    coreqSource = "registro";
  }

  const codes = new Set<string>();
  for (const t of [prereqTree, coreqTree]) if (t) for (const c of collectCourseCodes(t)) codes.add(c);
  const names = await namesFor([...codes]);
  const offeredTerms = (e.offeredTerms as string[] | null) ?? [];
  // the file's row is the planning period's when the course has one, else the newest earlier
  const usesRegistro = prereqSource === "registro" || coreqSource === "registro";
  const reqTerm = !usesRegistro ? term : offeredTerms.includes(term) ? term : e.lastOfferedTerm ?? term;

  const prereq: ReqView | null = toReqView(prereqTree, names);
  const coreq: ReqView | null = toReqView(coreqTree, names);
  return NextResponse.json({
    name: e.name,
    code: e.code,
    credits,
    offered,
    term,
    prereq,
    prereqSource: prereq ? prereqSource : null,
    coreq,
    coreqSource: coreq ? coreqSource : null,
    reqTerm,
    minCredits: e.minCredits,
    minCreditsSemesters: e.minCredits ? Math.round(e.minCredits / 15) : null,
    lastOfferedTerm: e.lastOfferedTerm,
    nextOfferingTerm: e.nextOfferingTerm,
    projection: e.projection,
  });
}
