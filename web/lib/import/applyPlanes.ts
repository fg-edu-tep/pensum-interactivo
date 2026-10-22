// Applies a parsed PLANES.xlsx import job. Re-diffs against the live DB (so a
// concurrent edit can't be silently lost), snapshots each affected catalog, then
// upserts by key inside one transaction. It does NOT re-pair against the course
// API — new courses land as `needs_manual` and show up in the manual-pairing
// queue (P2.4 "Re-sync" pulls the offering data).

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { buildCatalogPayload } from "../catalogPayload";
import { normalizeCode } from "./normalizeCode";
import { parseRequirement } from "./requirementParser";
import { writeAudit } from "../audit";
import { buildPlanesDiff } from "./diffPlanes";
import type { ParsedPlanCourse, ParsedPlanesWorkbook } from "./parsePlanesWorkbook";
import type { CatalogRules, GateRule } from "../types";
import { isCreditUnlock } from "../creditUnlocks";

export interface ApplyOptions {
  /** delete CatalogCourse rows the sheet no longer contains (default: keep) */
  confirmRemovals?: boolean;
  /** overwrite fields the admin pinned via lockedFields / manuallyEdited */
  forceConflicts?: boolean;
  /** per-course opt-out: `"<slug>::<courseKey>"` entries are skipped on apply */
  excludeKeys?: string[];
  actor?: string;
}

export interface ApplyResult {
  applied: boolean;
  perCatalog: {
    slug: string;
    added: number;
    modified: number;
    removed: number;
    kept: number;
  }[];
  requirementNodes: { added: number; modified: number; removed: number };
  gradRules: { added: number; modified: number; removed: number };
  snapshotIds: number[];
}

