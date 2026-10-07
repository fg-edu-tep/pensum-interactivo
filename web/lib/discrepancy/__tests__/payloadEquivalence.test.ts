// LOCK between the admin discrepancy logic and the student payload.
//
// lib/discrepancy mirrors the precedence in lib/catalogPayload.ts on purpose
// (the payload builder is intentionally untouched). This test runs BOTH against
// the same database and fails if they ever disagree on which tree students see,
// or on where it came from. READ-ONLY.
//
// Needs a database: skipped when DATABASE_URL is not set / unreachable. Run with
//   node --env-file=.env --import tsx --test lib/discrepancy/__tests__/payloadEquivalence.test.ts
import test, { before } from "node:test";
import assert from "node:assert/strict";

let ready = false;
let skipReason: string | false = "DATABASE_URL not set";

type Deps = {
  prisma: typeof import("../../db").prisma;
  buildCatalogPayload: typeof import("../../catalogPayload").buildCatalogPayload;
  loadCourseInputs: typeof import("../service").loadCourseInputs;
  effectiveTree: typeof import("../report").effectiveTree;
  reportCourse: typeof import("../report").reportCourse;
};
let d: Deps;

before(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("../../db");
    await prisma.$queryRaw`SELECT 1`;
    const { buildCatalogPayload } = await import("../../catalogPayload");
    const { loadCourseInputs } = await import("../service");
    const { effectiveTree, reportCourse } = await import("../report");
    d = { prisma, buildCatalogPayload, loadCourseInputs, effectiveTree, reportCourse };
    ready = true;
    skipReason = false;
  } catch (e) {
    skipReason = "database unreachable: " + (e as Error).message.split("\n")[0];
  }
});

const canon = (v: unknown) => JSON.stringify(v ?? null);

test("every course: discrepancy governance == what buildCatalogPayload gives students", async (t) => {
  if (skipReason) return t.skip(String(skipReason));
  assert.ok(ready);
  const slugs = (await d.prisma.catalog.findMany({ select: { slug: true } })).map((c) => c.slug);
  assert.ok(slugs.length > 0);
  const loaded = await d.loadCourseInputs();
  let checked = 0;
  const mismatches: string[] = [];

  for (const slug of slugs) {
    const payload = await d.buildCatalogPayload(slug);
    assert.ok(payload);
    const byCode = new Map(payload.courses.filter((c) => !c.isPlaceholder).map((c) => [c.codeNormalized, c]));
    for (const input of loaded.get(slug)!.inputs) {
      const student = byCode.get(input.code);
      if (!student) {
        mismatches.push(`${slug}/${input.code}: in the discrepancy input but not in the student payload`);
        continue;
      }
      checked++;
      const pre = d.effectiveTree("prereq", input.offering, input.docPrereqTree);
      const co = d.effectiveTree("coreq", input.offering, input.docCoreqTree);
      if (canon(pre.tree) !== canon(student.prereqTree)) mismatches.push(`${slug}/${input.code}: prereq tree differs`);
      if (canon(co.tree) !== canon(student.coreqTree)) mismatches.push(`${slug}/${input.code}: coreq tree differs`);
      if (pre.governor !== (student.prereqSource === "api" ? "api" : "document") && !(student.prereqSource === null && pre.governor === "document"))
        mismatches.push(`${slug}/${input.code}: prereq governor ${pre.governor} vs payload source ${student.prereqSource}`);
      if (co.governor !== (student.coreqSource === "api" ? "api" : "document") && !(student.coreqSource === null && co.governor === "document"))
        mismatches.push(`${slug}/${input.code}: coreq governor ${co.governor} vs payload source ${student.coreqSource}`);
      // the text shown to students for prereqs must match too
      const rep = d.reportCourse(input);
      if ((rep.prereq.visibleText ?? "") !== (student.prereqText ?? ""))
        mismatches.push(`${slug}/${input.code}: prereq text "${rep.prereq.visibleText}" vs "${student.prereqText}"`);
    }
  }
  assert.ok(checked > 100, `expected to compare >100 courses, compared ${checked}`);
  assert.deepEqual(mismatches, []);
});
