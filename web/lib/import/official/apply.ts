// Official load, step 2 (DB). Shared by the seed and /administrador/carga.
//
//   1. plans     — catalogs that don't exist yet are created (identity, rules,
//                  requirement nodes); every plan is then diffed against the DB
//                  and applied through the same path as the PLANES template
//                  (applyPlanes.ts: snapshot first, admin-pinned fields kept).
//   2. courses   — per code: requisites' credit restriction, program/level
//                  restriction, last period taught, projected next offering.
//   3. offering  — "se dicta en P" for the current and planning periods as
//                  CourseOffering rows with source "archivo" (an API row wins).
//   4. electives — the bag is replaced by BOLSAS (codes are the identity; rows
//                  that aren't in the file are deleted).
//   5. names     — CodeName, for showing requirements by name.
//   6. settings  — planning period + a summary of the load.

import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { writeAudit } from "../../audit";
import { identityForSlug } from "../../catalogIdentity";
import { rulesForSlug } from "../../catalogRules";
import { requirementNodesForSlug } from "../../requirementNodes";
import { persistParsedCatalog } from "../persistCatalog";
import type { ParsedCatalog, ParsedCourse } from "../parsePensumWorkbook";
import type { PrereqRow } from "../parsePrereqExport";
import { buildPlanesDiff, type PlanesDiff } from "../diffPlanes";
import { applyPlanesJob, type ApplyResult as PlanesApplyResult } from "../applyPlanes";
import { normalizeName } from "../textMatch";
import { rolesFromAttrs } from "./bolsas";
import type { OfficialPrepared } from "./prepare";

import { PLANNING_TERM_KEY, OFFICIAL_LOAD_KEY } from "./settings";
export { planningTermSetting } from "./settings";

export interface OfficialApplyOptions {
  actor?: string;
  /** delete plan rows the file no longer has (default true: the file is official) */
  confirmRemovals?: boolean;
  /** overwrite fields an admin pinned (default false) */
  forceConflicts?: boolean;
}

export interface OfficialApplyResult {
  planningTerm: string;
  createdCatalogs: string[];
  planes: PlanesApplyResult | null;
  courses: number;
  offeringRows: number;
  electives: { upserted: number; deleted: number };
  names: number;
}

/** The ImportJob payload: the matrix at the top level (applyPlanesJob reads
 * it as a ParsedPlanesWorkbook) + everything else under `official`. */
export type OfficialJobPayload = OfficialPrepared["matrix"] & { official: Omit<OfficialPrepared, "matrix"> };

function prereqMapOf(prep: Pick<OfficialPrepared, "codes">): Map<string, PrereqRow> {
  const m = new Map<string, PrereqRow>();
  for (const [code, d] of Object.entries(prep.codes)) {
    m.set(code, {
      normalizedCode: code,
      nameEs: d.name,
      credits: d.credits,
      prereqText: d.prereqText,
      coreqText: d.coreqText,
      restrictions: {
        periodo: d.restrictionPeriodo || undefined,
        programa: d.restrictionPrograma || undefined,
        nivel: d.restrictionNivel || undefined,
      },
    });
  }
  return m;
}

/** Create the ImportJob (status "parsed") holding the whole prepared load + the plan diff. */
export async function createOfficialJob(prep: OfficialPrepared, actor = "admin"): Promise<{ jobId: number; diff: PlanesDiff }> {
  const diff = await buildPlanesDiff(prep.matrix, prisma);
  const { matrix, ...rest } = prep;
  const payload: OfficialJobPayload = { ...matrix, official: rest };
  const job = await prisma.importJob.create({
    data: {
      filename: prep.report.files.planes,
      prereqFilename: prep.report.files.requisitos,
      uploadedBy: actor,
      status: "parsed",
      scope: "official",
      diff: diff as unknown as object,
      parsedPayload: payload as unknown as object,
      warnings: [...prep.report.warnings, ...diff.warnings] as unknown as object,
    },
  });
  await writeAudit({
    actor,
    action: "official.upload",
    entityType: "ImportJob",
    entityId: job.id,
    after: { planningTerm: prep.planningTerm, files: prep.report.files, counts: diff.counts },
  });
  return { jobId: job.id, diff };
}

