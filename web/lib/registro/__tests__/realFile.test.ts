// Golden tests against the REAL Excel_Registro.xlsx (facts measured 2026-10-03,
// see docs/admin-registro-wizard.md). Skipped when the file is not present.
// If the department ships a newer export these expectations legitimately move —
// update the constants, don't delete the test.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRegistroWorkbook } from "../parse";
import { reduceRegistro } from "../reduce";
import { analyzeRegistro } from "../analyze";
import { DEFAULT_SCOPE, type ReduceResult, type RegistroRow, type ParseStats } from "../types";

const FILE = resolve(process.cwd(), "..", "Excel_Registro.xlsx");
const skip = !existsSync(FILE) && "Excel_Registro.xlsx not found at repo root";

let rows: RegistroRow[] = [];
let stats: ParseStats;
let red: ReduceResult;

// the 5 codes bound in the local catalogs that have no registro row at all
const BOUND_NO_ROW = ["IELE2150", "IELE3118", "IELE3218", "IELE3502", "MATE1201"];

before(() => {
  if (skip) return;
  ({ rows, stats } = parseRegistroWorkbook(readFileSync(FILE)));
  red = reduceRegistro(rows, DEFAULT_SCOPE, BOUND_NO_ROW);
});

test("real: parse keeps every real row and drops only the footer", { skip, timeout: 120_000 }, () => {
  assert.equal(stats.droppedBadPeriod, 1);
  assert.equal(stats.droppedNoCode, 0);
  assert.equal(stats.keptRows, stats.totalRows - 1);
  assert.ok(stats.keptRows > 100_000);
  assert.ok(rows.every((r) => /^\d{6}$/.test(r.period)));
});

test("real: window = the 3 newest regular terms WITH department rows (not the future 202701)", { skip }, () => {
  assert.deepEqual(red.window!.selectedRegular, ["202620", "202610", "202520"]);
  assert.equal(red.window!.max, "202620");
  assert.ok(rows.some((r) => r.period === "202701"), "sanity: 202701 exists in the file");
});

test("real: core scope is department + PREG only, inside the window", { skip }, () => {
  const core = [...red.entries.values()].filter((e) => e.isCore);
  assert.ok(core.length > 40 && core.length < 200, `core=${core.length}`);
  assert.ok(core.every((e) => e.nivel === "PREG"));
  assert.ok(core.every((e) => e.period >= "202520" && e.period <= "202620"));
  assert.ok(core.every((e) => /ELECTRICA Y ELECTRONICA|ELECTRONICA/.test(e.departamento)));
});

test("real: newest period wins — IELE3200 prereq is IELE 2206, not the oldest snapshot", { skip }, () => {
  const e = red.entries.get("IELE3200")!;
  assert.equal(e.period, "202620");
  assert.match(e.prereqText, /IELE 2206/);
  assert.doesNotMatch(e.prereqText, /IELE 2100/);
});

test("real: closure brings in MATE/FISI/IIND as non-core, with their registro data", { skip }, () => {
  for (const code of ["MATE1207", "IIND2106", "ISIS1221"]) {
    const e = red.entries.get(code);
    assert.ok(e, code);
    assert.equal(e!.isCore, false, code);
  }
});

test("real: the 5 bound-but-absent codes are absent from the dictionary", { skip }, () => {
  for (const c of BOUND_NO_ROW) assert.equal(red.entries.has(c), false, c);
});

test("real: analysis against those 5 reports exactly 5 bound-missing + the known stale refs", { skip }, () => {
  const catalogs = [
    {
      slug: "golden",
      courses: [
        ...BOUND_NO_ROW,
        ...[...red.entries.values()].filter((e) => e.isCore).map((e) => e.code),
      ].map((code, i) => ({
        id: i + 1, displayCode: code, code, name: red.entries.get(code)?.name ?? code, credits: 3,
        isPlaceholder: false, placeholderKind: null, prereqText: null, coreqText: null,
        manuallyEdited: false, lockedFields: [],
      })),
    },
  ];
  const items = analyzeRegistro(red.entries, catalogs);
  const bm = items.filter((i) => i.kind === "bound-missing").map((i) => i.code).sort();
  assert.deepEqual(bm, [...BOUND_NO_ROW].sort());
  const rm = items.filter((i) => i.kind === "ref-missing").map((i) => i.code);
  for (const c of ["FISI1028", "IELE1006", "IELE1010", "LENG2999", "MATE1257"]) {
    assert.ok(rm.includes(c), `expected ref-missing ${c}; got ${rm.join(",")}`);
  }
  const toks = items.filter((i) => i.kind === "token-nocourse").map((i) => i.code);
  for (const t of ["ENGL7", "RLEC1"]) assert.ok(toks.includes(t), t);
});

test("real: reduce is deterministic on the full file", { skip }, () => {
  const again = reduceRegistro(rows, DEFAULT_SCOPE, BOUND_NO_ROW);
  assert.equal(JSON.stringify([...again.entries]), JSON.stringify([...red.entries]));
});

test("real: shuffling input order does not change the dictionary", { skip }, () => {
  const rev = reduceRegistro([...rows].reverse(), DEFAULT_SCOPE, BOUND_NO_ROW);
  const a = [...red.entries].sort(([x], [y]) => x.localeCompare(y));
  const b = [...rev.entries].sort(([x], [y]) => x.localeCompare(y));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
