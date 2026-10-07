import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "../../import/requirementParser";
import { canonicalKey, compareTrees } from "../compare";

const t = (s: string) => parseRequirement(s);

test("canonical: operand order, nesting and duplicates do not matter", () => {
  const a = canonicalKey(t("IELE 1001 O IELE 1002 O IELE 1003"), { soft: false });
  assert.equal(canonicalKey(t("IELE 1003 O IELE 1001 O IELE 1002"), { soft: false }), a);
  assert.equal(canonicalKey(t("(IELE 1001 O IELE 1002) O IELE 1003"), { soft: false }), a);
  assert.equal(canonicalKey(t("IELE 1001 O (IELE 1002 O IELE 1003)"), { soft: false }), a);
  assert.equal(canonicalKey(t("IELE 1001 O IELE 1001 O IELE 1002 O IELE 1003"), { soft: false }), a);
});

test("canonical: AND and OR are not interchangeable", () => {
  assert.notEqual(
    canonicalKey(t("IELE 1001 Y IELE 1002"), { soft: false }),
    canonicalKey(t("IELE 1001 O IELE 1002"), { soft: false })
  );
});

test("canonical: a single-item group is just the item; empty is null", () => {
  assert.equal(canonicalKey(t("IELE 1001"), { soft: false }), canonicalKey({ op: "AND", items: [t("IELE 1001")!] }, { soft: false }));
  assert.equal(canonicalKey(null, { soft: false }), null);
  assert.equal(canonicalKey({ op: "AND", items: [] }, { soft: false }), null);
});

test("compare: identical / reordered / re-nested => same", () => {
  assert.equal(compareTrees(t("IELE 1001 Y (MATE 1207 O MATE 1208)"), t("(MATE 1208 O MATE 1207) Y IELE 1001")).relation, "same");
});

test("compare: only the * marker differs => soft-only (minor)", () => {
  const r = compareTrees(t("IELE 2100 Y FISI 1528*"), t("IELE 2100 Y FISI 1528"));
  assert.equal(r.relation, "soft-only");
  assert.deepEqual([r.onlyInApi, r.onlyInDocument], [[], []]);
});

test("compare: the real FISI 1028 drop => different, naming the missing alternative", () => {
  const api = t("(IELE 1002 O IELE 1006 O IELE 1010) Y (MATE 2210* O MATE 2211*) Y (FISI 1028 O FISI 1528*) Y (ESCR 1102 O LENG 1512)");
  const doc = t("(IELE 1002 O IELE 1006 O IELE 1010) Y (MATE 2210* O MATE 2211*) Y FISI 1528* Y (ESCR 1102 O LENG 1512)");
  const r = compareTrees(api, doc);
  assert.equal(r.relation, "different");
  assert.deepEqual(r.onlyInApi, ["FISI1028"]);
  assert.deepEqual(r.onlyInDocument, []);
});

test("compare: the real MATE 1105C* suffix => different, naming the extra code", () => {
  const r = compareTrees(t("(MATE 1203 O MATE 1204 O MATE 1212)"), t("(MATE 1203 O MATE 1204 O MATE 1212) Y MATE 1105C*"));
  assert.equal(r.relation, "different");
  assert.deepEqual(r.onlyInDocument, ["MATE1105C"]);
});

test("compare: a swapped code is reported on both sides", () => {
  const r = compareTrees(t("IELE 2206"), t("IELE 2100"));
  assert.equal(r.relation, "different");
  assert.deepEqual([r.onlyInApi, r.onlyInDocument], [["IELE2206"], ["IELE2100"]]);
});

test("compare: null vs null => same; null vs something => different", () => {
  assert.equal(compareTrees(null, null).relation, "same");
  assert.equal(compareTrees(null, t("IELE 1001")).relation, "different");
  assert.equal(compareTrees(t("IELE 1001"), null).relation, "different");
});

test("compare: same codes but OR vs AND structure => different with no code-level difference", () => {
  const r = compareTrees(t("IELE 1001 O IELE 1002"), t("IELE 1001 Y IELE 1002"));
  assert.equal(r.relation, "different");
  assert.deepEqual([r.onlyInApi, r.onlyInDocument], [[], []]);
});
