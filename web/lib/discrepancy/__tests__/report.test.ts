import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "../../import/requirementParser";
import {
  effectiveTree,
  headlineFor,
  reportCourse,
  reportField,
  summarize,
  type CourseInput,
  type OfferingInput,
} from "../report";

const t = (s: string) => parseRequirement(s);
const off = (p: Partial<OfferingInput> = {}): OfferingInput => ({
  offered: true, syncError: null, detailsSyncedAt: "2026-10-02T10:00:00.000Z", detailsError: null,
  apiPrereqText: null, apiPrereqTree: null, apiCoreqTree: null, ...p,
});
const course = (p: Partial<CourseInput> = {}): CourseInput => ({
  catalogCourseId: 1, displayCode: "IELE 2100", code: "IELE2100", name: "X",
  docPrereqText: null, docPrereqTree: null, docCoreqText: null, docCoreqTree: null,
  manuallyEdited: false, lockedFields: [], offering: off(), ...p,
});

// ---------------------------------------------------------------- governance
test("governance: an API tree wins over the document", () => {
  const r = effectiveTree("prereq", off({ apiPrereqText: "IELE 1001", apiPrereqTree: t("IELE 1001") }), t("IELE 9999"));
  assert.equal(r.governor, "api");
  assert.equal(JSON.stringify(r.tree), JSON.stringify(t("IELE 1001")));
});

test("governance: synced OK + API has no prereq => NONE, even if the document has one", () => {
  const r = effectiveTree("prereq", off(), t("IELE 9999"));
  assert.deepEqual([r.governor, r.tree], ["api", null]);
});

test("governance: no usable API data => the document governs", () => {
  for (const o of [null, off({ detailsSyncedAt: null }), off({ detailsError: "boom" }), off({ offered: false, detailsSyncedAt: null })]) {
    const r = effectiveTree("prereq", o, t("IELE 9999"));
    assert.equal(r.governor, "document");
    assert.equal(JSON.stringify(r.tree), JSON.stringify(t("IELE 9999")));
  }
});

test("governance: API prereq TEXT present but unparsed => falls back to the document (mirrors the student view)", () => {
  const r = effectiveTree("prereq", off({ apiPrereqText: "texto raro", apiPrereqTree: null }), t("IELE 9999"));
  assert.equal(r.governor, "document");
});

test("governance: coreq — synced OK with no API coreq => NONE (document ignored)", () => {
  assert.deepEqual([effectiveTree("coreq", off(), t("IELE-2100L".replace("-", " "))).governor, effectiveTree("coreq", off(), t("IELE 2100L")).tree], ["api", null]);
});

// ------------------------------------------------------------------ statuses
test("status: equal => match (ok)", () => {
  const f = reportField(course({ docPrereqTree: t("IELE 1001 Y IELE 1002"), offering: off({ apiPrereqText: "IELE 1002 Y IELE 1001", apiPrereqTree: t("IELE 1002 Y IELE 1001") }) }), "prereq");
  assert.deepEqual([f.status, f.severity, f.governor], ["match", "ok", "api"]);
});

test("status: both empty on a synced course => match", () => {
  assert.equal(reportField(course(), "prereq").status, "match");
});

test("status: the real FISI1028 drop => differs (warn), names the alternative students still see", () => {
  const api = "(FISI 1028 O FISI 1528*) Y IELE 1002";
  const f = reportField(
    course({
      docPrereqTree: t("FISI 1528* Y IELE 1002"), docPrereqText: "FISI 1528* Y IELE 1002",
      lockedFields: ["prereqText"],
      offering: off({ apiPrereqText: api, apiPrereqTree: t(api) }),
    }),
    "prereq"
  );
  assert.deepEqual([f.status, f.severity, f.cause], ["differs", "warn", "pinned"]);
  assert.deepEqual(f.onlyInApi, ["FISI1028"]);
  assert.equal(f.visibleText, api); // students see the API text
  assert.equal(f.documentText, "FISI 1528* Y IELE 1002");
});

test("status: soft-only => info, not a warning", () => {
  const f = reportField(course({ docPrereqTree: t("IELE 1001"), offering: off({ apiPrereqText: "IELE 1001*", apiPrereqTree: t("IELE 1001*") }) }), "prereq");
  assert.deepEqual([f.status, f.severity], ["soft-only", "info"]);
});

test("status: document has a requirement, API says none => doc-hidden (warn): students see nothing", () => {
  const f = reportField(course({ docPrereqText: "IELE 1001", docPrereqTree: t("IELE 1001") }), "prereq");
  assert.deepEqual([f.status, f.severity, f.visible], ["doc-hidden", "warn", null]);
  assert.deepEqual(f.onlyInDocument, ["IELE1001"]);
});

test("status: API has one, document empty => api-only (info)", () => {
  const f = reportField(course({ offering: off({ apiPrereqText: "IELE 1001", apiPrereqTree: t("IELE 1001") }) }), "prereq");
  assert.deepEqual([f.status, f.severity], ["api-only", "info"]);
  assert.deepEqual(f.onlyInApi, ["IELE1001"]);
});

