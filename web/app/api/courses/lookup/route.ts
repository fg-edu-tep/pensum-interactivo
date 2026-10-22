// One course by code, with the information priority used everywhere: the live
// offering for the term first; when it doesn't list the course, what the
// database knows (Course row from the Registro export / seed, then the latest
// Registro upload). Used by the "Electiva en Fundamentos de Ingeniería" slot,
// where any engineering code (I***) is valid.
//
// GET /api/courses/lookup?code=IMEC1234&term=202620
//   200 { code, title, credits, sectionCount, offered, source: "api" | "database" | "registro" }
//   400 { error }   not a course code
//   404 { error }   no source knows the code

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveOfferingTerm } from "@/lib/termResolve";
import { normalizeCode } from "@/lib/import/normalizeCode";
import { fetchSections, groupByCode, urlByCourse } from "@/lib/shared-oferta/fetcher";
import { liveRegistroImportId } from "@/lib/requirementSources";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = normalizeCode(searchParams.get("code") ?? "");
  const term = (searchParams.get("term") ?? (await resolveOfferingTerm()).term).trim();
  if (!/^[A-Z]{4}\d{4}[A-Z]?$/.test(code)) return NextResponse.json({ error: "código inválido" }, { status: 400 });

  // 1. the live offering
  let apiDown = false;
  try {
    const secs = groupByCode(await fetchSections(urlByCourse(code, term), { timeoutMs: 7000, retries: 1 })).get(code);
    if (secs && secs.length) {
      const credits = Number(secs[0].credits);
      return NextResponse.json({
        code,
        title: String(secs[0].title ?? ""),
        credits: Number.isFinite(credits) && credits > 0 ? credits : null,
        sectionCount: new Set(secs.map((s) => String(s.nrc))).size,
        offered: true,
        source: "api",
      });
    }
  } catch {
    apiDown = true;
  }

  // 2. the database's course row
  const course = await prisma.course.findUnique({ where: { normalizedCode: code } });
  if (course) {
    return NextResponse.json({
      code,
      title: course.nameEs,
      credits: course.defaultCredits ?? null,
      sectionCount: 0,
      offered: apiDown ? null : false,
      source: "database",
    });
  }

  // 3. the Registro upload
  const importId = await liveRegistroImportId();
  const reg =
    importId == null
      ? null
      : await prisma.registroCourse.findUnique({ where: { importId_normalizedCode: { importId, normalizedCode: code } } });
  if (reg) {
    return NextResponse.json({
      code,
      title: reg.nameEs,
      credits: reg.credits ?? null,
      sectionCount: 0,
      offered: apiDown ? null : false,
      source: "registro",
    });
  }

  return NextResponse.json({ error: apiDown ? "API no disponible y código desconocido" : "código no encontrado" }, { status: 404 });
}
