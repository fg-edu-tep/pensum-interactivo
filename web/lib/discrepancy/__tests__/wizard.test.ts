import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "../../import/requirementParser";
import type { CourseLinkPlan } from "../../registro/analyze";
import type { UnresolvedItem } from "../../registro/types";
import { annotateCourse, apiMentions } from "../wizard";
import type { CourseInput, OfferingInput } from "../report";

const t = (s: string) => parseRequirement(s);
const off = (p: Partial<OfferingInput> = {}): OfferingInput => ({
  offered: true, syncError: null, detailsSyncedAt: "2026-10-02T00:00:00.000Z", detailsError: null,
  apiPrereqText: null, apiPrereqTree: null, apiCoreqTree: null, ...p,
});
const input = (p: Partial<CourseInput> = {}): CourseInput => ({
  catalogCourseId: 1, displayCode: "IELE 2100", code: "IELE2100", name: "X",
  docPrereqText: null, docPrereqTree: null, docCoreqText: null, docCoreqTree: null,
  manuallyEdited: false, lockedFields: [], offering: off(), ...p,
});
const plan = (changes: CourseLinkPlan["changes"]): CourseLinkPlan => ({
  slug: "c", catalogCourseId: 1, displayCode: "IELE 2100", code: "IELE2100", targetCode: "IELE2100",
  changes, skipped: null, noRegistro: false,
});

test("annotate: API governs + new value equals the API => visible-and-agrees", () => {
  const api = "(FISI 1028 O FISI 1528*) Y IELE 1002";
  const r = annotateCourse(
    plan([{ field: "prereqText", before: "x", after: "IELE 1002 Y (FISI 1528* O FISI 1028)" }]),
    input({ offering: off({ apiPrereqText: api, apiPrereqTree: t(api) }) })
  );
  assert.deepEqual(r.map((x) => [x.governor, x.newMatchesApi]), [["api", true]]);
});

test("annotate: API governs + new value differs (the FISI 1028 drop) => would differ from what students see", () => {
  const api = "(FISI 1028 O FISI 1528*) Y IELE 1002";
  const r = annotateCourse(
    plan([{ field: "prereqText", before: api, after: "FISI 1528* Y IELE 1002", override: true }]),
    input({ offering: off({ apiPrereqText: api, apiPrereqTree: t(api) }) })
  );
  assert.deepEqual([r[0].governor, r[0].newMatchesApi, r[0].apiText], ["api", false, api]);
});

test("annotate: document governs => students WILL see the new value (nothing to compare)", () => {
  const r = annotateCourse(plan([{ field: "prereqText", before: null, after: "IELE 1001" }]), input({ offering: null }));
  assert.deepEqual([r[0].governor, r[0].newMatchesApi], ["document", null]);
});

test("annotate: API synced with no prereq, new value non-empty => governs and differs", () => {
  const r = annotateCourse(plan([{ field: "prereqText", before: null, after: "IELE 1001" }]), input());
  assert.deepEqual([r[0].governor, r[0].newMatchesApi], ["api", false]);
});

test("annotate: non-requirement fields (name, credits, binding) are ignored", () => {
  const r = annotateCourse(
    plan([{ field: "name", before: "a", after: "b" }, { field: "credits", before: 3, after: 4 }, { field: "binding", before: "A", after: "B" }]),
    input()
  );
  assert.deepEqual(r, []);
});

test("annotate: coreq uses the API coreq tree and the hyphen convention", () => {
  const r = annotateCourse(
    plan([{ field: "coreqText", before: null, after: "IELE-2100L" }]),
    input({ offering: off({ apiCoreqTree: t("IELE 2100L") }) })
  );
  assert.deepEqual([r[0].governor, r[0].newMatchesApi], ["api", true]);
});

test("annotate: missing input => no annotations (never throws)", () => {
  assert.deepEqual(annotateCourse(plan([{ field: "prereqText", before: null, after: "X" }]), undefined), []);
});

test("apiMentions: finds courses whose OFFICIAL expression still lists a ref-missing code", () => {
  const items = [
    { key: "ref-missing:FISI1028", kind: "ref-missing", severity: "action", code: "FISI1028", catalogs: [], detail: {}, allowed: ["keep"] },
    { key: "ref-missing:LENG9999", kind: "ref-missing", severity: "action", code: "LENG9999", catalogs: [], detail: {}, allowed: ["keep"] },
    { key: "bound-missing:IELE2150", kind: "bound-missing", severity: "action", code: "IELE2150", catalogs: [], detail: {}, allowed: ["keep"] },
  ] as UnresolvedItem[];
  const api = "(FISI 1028 O FISI 1528*) Y IELE 1002";
  const m = apiMentions(items, [
    input({ displayCode: "IELE 2100", offering: off({ apiPrereqText: api, apiPrereqTree: t(api) }) }),
    input({ displayCode: "IELE 2002", offering: off({ apiPrereqText: api, apiPrereqTree: t(api) }) }),
    input({ displayCode: "IELE 3000", offering: null }),
    input({ displayCode: "IELE 3100", offering: off() }),
  ]);
  assert.deepEqual(m, { "ref-missing:FISI1028": ["IELE 2002", "IELE 2100"] });
});