function courseCreateData(
  catalogId: number,
  pc: ParsedPlanCourse,
  sortIndex: number,
  courseId: number | null
): Prisma.CatalogCourseUncheckedCreateInput {
  const coreqExpr = ""; // template has no coreq column; API/courseDetails owns it
  return {
    catalogId,
    courseId,
    displayCode: pc.displayCode,
    name: pc.name,
    credits: pc.credits ?? 0,
    suggestedSemester: pc.semester ?? 0,
    courseType: pc.courseType,
    isPlaceholder: pc.isPlaceholder,
    placeholderKind: pc.placeholderKind ?? null,
    placeholderLabel: pc.placeholderLabel ?? null,
    sortIndex,
    prereqText: pc.prereqText || null,
    coreqText: null,
    prereqTree: (parseRequirement(pc.prereqText) ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
    coreqTree: parseRequirement(coreqExpr) as unknown as Prisma.InputJsonValue,
    pairingStatus: "needs_manual",
  };
}

export async function applyPlanesJob(
  jobId: number,
  opts: ApplyOptions = {}
): Promise<ApplyResult> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Import job no encontrado");
  if (job.status === "applied") throw new Error("Este import ya fue aplicado");
  if (job.status === "discarded") throw new Error("Este import fue descartado");

  const parsed = job.parsedPayload as unknown as ParsedPlanesWorkbook;
  const diff = await buildPlanesDiff(parsed, prisma);

  const dbCatalogs = await prisma.catalog.findMany({
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(dbCatalogs.map((c) => [c.slug, c.id]));

  // snapshots first (outside the txn is fine — they only read)
  const snapshotIds: number[] = [];
  for (const cd of diff.catalogs) {
    const catId = idBySlug.get(cd.slug);
    if (!catId) continue;
    const payload = await buildCatalogPayload(cd.slug);
    const snap = await prisma.catalogSnapshot.create({
      data: {
        catalogId: catId,
        payload: (payload ?? {}) as object,
        reason: "pre-import",
        createdBy: opts.actor ?? "admin",
      },
    });
    snapshotIds.push(snap.id);
  }

  const result: ApplyResult = {
    applied: false,
    perCatalog: [],
    requirementNodes: { added: 0, modified: 0, removed: 0 },
    gradRules: { added: 0, modified: 0, removed: 0 },
    snapshotIds,
  };

  const parsedCoursesBySlug = parsed.courses;
  const affectedSlugs = new Set(diff.catalogs.map((c) => c.slug));
  const excluded = new Set(opts.excludeKeys ?? []);

  await prisma.$transaction(
    async (tx) => {
      // ---- catalogs + courses ----
      for (const cd of diff.catalogs) {
        const meta = parsed.catalogs.find((m) => m.slug === cd.slug);
        let catId = idBySlug.get(cd.slug);

        if (cd.isNew && meta) {
          const created = await tx.catalog.create({
            data: {
              slug: meta.slug,
              programCode: /IELC/i.test(meta.slug)
                ? "IELC"
                : /DOBLE/i.test(meta.slug)
                  ? "DOBLE"
                  : "IELE",
              programName: meta.programName,
              variantLabel: meta.variantLabel,
              term: meta.term || "",
              status: meta.status || "draft",
              accentColor: meta.accentColor,
              tagline: meta.tagline,
            },
          });
          catId = created.id;
          idBySlug.set(cd.slug, catId);
        } else if (cd.metaChanges.length && catId) {
          const data: Record<string, unknown> = {};
          for (const c of cd.metaChanges) data[c.field] = c.after;
          await tx.catalog.update({ where: { id: catId }, data });
        }
        if (!catId) continue;

        const rows = await tx.catalogCourse.findMany({
          where: { catalogId: catId },
          orderBy: { sortIndex: "asc" },
          include: { course: { select: { id: true, normalizedCode: true } } },
        });
        // re-key the DB rows the same way diffPlanes does
        const dOcc = new Map<string, number>();
        const rowByKey = new Map<string, (typeof rows)[number]>();
        for (const dc of rows) {
          const base = dc.isPlaceholder
            ? `${dc.placeholderKind ?? "SLOT"}#${dc.suggestedSemester}`
            : (dc.course?.normalizedCode ?? normalizeCode(dc.displayCode));
          let key = base;
          if (dc.isPlaceholder) {
            const n = (dOcc.get(base) ?? 0) + 1;
            dOcc.set(base, n);
            key = `${base}#${n}`;
          }
          rowByKey.set(key, dc);
        }

        let maxSort = rows.reduce((m, r) => Math.max(m, r.sortIndex), 0);
        const parsedList = parsedCoursesBySlug[cd.slug] ?? [];
        // parsed courses in sheet order, re-keyed like diffPlanes
        const pOcc = new Map<string, number>();
        const parsedByKey = new Map<string, ParsedPlanCourse>();
        for (const pc of parsedList) {
          const base = pc.isPlaceholder
            ? `${pc.placeholderKind ?? "SLOT"}#${pc.semester ?? "?"}`
            : pc.normalizedCode;
          let key = base;
          if (pc.isPlaceholder) {
            const n = (pOcc.get(base) ?? 0) + 1;
            pOcc.set(base, n);
            key = `${base}#${n}`;
          }
          parsedByKey.set(key, pc);
        }

        let added = 0,
          modified = 0,
          removed = 0,
          kept = 0;

        for (const cdiff of cd.courses) {
          if (excluded.has(`${cd.slug}::${cdiff.key}`)) {
            kept++;
            continue;
          }
          if (cdiff.kind === "added") {
            const pc = parsedByKey.get(cdiff.key);
            if (!pc) continue;
            let courseId: number | null = null;
            if (!pc.isPlaceholder && pc.normalizedCode) {
              const g = await tx.course.upsert({
                where: { normalizedCode: pc.normalizedCode },
                create: { normalizedCode: pc.normalizedCode, nameEs: pc.name },
                update: {},
              });
              courseId = g.id;
            }
            await tx.catalogCourse.create({
              data: courseCreateData(catId, pc, ++maxSort, courseId),
            });
            added++;
          } else if (cdiff.kind === "modified") {
            const dc = rowByKey.get(cdiff.key);
            if (!dc) continue;
            const data: Record<string, unknown> = {};
            for (const ch of cdiff.changes) {
              const isConflict = cdiff.conflictFields.includes(ch.field);
              if (isConflict && !opts.forceConflicts) continue;
              if (ch.field === "prereqText") {
                data.prereqText = ch.after || null;
                data.prereqTree = (parseRequirement(String(ch.after ?? "")) ??
                  Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
              } else {
                data[ch.field] = ch.after;
              }
            }
            if (Object.keys(data).length) {
              await tx.catalogCourse.update({ where: { id: dc.id }, data });
              modified++;
            } else {
              kept++;
            }
          } else if (cdiff.kind === "removed") {
            const dc = rowByKey.get(cdiff.key);
            if (!dc) continue;
            const protectedRow =
              dc.manuallyEdited && !opts.forceConflicts;
            if (opts.confirmRemovals && !protectedRow) {
              await tx.catalogCourse.delete({ where: { id: dc.id } });
              removed++;
            } else {
              kept++;
            }
          }
        }

        result.perCatalog.push({ slug: cd.slug, added, modified, removed, kept });
      }

      // ---- requirement nodes (template is global: apply to every affected catalog) ----
      const catIds = [...affectedSlugs]
        .map((s) => idBySlug.get(s))
        .filter((x): x is number => x != null);
      for (const rn of diff.requirementNodes) {
        const pn = parsed.requirementNodes.find((n) => n.key === rn.id);
        if (rn.kind === "removed") {
          await tx.requirementNode.deleteMany({ where: { key: rn.id } });
          result.requirementNodes.removed++;
          continue;
        }
        if (!pn) continue;
        for (const catId of catIds) {
          await tx.requirementNode.upsert({
            where: { catalogId_key: { catalogId: catId, key: pn.key } },
            create: {
              catalogId: catId,
              key: pn.key,
              label: pn.label,
              description: pn.description,
              infoUrl: pn.infoUrl,
              credits: 0,
              semester: pn.semester ?? 5,
              sortIndex: 9999,
              attestationId: pn.attestationId,
              linkedCourseCodes: pn.linkedCourseCodes as unknown as Prisma.InputJsonValue,
              autoLinkRegex: pn.autoLinkRegex,
            },
            update: {
              label: pn.label,
              description: pn.description,
              infoUrl: pn.infoUrl,
              semester: pn.semester ?? undefined,
              attestationId: pn.attestationId,
              linkedCourseCodes: pn.linkedCourseCodes as unknown as Prisma.InputJsonValue,
              autoLinkRegex: pn.autoLinkRegex,
            },
          });
        }
        if (rn.kind === "added") result.requirementNodes.added++;
        else result.requirementNodes.modified++;
      }

      // ---- graduation rules: rebuild Catalog.rules for every affected catalog ----
      if (diff.gradRules.length) {
        const attestations = parsed.gradRequirements
          .filter((r) => r.type === "atestación" || r.type === "atestacion")
          .map((r) => ({
            id: r.id,
            label: r.label,
            ...(r.description ? { description: r.description } : {}),
          }));
        const gates = parsed.gradRequirements
          .filter((r) => r.type === "gate")
          .map((r) => {
            try {
              const parsedRule = JSON.parse(r.rule.replace(/^[^{[]*/, ""));
              return { id: r.id, label: r.label, ...parsedRule };
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        for (const catId of catIds) {
          // the credit thresholds are edited in the admin, not in PLANES.xlsx: keep them
          const prev = (await tx.catalog.findUnique({ where: { id: catId }, select: { rules: true } }))?.rules as
            | CatalogRules
            | null;
          const fromSheet = new Set(gates.map((g) => (g as GateRule).id));
          const keptUnlocks = (prev?.gates ?? []).filter((g) => isCreditUnlock(g) && !fromSheet.has(g.id));
          const rules = {
            attestations,
            gates: [...gates, ...keptUnlocks],
            ...(prev?.creditUnlocksSeeded ? { creditUnlocksSeeded: true } : {}),
            ...(prev?.secondLanguageSeeded ? { secondLanguageSeeded: true } : {}),
          } as unknown as Prisma.InputJsonValue;
          await tx.catalog.update({ where: { id: catId }, data: { rules } });
        }
        for (const g of diff.gradRules) {
          if (g.kind === "added") result.gradRules.added++;
          else if (g.kind === "removed") result.gradRules.removed++;
          else result.gradRules.modified++;
        }
      }

      await tx.importJob.update({
        where: { id: jobId },
        data: { status: "applied", appliedAt: new Date() },
      });
    },
    { timeout: 30_000 }
  );

  result.applied = true;
  await writeAudit({
    actor: opts.actor,
    action: "import.apply",
    entityType: "ImportJob",
    entityId: jobId,
    after: result,
  });
  return result;
}

export async function discardImportJob(jobId: number, actor?: string) {
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "discarded" },
  });
  await writeAudit({
    actor,
    action: "import.discard",
    entityType: "ImportJob",
    entityId: jobId,
  });
}
