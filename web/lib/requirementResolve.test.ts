import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "./import/requirementParser";
import { resolveRequirement, type ApiDetails, type RequirementCandidates } from "./requirementResolve";

const t = (s: string) => parseRequirement(s);
const api = (p: Partial<ApiDetails> = {}): ApiDetails => ({
  term: "202620",
  detailsSyncedAt: "2026-10-02T10:00:00.000Z",
  detailsError: null,
  apiPrereqText: null,
  apiPrereqTree: null,
  apiCoreqTree: null,
  ...p,
});
const emptyDoc = { prereqText: null, prereqTree: null, coreqText: null, coreqTree: null };
const cands = (p: Partial<RequirementCandidates> = {}): RequirementCandidates => ({
  current: null,
  document: emptyDoc,
  registro: null,
  history: [],
  ...p,
});

test("1. the live API for the plan's term wins over everything", () => {
  const r = resolveRequirement(
    "prereq",
    cands({
      current: api({ apiPrereqText: "IELE 1001", apiPrereqTree: t("IELE 1001") }),
      document: { ...emptyDoc, prereqText: "IELE 9999", prereqTree: t("IELE 9999") },
      registro: { period: "202620", prereqText: "IELE 8888", coreqText: null },
    })
  );
  assert.deepEqual([r.source, r.text, r.sourceTerm], ["api", "IELE 1001", "202620"]);
});

test("1. API details fetched with no prereq text = confirmed none", () => {
  const r = resolveRequirement("prereq", cands({ current: api(), document: { ...emptyDoc, prereqText: "IELE 9999", prereqTree: t("IELE 9999") } }));
  assert.deepEqual([r.source, r.tree, r.text], ["api", null, ""]);
});

test("2. no usable API data => the document", () => {
  for (const current of [null, api({ detailsSyncedAt: null }), api({ detailsError: "boom" }), api({ apiPrereqText: "texto raro" })]) {
    const r = resolveRequirement("prereq", cands({ current, document: { ...emptyDoc, prereqText: "IELE 9999", prereqTree: t("IELE 9999") } }));
    assert.equal(r.source, "document");
    assert.equal(r.text, "IELE 9999");
  }
});

test("3. empty document is skipped (not 'no requirement'): the Registro entry fills in — IELE 3206", () => {
  const r = resolveRequirement(
    "prereq",
    cands({
      current: api({ detailsSyncedAt: null }), // not offered in 202620
      registro: { period: "202610", prereqText: " IELE 2206 Y (LENG 2999 O LENG 1156 O ENGL7  O INLE4  O RLEC1  O RLEN1 )", coreqText: "IELE-3206L" },
    })
  );
  assert.equal(r.source, "registro");
  assert.equal(r.sourceTerm, "202610");
  assert.ok(r.tree);
  const co = resolveRequirement("coreq", cands({ registro: { period: "202610", prereqText: null, coreqText: "IELE-3206L" } }));
  assert.equal(co.source, "registro");
  assert.equal(JSON.stringify(co.tree), JSON.stringify(t("IELE 3206L")));
});

test("4. last resort: the API data of another term, newest first", () => {
  const r = resolveRequirement(
    "prereq",
    cands({
      history: [
        api({ term: "202510", apiPrereqText: "IELE 1000", apiPrereqTree: t("IELE 1000") }),
        api({ term: "202610", apiPrereqText: "IELE 2206", apiPrereqTree: t("IELE 2206") }),
        api({ term: "202520", detailsError: "boom", apiPrereqTree: t("IELE 7777") }),
      ],
    })
  );
  assert.deepEqual([r.source, r.sourceTerm, r.text], ["api-history", "202610", "IELE 2206"]);
});

test("nothing anywhere => no requirement, source null", () => {
  assert.deepEqual(resolveRequirement("coreq", cands()), { tree: null, text: "", source: null, sourceTerm: null });
});
