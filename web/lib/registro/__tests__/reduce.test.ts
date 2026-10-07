import test from "node:test";
import assert from "node:assert/strict";
import { computeTermWindow, isRegularTerm, reduceRegistro } from "../reduce";
import { DEFAULT_SCOPE, type RegistroRow } from "../types";
import { EE } from "./fixtures";

function row(p: Partial<RegistroRow> & { period: string; code: string }): RegistroRow {
  return {
    nivel: "PREG", facultad: "INGENIERÍA", departamento: EE, estado: "ACTIVO",
    displayCode: p.code, name: p.code, credits: 3, prereqText: "", coreqText: "", restrictions: {},
    ...p,
  };
}

test("isRegularTerm: 10 and 20 only", () => {
  for (const t of ["202610", "202620"]) assert.equal(isRegularTerm(t), true, t);
  for (const t of ["202619", "202611", "202614", "202618", "20262", "abc"]) assert.equal(isRegularTerm(t), false, t);
});

test("window: picks the 3 newest regular terms that have in-scope rows", () => {
  const rows = ["202420", "202510", "202520", "202610", "202620"].map((p) => row({ period: p, code: "IELE2100" }));
  const w = computeTermWindow(rows, DEFAULT_SCOPE)!;
  assert.deepEqual(w.selectedRegular, ["202620", "202610", "202520"]);
  assert.equal(w.min, "202520");
  assert.equal(w.max, "202620");
  assert.deepEqual(w.availableRegular, ["202620", "202610", "202520", "202510", "202420"]);
});

test("window: a future term with NO department rows does not become the newest (real 202701)", () => {
  const rows = [
    row({ period: "202701", code: "MBAV4102", departamento: "ADMINISTRACION", nivel: "POST" }),
    row({ period: "202620", code: "IELE2100" }),
    row({ period: "202610", code: "IELE2100" }),
  ];
  const w = computeTermWindow(rows, DEFAULT_SCOPE)!;
  assert.equal(w.max, "202620");
});

test("window: fewer than 3 regular terms -> uses what exists", () => {
  const w = computeTermWindow([row({ period: "202620", code: "A1111" })], DEFAULT_SCOPE)!;
  assert.deepEqual(w.selectedRegular, ["202620"]);
});

test("window: no in-scope rows -> null", () => {
  assert.equal(computeTermWindow([row({ period: "202620", code: "X1111", departamento: "OTRO" })], DEFAULT_SCOPE), null);
});

test("window: admin override of selected terms is honoured and intersected with available", () => {
  const rows = ["202510", "202520", "202610", "202620"].map((p) => row({ period: p, code: "IELE2100" }));
  const w = computeTermWindow(rows, { ...DEFAULT_SCOPE, selectedRegularTerms: ["202620", "202520", "199910"] })!;
  assert.deepEqual(w.selectedRegular, ["202620", "202520"]);
  assert.equal(w.min, "202520");
});

test("window: departments match accent/case/space-insensitively, legacy dept included", () => {
  const rows = [
    row({ period: "202620", code: "A1111", departamento: "  ingen.  electrica y electronica " }),
    row({ period: "202610", code: "B1111", departamento: "INGENIERIA ELECTRONICA" }),
  ];
  const w = computeTermWindow(rows, DEFAULT_SCOPE)!;
  assert.deepEqual(w.selectedRegular, ["202620", "202610"]);
});

test("reduce: newest in-window period wins regardless of row order (the 2026-09-30 landmine)", () => {
  const rows = [
    row({ period: "202620", code: "IELE1002", name: "NUEVO", prereqText: "IELE 1001" }),
    row({ period: "202520", code: "IELE1002", name: "VIEJO", prereqText: "" }),
    row({ period: "202610", code: "IELE1002", name: "MEDIO", prereqText: "" }),
  ];
  for (const order of [rows, [...rows].reverse(), [rows[1], rows[0], rows[2]]]) {
    const { entries } = reduceRegistro(order, DEFAULT_SCOPE);
    assert.equal(entries.get("IELE1002")!.name, "NUEVO");
    assert.equal(entries.get("IELE1002")!.period, "202620");
  }
});

test("reduce: rows older than the window are ignored even if the code only exists there", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100" }), row({ period: "202610", code: "IELE2100" }),
    row({ period: "202520", code: "IELE2100" }),
    row({ period: "202420", code: "IELE9999" }),
  ];
  assert.equal(reduceRegistro(rows, DEFAULT_SCOPE).entries.has("IELE9999"), false);
});