export function preparedFromJob(payload: OfficialJobPayload): OfficialPrepared {
  const { official, ...matrix } = payload;
  return { ...official, matrix: matrix as OfficialPrepared["matrix"] };
}

export async function applyOfficialJob(jobId: number, opts: OfficialApplyOptions = {}): Promise<OfficialApplyResult> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.scope !== "official") throw new Error("Carga oficial no encontrada");
  if (job.status === "discarded") throw new Error("Esta carga fue descartada");
  const prep = preparedFromJob(job.parsedPayload as unknown as OfficialJobPayload);
  const actor = opts.actor ?? "admin";
  const result: OfficialApplyResult = {
    planningTerm: prep.planningTerm,
    createdCatalogs: [],
    planes: null,
    courses: 0,
    offeringRows: 0,
    electives: { upserted: 0, deleted: 0 },
    names: 0,
  };

  // ---- 1. plans ----
  const prereqMap = prereqMapOf(prep);
  const existing = new Set((await prisma.catalog.findMany({ select: { slug: true } })).map((c) => c.slug));
  for (const plan of prep.matrix.plans) {
    if (existing.has(plan.slug)) continue;
    const list = prep.matrix.courses[plan.slug] ?? [];
    const courses: ParsedCourse[] = list.map((c, i) => ({
      displayCode: c.displayCode,
      normalizedCode: c.normalizedCode,
      name: c.name,
      credits: c.credits ?? 0,
      semester: c.semester ?? 1,
      courseType: c.courseType,
      category: c.category ?? null,
      isPlaceholder: c.isPlaceholder,
      placeholderKind: c.placeholderKind,
      placeholderLabel: c.placeholderLabel,
      sortIndex: i + 1,
    }));
    const parsed: ParsedCatalog = {
      slug: plan.slug,
      programCode: plan.programCode,
      programName: plan.programName,
      variantLabel: plan.variantLabel,
      sheetName: plan.header,
      courses,
      warnings: [],
    };
    const id = identityForSlug(plan.slug);
    const maxSemester = courses.reduce((m, c) => Math.max(m, c.semester), 0);
    await persistParsedCatalog(parsed, prereqMap, {
      status: plan.status,
      term: prep.planningTerm,
      sourceFilename: prep.report.files.planes,
      pair: false,
      identity: {
        accentColor: id.accentColor,
        tagline: id.tagline,
        imagePath: id.imagePath,
        subtitle: maxSemester ? `${plan.programCode.startsWith("M") ? "Maestría" : "CBU3"} · ${maxSemester} semestres` : null,
      },
      rules: plan.programCode.startsWith("M") ? undefined : rulesForSlug(plan.slug),
      requirementNodes: plan.programCode.startsWith("M") ? [] : requirementNodesForSlug(plan.slug),
    });
    result.createdCatalogs.push(plan.slug);
  }
  if (job.status !== "applied") {
    result.planes = await applyPlanesJob(jobId, {
      confirmRemovals: opts.confirmRemovals ?? true,
      forceConflicts: opts.forceConflicts ?? false,
      actor,
    });
  }
  // ---- row order: the file's order within each semester (a course the diff
  //      added would otherwise sit at the bottom of its column) ----
  for (const plan of prep.matrix.plans) {
    const cat = await prisma.catalog.findUnique({ where: { slug: plan.slug }, select: { id: true } });
    if (!cat) continue;
    const rows = await prisma.catalogCourse.findMany({
      where: { catalogId: cat.id },
      orderBy: { sortIndex: "asc" },
      include: { course: { select: { normalizedCode: true } } },
    });
    const keyOf = (isPh: boolean, kind: string | null | undefined, sem: number | null | undefined, code: string, occ: Map<string, number>) => {
      if (!isPh) return code;
      const base = `${kind ?? "SLOT"}#${sem}`;
      const n = (occ.get(base) ?? 0) + 1;
      occ.set(base, n);
      return `${base}#${n}`;
    };
    const fileRank = new Map<string, number>();
    const pOcc = new Map<string, number>();
    (prep.matrix.courses[plan.slug] ?? []).forEach((c, i) =>
      fileRank.set(keyOf(c.isPlaceholder, c.placeholderKind, c.semester, c.normalizedCode, pOcc), i)
    );
    const dOcc = new Map<string, number>();
    const ranked = rows.map((r, i) => {
      const k = keyOf(r.isPlaceholder, r.placeholderKind, r.suggestedSemester, r.course?.normalizedCode ?? r.displayCode.replace(/\s+/g, ""), dOcc);
      return { id: r.id, sem: r.suggestedSemester, rank: fileRank.get(k) ?? 10_000 + i, cur: r.sortIndex };
    });
    ranked.sort((a, b) => a.sem - b.sem || a.rank - b.rank);
    if (ranked.every((r, i) => r.cur === i + 1)) continue;
    await prisma.$transaction(async (tx) => {
      for (const [i, r] of ranked.entries()) await tx.catalogCourse.update({ where: { id: r.id }, data: { sortIndex: 1_000_000 + i } });
      for (const [i, r] of ranked.entries()) await tx.catalogCourse.update({ where: { id: r.id }, data: { sortIndex: i + 1 } });
    });
  }

  // every loaded plan now plans the declared period (its requisites are that period's)
  await prisma.catalog.updateMany({
    where: { slug: { in: prep.matrix.plans.map((p) => p.slug) } },
    data: { term: prep.planningTerm, sourceFilename: prep.report.files.planes },
  });

  // ---- 2. courses (global registry) ----
  const courseRows = await prisma.course.findMany({ select: { id: true, normalizedCode: true } });
  const courseByCode = new Map(courseRows.map((c) => [c.normalizedCode, c.id]));
  for (const [code, d] of Object.entries(prep.codes)) {
    const id = courseByCode.get(code);
    if (id == null) continue;
    const projected = d.projection?.kind === "term" ? d.projection.term : null;
    await prisma.course.update({
      where: { id },
      data: {
        minCredits: d.minCredits,
        minCreditsSemesters: d.minCreditsSemesters,
        restrictionText: d.restrictionPeriodo || null,
        programRestriction: d.restrictionPrograma || null,
        levelRestriction: d.restrictionNivel || null,
        lastOfferedTerm: d.lastOfferedTerm,
        offeringProjection: d.projectionRaw || null,
        ...(d.projection ? { nextOfferingTerm: projected } : {}),
        ...(d.credits != null ? { defaultCredits: d.credits } : {}),
      },
    });
    result.courses += 1;
  }

  // ---- 3. offering per period (an API row is never replaced) ----
  for (const [code, d] of Object.entries(prep.codes)) {
    const courseId = courseByCode.get(code);
    if (courseId == null) continue;
    for (const [term, v] of Object.entries(d.offering)) {
      const prev = await prisma.courseOffering.findUnique({ where: { courseId_term: { courseId, term } }, select: { id: true, source: true } });
      if (prev && prev.source !== "archivo") continue;
      if (v.status === "unknown") {
        if (prev) await prisma.courseOffering.delete({ where: { id: prev.id } });
        continue;
      }
      const data = {
        offered: v.status === "offered",
        canonicalTitle: d.name,
        canonicalCredits: d.credits,
        sectionCount: 0,
        source: "archivo",
        syncError: null,
        lastSyncedAt: new Date(),
      };
      await prisma.courseOffering.upsert({
        where: { courseId_term: { courseId, term } },
        create: { courseId, term, ...data },
        update: data,
      });
      result.offeringRows += 1;
    }
  }

  // ---- 4. electives: BOLSAS replaces the bag ----
  const bagCodes = new Set(prep.bolsas.rows.map((r) => r.normalizedCode));
  const old = await prisma.elective.findMany({ select: { id: true, code: true, normalizedName: true, name: true, codeSource: true } });
  const byCode = new Map(old.filter((e) => e.code).map((e) => [e.code!, e]));
  for (const r of prep.bolsas.rows) {
    const d = prep.codes[r.normalizedCode];
    const offeredTerms = d ? Object.entries(d.offering).filter(([, v]) => v.status === "offered").map(([t]) => t).sort() : [];
    const anyIntegrador = r.attrs.IELE.integrador || r.attrs.IELC.integrador;
    const undergrad = [r.attrs.IELE, r.attrs.IELC].some((a) => Object.values(a).some(Boolean));
    const master = [r.attrs.MIELE, r.attrs.MIELC].some((a) => Object.values(a).some(Boolean));
    const level = undergrad ? "pregrado" : master || /^POST/i.test(r.level) ? "maestria" : "other";
    const data = {
      name: r.name,
      code: r.normalizedCode,
      codeSource: "bolsas",
      level,
      roles: rolesFromAttrs(r.attrs) as unknown as Prisma.InputJsonValue,
      attrs: r.attrs as unknown as Prisma.InputJsonValue,
      isCursoIntegrador: anyIntegrador,
      offeredTerms: offeredTerms as unknown as Prisma.InputJsonValue,
      sourceFiles: [prep.report.files.bolsas] as unknown as Prisma.InputJsonValue,
      frequency: r.projected.kind === "sem" ? "both" : null,
      frequencySource: r.projected.kind === "sem" ? "bolsas" : null,
      lastOfferedTerm: d?.lastOfferedTerm ?? null,
      registroName: r.name,
      registroCredits: r.credits,
      registroPrereqText: d?.prereqText || r.prereqText || null,
      coreqText: d?.coreqText || r.coreqText || null,
      minCredits: d?.minCredits ?? null,
      registroLevel: d?.restrictionNivel || r.restrictions.nivel || null,
      programRestriction: d?.restrictionPrograma || r.restrictions.programa || null,
      projection: r.projectedRaw || null,
      nextOfferingTerm: r.projected.kind === "term" ? r.projected.term : null,
      source: "bolsas",
    };
    const prev = byCode.get(r.normalizedCode);
    if (prev) {
      await prisma.elective.update({ where: { id: prev.id }, data });
    } else {
      // normalizedName is unique and two codes can share a name (OPTIMIZACIÓN is
      // IELE 3006 and IELE 4011): the code makes it unique
      const nn = `${normalizeName(r.name) || r.normalizedCode} · ${r.normalizedCode}`;
      const clash = old.find((e) => e.normalizedName === nn);
      if (clash) await prisma.elective.delete({ where: { id: clash.id } }).catch(() => undefined);
      await prisma.elective.create({ data: { ...data, normalizedName: nn } });
    }
    result.electives.upserted += 1;
  }
  const stale = await prisma.elective.findMany({ where: { OR: [{ code: null }, { code: { notIn: [...bagCodes] } }] }, select: { id: true } });
  if (stale.length) {
    await prisma.elective.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    result.electives.deleted = stale.length;
  }

  // ---- 5. names ----
  const entries = Object.entries(prep.names);
  await prisma.codeName.deleteMany({});
  for (let i = 0; i < entries.length; i += 500) {
    await prisma.codeName.createMany({
      data: entries.slice(i, i + 500).map(([code, n]) => ({ code, name: n.name, credits: n.credits, period: n.period })),
      skipDuplicates: true,
    });
  }
  result.names = entries.length;

  // ---- 6. settings + audit ----
  const summary = {
    jobId,
    appliedAt: new Date().toISOString(),
    actor,
    planningTerm: prep.planningTerm,
    currentTerm: prep.currentTerm,
    files: prep.report.files,
    result: { ...result, planes: result.planes ? { perCatalog: result.planes.perCatalog } : null },
  };
  await prisma.adminSetting.upsert({ where: { key: PLANNING_TERM_KEY }, create: { key: PLANNING_TERM_KEY, value: prep.planningTerm }, update: { value: prep.planningTerm } });
  await prisma.adminSetting.upsert({
    where: { key: OFFICIAL_LOAD_KEY },
    create: { key: OFFICIAL_LOAD_KEY, value: JSON.stringify(summary) },
    update: { value: JSON.stringify(summary) },
  });
  if (job.status !== "applied") await prisma.importJob.update({ where: { id: jobId }, data: { status: "applied", appliedAt: new Date() } });
  await writeAudit({ actor, action: "official.apply", entityType: "ImportJob", entityId: jobId, after: summary });
  return result;
}