test("status: no API data => unverified with a reason for each cause", () => {
  const reasons = (o: OfferingInput | null) => reportField(course({ docPrereqTree: t("IELE 1001"), offering: o }), "prereq").unverifiedReason;
  assert.equal(reasons(null), "no-offering");
  assert.equal(reasons(off({ offered: false, detailsSyncedAt: null })), "not-offered");
  assert.equal(reasons(off({ syncError: "x", detailsSyncedAt: null })), "sync-failed");
  assert.equal(reasons(off({ detailsSyncedAt: null })), "no-details");
  assert.equal(reasons(off({ detailsError: "x" })), "details-failed");
  assert.equal(reasons(off({ apiPrereqText: "raro", apiPrereqTree: null })), "api-unparsed");
});

test("status: unverified is never a warning (there is nothing to disagree with)", () => {
  assert.equal(reportField(course({ docPrereqTree: t("IELE 1001"), offering: null }), "prereq").severity, "info");
});

test("cause: pinned > edited > imported", () => {
  const f = (p: Partial<CourseInput>) => reportField(course({ docPrereqTree: t("IELE 1001"), offering: null, ...p }), "prereq").cause;
  assert.equal(f({ lockedFields: ["prereqText"], manuallyEdited: true }), "pinned");
  assert.equal(f({ manuallyEdited: true }), "edited");
  assert.equal(f({}), "imported");
  // a coreqText lock must not count for the prereq field
  assert.equal(f({ lockedFields: ["coreqText"] }), "imported");
});

test("coreq: compared via the API coreq tree, rendered from it", () => {
  const f = reportField(
    course({ docCoreqText: "IELE-2100L", docCoreqTree: t("IELE 2100L"), offering: off({ apiCoreqTree: t("IELE 2100L") }) }),
    "coreq"
  );
  assert.equal(f.status, "match");
  assert.equal(f.apiText, "IELE 2100L");
});

test("coreq: API synced with no coreq but the document lists one => doc-hidden", () => {
  const f = reportField(course({ docCoreqText: "IELE-2100L", docCoreqTree: t("IELE 2100L") }), "coreq");
  assert.equal(f.status, "doc-hidden");
});

// ------------------------------------------------------------------- wording
test("headline: coreq differences warn that the basket still shows the document's coreq text", () => {
  const h = headlineFor({ field: "coreq", status: "differs", documentText: "IELE-2100L" });
  assert.match(h, /canasta/);
  assert.doesNotMatch(headlineFor({ field: "coreq", status: "differs", documentText: "" }), /canasta/);
  assert.doesNotMatch(headlineFor({ field: "prereq", status: "differs", documentText: "IELE 1001" }), /canasta/);
});

test("headline: every status has a sentence; unverified names its reason", () => {
  for (const status of ["match", "soft-only", "differs", "doc-hidden", "api-only", "unverified"] as const) {
    assert.ok(headlineFor({ field: "prereq", status, documentText: "x", unverifiedReason: "not-offered" }).length > 10, status);
  }
  assert.match(headlineFor({ field: "prereq", status: "unverified", documentText: "", unverifiedReason: "not-offered" }), /no se dicta/);
});

// ----------------------------------------------- student-visible text (mirror)
test("visibleText mirrors the payload: prereq text = API text only when the API has a TREE, else the document's", () => {
  // API none + document has text => payload still shows the document's text
  const hidden = reportField(course({ docPrereqText: "IELE 1001", docPrereqTree: t("IELE 1001") }), "prereq");
  assert.equal(hidden.visibleText, "IELE 1001");
  assert.equal(hidden.visible, null); // ...while the tree students get is empty
  // API has a tree => its text
  const api = reportField(course({ docPrereqText: "doc", offering: off({ apiPrereqText: "IELE 2000", apiPrereqTree: t("IELE 2000") }) }), "prereq");
  assert.equal(api.visibleText, "IELE 2000");
});

test("visibleText mirrors the payload: coreq text is ALWAYS the document's", () => {
  const f = reportField(course({ docCoreqText: "IELE-2100L", docCoreqTree: t("IELE 2100L"), offering: off({ apiCoreqTree: t("IELE 2100L") }) }), "coreq");
  assert.equal(f.visibleText, "IELE-2100L");
});

// ------------------------------------------------------------------- summary
test("summarize: counts fields by status, severity and governor", () => {
  const reports = [
    reportCourse(course({ catalogCourseId: 1, docPrereqTree: t("IELE 1001"), docPrereqText: "IELE 1001" })), // prereq doc-hidden, coreq match
    reportCourse(course({ catalogCourseId: 2, offering: null, docPrereqTree: t("IELE 1001") })), // both unverified
    reportCourse(course({ catalogCourseId: 3 })), // both match
  ];
  const s = summarize(reports);
  assert.equal(s.courses, 3);
  assert.equal(s.warn, 1);
  assert.deepEqual([s.byStatus["doc-hidden"], s.byStatus.unverified, s.byStatus.match], [1, 2, 3]);
  assert.equal(s.apiGoverned + s.documentGoverned, 6);
  assert.equal(s.documentGoverned, 2);
});
