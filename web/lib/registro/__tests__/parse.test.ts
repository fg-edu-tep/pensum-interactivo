import test from "node:test";
import assert from "node:assert/strict";
import { parseRegistroWorkbook, RegistroFormatError } from "../parse";
import { workbookBuffer, HEADER } from "./fixtures";

test("parse: drops the 'Filtros aplicados' footer and counts it", () => {
  const buf = workbookBuffer([{ periodo: "202620", materia: "IELE-2100" }]);
  const { rows, stats } = parseRegistroWorkbook(buf);
  assert.equal(rows.length, 1);
  assert.equal(stats.droppedBadPeriod, 1);
  assert.equal(stats.totalRows, 2);
});

test("parse: normalizes codes and keeps a spaced display code", () => {
  const { rows } = parseRegistroWorkbook(
    workbookBuffer([
      { periodo: "202620", materia: "IELE-2100" },
      { periodo: "202620", materia: "IELE-1118L" },
      { periodo: "202620", materia: " mate 1207 " },
    ])
  );
  assert.deepEqual(rows.map((r) => r.code), ["IELE2100", "IELE1118L", "MATE1207"]);
  assert.deepEqual(rows.map((r) => r.displayCode), ["IELE 2100", "IELE 1118L", "mate 1207"]);
});

test("parse: '-' and whitespace cells are empty; credits accept comma decimals", () => {
  const { rows } = parseRegistroWorkbook(
    workbookBuffer([{ periodo: "202620", materia: "IELE-2100", pre: "-", co: "  ", credits: "2,5" }])
  );
  assert.equal(rows[0].prereqText, "");
  assert.equal(rows[0].coreqText, "");
  assert.equal(rows[0].credits, 2.5);
});

test("parse: rows with no code are dropped and counted", () => {
  const { rows, stats } = parseRegistroWorkbook(
    workbookBuffer([{ periodo: "202620", materia: "" }, { periodo: "202620", materia: "IELE-2100" }])
  );
  assert.equal(rows.length, 1);
  assert.equal(stats.droppedNoCode, 1);
});

test("parse: columns are found by name, not position, accent/case-insensitively", () => {
  const shuffled = [...HEADER].reverse().map((h) => h.toUpperCase());
  // reverse column order in the data as well
  const buf = workbookBuffer([], { header: shuffled });
  assert.throws(() => parseRegistroWorkbook(buf), RegistroFormatError); // no data rows -> clear error
  const ok = workbookBuffer([{ periodo: "202620", materia: "IELE-2100", nombre: "Circuitos" }], {
    header: HEADER.map((h) => h.toLowerCase()),
  });
  assert.equal(parseRegistroWorkbook(ok).rows[0].name, "Circuitos");
});

test("parse: missing required columns -> RegistroFormatError naming them", () => {
  const buf = workbookBuffer([{ periodo: "202620", materia: "X" }], { header: ["A", "B", "C"] });
  assert.throws(
    () => parseRegistroWorkbook(buf),
    (e: unknown) => e instanceof RegistroFormatError && /Periodo/.test((e as Error).message)
  );
});

test("parse: garbage buffer -> RegistroFormatError, not a crash", () => {
  assert.throws(() => parseRegistroWorkbook(Buffer.from("not an xlsx at all")), RegistroFormatError);
});

test("parse: falls back to the first sheet when there is no 'Export' sheet", () => {
  const buf = workbookBuffer([{ periodo: "202620", materia: "IELE-2100" }], { sheet: "Hoja1" });
  assert.equal(parseRegistroWorkbook(buf).rows.length, 1);
});
