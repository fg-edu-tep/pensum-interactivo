import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReqNode } from "../../types";
import { parseRequirement } from "../../import/requirementParser";
import { parseCoreq } from "../../registro/requirements";
import { parseRegistroWorkbook } from "../../registro/parse";
import {
  addAlternative, addRequirement, canonical, groupAsAlternatives, isSimple, modelCodes,
  modelToText, modelToTree, normalizeTree, removeAlt, removeCode, setSoft, treeToModel,
  ungroup, ModelError, type ReqModel,
} from "../model";

const p = (s: string) => {
  const t = parseRequirement(s);
  assert.ok(t, `test input did not parse: ${s}`);
  return t;
};
const rt = (s: string) => modelToText(treeToModel(p(s)));
const throwsModel = (f: () => unknown) => assert.throws(f, ModelError);

test("empty / none", () => {
  assert.deepEqual(treeToModel(null).groups, []);
  assert.equal(modelToTree({ groups: [] }), null);
  assert.equal(modelToText({ groups: [] }), "");
});

test("shapes: single, AND, OR, AND-of-OR", () => {
  assert.equal(treeToModel(p("MATE 1203")).groups.length, 1);
  assert.equal(treeToModel(p("AAAA 1001 Y BBBB 1002")).groups.length, 2);
  const or = treeToModel(p("AAAA 1001 O BBBB 1002"));
  assert.equal(or.groups.length, 1);
  assert.equal(or.groups[0].alts.length, 2);
  const mix = treeToModel(p("AAAA 1001 Y (BBBB 1002 O CCCC 1003) Y DDDD 1004"));
  assert.deepEqual(mix.groups.map((g) => g.alts.length), [1, 2, 1]);
  assert.ok(isSimple(mix));
});

test("deep expression is kept as a complex alternative, losslessly", () => {
  const t = p("(AAAA 1001 Y BBBB 1002) O CCCC 1003");
  const m = treeToModel(t);
  assert.equal(isSimple(m), false);
  assert.equal(canonical(modelToTree(m)), canonical(t));
  assert.deepEqual(modelCodes(m).sort(), ["AAAA1001", "BBBB1002", "CCCC1003"]);
});

test("round trip text", () => {
  for (const s of ["AAAA 1001", "AAAA 1001 Y BBBB 1002", "AAAA 1001 O BBBB 1002", "AAAA 1001 Y (BBBB 1002 O CCCC 1003)", "AAAA 1001* Y BBBB 1002"]) {
    assert.equal(canonical(p(rt(s))), canonical(p(s)), s);
  }
});

test("addRequirement / addAlternative / duplicates / cleanCode", () => {
  let m: ReqModel = { groups: [] };
  m = addRequirement(m, "iele 2100");
  m = addRequirement(m, "mate-1203");
  assert.equal(modelToText(m), "IELE 2100 Y MATE 1203");
  m = addAlternative(m, 1, "MATE 1204");
  assert.equal(modelToText(m), "IELE 2100 Y (MATE 1203 O MATE 1204)");
  throwsModel(() => addRequirement(m, "IELE2100"));
  throwsModel(() => addAlternative(m, 0, "mate1204"));
  throwsModel(() => addAlternative(m, 9, "X100"));
  throwsModel(() => addRequirement(m, "  "));
});

test("group / ungroup are inverse for simple models", () => {
  const m0 = treeToModel(p("AAAA 1001 Y BBBB 1002 Y CCCC 1003"));
  const g = groupAsAlternatives(m0, [2, 0]);
  assert.equal(g.groups.length, 2);
  assert.equal(modelToText(g), "(AAAA 1001 O CCCC 1003) Y BBBB 1002");
  const u = ungroup(g, 0);
  assert.equal(canonical(modelToTree(u)), canonical(modelToTree(m0)));
  throwsModel(() => groupAsAlternatives(m0, [1]));
  throwsModel(() => groupAsAlternatives(m0, [1, 1]));
  throwsModel(() => ungroup(m0, 0));
});