test("reduce: non-regular periods inside the range are kept, outside are not", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100" }), row({ period: "202610", code: "IELE2100" }),
    row({ period: "202520", code: "IELE2100" }),
    row({ period: "202618", code: "IELE4933" }), // inside
    row({ period: "202419", code: "IELE4000" }), // before window
    row({ period: "202701", code: "IELE4001" }), // after window
  ];
  const { entries } = reduceRegistro(rows, DEFAULT_SCOPE);
  assert.ok(entries.has("IELE4933"));
  assert.ok(!entries.has("IELE4000"));
  assert.ok(!entries.has("IELE4001"));
});

test("reduce: PREG only by default; POST included when asked", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100" }),
    row({ period: "202620", code: "IELE4100", nivel: "POST" }),
  ];
  assert.ok(!reduceRegistro(rows, DEFAULT_SCOPE).entries.has("IELE4100"));
  assert.ok(reduceRegistro(rows, { ...DEFAULT_SCOPE, levels: ["PREG", "POST"] }).entries.has("IELE4100"));
});

test("reduce: non-ACTIVO rows are excluded", () => {
  const rows = [row({ period: "202620", code: "IELE2100" }), row({ period: "202620", code: "IELE2101", estado: "INACTIVO" })];
  assert.ok(!reduceRegistro(rows, DEFAULT_SCOPE).entries.has("IELE2101"));
});

test("reduce: closure pulls in referenced codes from OTHER departments, flagged non-core", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100", prereqText: "MATE 1207 Y (FISI 1028 O FISI 1528)", coreqText: "IELE-2100L" }),
    row({ period: "202620", code: "IELE2100L" }),
    // a department always has rows in several regular terms; FISI1528 sits in 202610
    row({ period: "202610", code: "IELE2100" }),
    row({ period: "202520", code: "IELE2100" }),
    row({ period: "202620", code: "MATE1207", departamento: "MATEMATICAS", name: "Cálculo" }),
    row({ period: "202610", code: "FISI1528", departamento: "FISICA" }),
  ];
  const r = reduceRegistro(rows, DEFAULT_SCOPE);
  assert.equal(r.entries.get("MATE1207")!.isCore, false);
  assert.equal(r.entries.get("FISI1528")!.isCore, false);
  assert.equal(r.entries.get("IELE2100L")!.isCore, true);
  assert.equal(r.entries.has("FISI1028"), false); // no row at all
  assert.equal(r.stats.closureMisses, 1);
});

test("reduce: closure ignores out-of-window rows and exam tokens", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100", prereqText: "LENG 2999 O ENGL7  O RLEC1 " }),
    row({ period: "202610", code: "IELE2100" }), row({ period: "202520", code: "IELE2100" }),
    row({ period: "201510", code: "LENG2999", departamento: "LENGUAS" }),
  ];
  const r = reduceRegistro(rows, DEFAULT_SCOPE);
  assert.equal(r.entries.has("LENG2999"), false);
  assert.equal(r.entries.has("ENGL7"), false);
  assert.equal(r.stats.closureMisses, 1); // LENG2999 only; tokens are not misses
});

test("reduce: extraCodes (catalog-bound) are looked up even when nothing references them", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100" }),
    row({ period: "202620", code: "DERE1234", departamento: "DERECHO" }),
  ];
  const r = reduceRegistro(rows, DEFAULT_SCOPE, ["DERE1234", "ZZZZ0000"]);
  assert.ok(r.entries.has("DERE1234"));
  assert.equal(r.stats.closureMisses, 1);
});

test("reduce: deterministic — same input twice, identical output", () => {
  const rows = [
    row({ period: "202620", code: "IELE2100", prereqText: "MATE 1207" }),
    row({ period: "202620", code: "MATE1207", departamento: "MATEMATICAS" }),
  ];
  const a = JSON.stringify([...reduceRegistro(rows, DEFAULT_SCOPE).entries]);
  const b = JSON.stringify([...reduceRegistro(rows, DEFAULT_SCOPE).entries]);
  assert.equal(a, b);
});

test("reduce: empty / no-scope input yields an empty, non-throwing result", () => {
  const r = reduceRegistro([], DEFAULT_SCOPE);
  assert.equal(r.window, null);
  assert.equal(r.entries.size, 0);
});