test("removeAlt drops emptied groups; removeCode handles complex trees", () => {
  const m = treeToModel(p("AAAA 1001 Y (BBBB 1002 O CCCC 1003)"));
  assert.equal(modelToText(removeAlt(m, 0, 0)), "BBBB 1002 O CCCC 1003");
  assert.equal(modelToText(removeAlt(removeAlt(m, 1, 1), 1, 0)), "AAAA 1001");
  assert.equal(modelToText(removeCode(m, "BBBB1002")), "AAAA 1001 Y CCCC 1003");
  assert.equal(modelToText(removeCode(treeToModel(p("AAAA 1001")), "AAAA1001")), "");
  throwsModel(() => removeAlt(m, 0, 5));
});

test("setSoft only on leaves; operations never mutate their input", () => {
  const m = treeToModel(p("AAAA 1001 Y BBBB 1002"));
  const frozen = JSON.stringify(m);
  const s = setSoft(m, 0, 0, true);
  assert.equal(modelToText(s), "AAAA 1001* Y BBBB 1002");
  addRequirement(m, "ZZZZ 1009"); groupAsAlternatives(m, [0, 1]); removeAlt(m, 0, 0);
  assert.equal(JSON.stringify(m), frozen);
  throwsModel(() => setSoft(treeToModel(p("(AAAA 1001 Y BBBB 1002) O CCCC 1003")), 0, 0, true));
});

test("normalizeTree flattens, collapses and drops empties", () => {
  const messy: ReqNode = {
    op: "AND",
    items: [
      { op: "AND", items: [{ op: "COURSE", code: "AAAA1001" }] },
      { op: "OR", items: [{ op: "COURSE", code: "BBBB1002" }] },
      { op: "OR", items: [] },
    ],
  };
  assert.deepEqual(normalizeTree(messy), {
    op: "AND",
    items: [{ op: "COURSE", code: "AAAA1001", soft: false }, { op: "COURSE", code: "BBBB1002", soft: false }],
  });
  assert.equal(normalizeTree({ op: "AND", items: [] }), null);
});

test("canonical ignores order and duplicates, not soft", () => {
  assert.equal(canonical(p("AAAA 1001 Y BBBB 1002")), canonical(p("BBBB 1002 Y AAAA 1001")));
  assert.notEqual(canonical(p("AAAA 1001 Y BBBB 1002")), canonical(p("AAAA 1001* Y BBBB 1002")));
  assert.notEqual(canonical(p("AAAA 1001 Y BBBB 1002")), canonical(p("AAAA 1001 O BBBB 1002")));
});

// ---- corpus: every real expression in Excel_Registro.xlsx must round-trip -------
const FILE = resolve(process.cwd(), "..", "Excel_Registro.xlsx");
const skip = !existsSync(FILE) && "Excel_Registro.xlsx not found at repo root";

test("corpus: every real prereq/coreq in Excel_Registro round-trips", { skip, timeout: 120_000 }, () => {
  const { rows } = parseRegistroWorkbook(readFileSync(FILE));
  const seen = new Set<string>();
  let n = 0, complex = 0;
  const unparsed: string[] = [];
  for (const r of rows) {
    for (const [text, parse] of [[r.prereqText, parseRequirement], [r.coreqText, parseCoreq]] as const) {
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const tree = parse(text);
      if (!tree) { unparsed.push(text); continue; }
      const model = treeToModel(tree);
      assert.equal(canonical(modelToTree(model)), canonical(tree), text);
      // rendered text re-parses to the same meaning
      assert.equal(canonical(parseRequirement(modelToText(model))), canonical(tree), `text of: ${text}`);
      // idempotent
      assert.deepEqual(treeToModel(modelToTree(model)), model, `idempotent: ${text}`);
      n++;
      if (!isSimple(model)) complex++;
    }
  }
  assert.ok(n > 100, `corpus too small: ${n}`);
  console.log(`corpus: ${n} distinct expressions, ${complex} complex, ${unparsed.length} unparseable (parser -> null): ${unparsed.slice(0, 8).join(" | ")}`);
});
