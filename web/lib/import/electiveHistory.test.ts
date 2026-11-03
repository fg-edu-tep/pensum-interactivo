import test from "node:test";
import assert from "node:assert/strict";
import { abbreviationScore, deriveFrequency, electiveHistory, matchCodeByName, nameIndex, significantWords, type RegistroHistory } from "./electiveHistory";
import { parseFrequency } from "./parseElectivesWorkbook";

const w = significantWords;
const history: RegistroHistory = new Map([
  ["IELE3135", [{ period: "202520", name: "AUTOMAT SISTEMAS DISTRIBUCIÓN", credits: 3, prereqText: "IELE 2100", restriction: "", level: "" }]],
  ["IELE4311", [{ period: "202620", name: "SISTEMAS NO LINEALES", credits: 4, prereqText: "", restriction: "", level: "" }]],
  ["IELE3720", [
    { period: "202620", name: "INTERFACES HOMBRE-MÁQUINA", credits: 3, prereqText: "ISIS 1221", restriction: "", level: "" },
    { period: "202520", name: "INTERFACES HOMBRE-MÁQUINA", credits: 3, prereqText: "ISIS 1221", restriction: "", level: "" },
  ]],
  ["IELE3206", [
    { period: "202610", name: "INSTRUMENTACIÓN ELECTRÓNICA", credits: 2, prereqText: "IELE 2206", restriction: "", level: "" },
    { period: "202510", name: "INSTRUMENTACIÓN ELECTRÓNICA", credits: 2, prereqText: "IELE 2206", restriction: "", level: "" },
  ]],
]);
const idx = nameIndex(history);

test("abbreviations: truncated Registro names match, different courses don't", () => {
  assert.ok(abbreviationScore(w("AUTOMAT SISTEMAS DISTRIBUCION"), w("AUTOMATIZACION SISTEMAS DE DISTRIBUCION")) > 0);
  assert.equal(abbreviationScore(w("SISTEMAS NO LINEALES"), w("SISTEMAS LINEALES MULTIVARIABLES")), 0);
  assert.equal(abbreviationScore(w("ELEMENT.SISTEMAS ELECTRICOS"), w("SISTEMAS ELECTRICOS INDUSTRIALES")), 0);
});

test("code by name: exact (accent-insensitive) and abbreviated", () => {
  assert.equal(matchCodeByName("INTERFACES HOMBRE-MAQUINA", history, idx), "IELE3720");
  assert.equal(matchCodeByName("AUTOMATIZACION SISTEMAS DE DISTRIBUCION", history, idx), "IELE3135");
  assert.equal(matchCodeByName("SISTEMAS LINEALES MULTIVARIABLES", history, idx), null);
});

test("history: last period taught at or before the term, Registro prereqs, derived frequency", () => {
  const h = electiveHistory({ name: "INSTRUMENTACION ELECTRONICA", code: null, frequency: null }, history, idx, "202620");
  assert.deepEqual([h.code, h.codeSource, h.lastOfferedTerm, h.frequency, h.frequencySource, h.registroPrereqText], ["IELE3206", "registro", "202610", "s1", "registro", "IELE 2206"]);
});

test("history: the Excel's CÓDIGO / SE DICTA win over Registro", () => {
  const h = electiveHistory({ name: "ALGO", code: "IELE3206", frequency: "biennial" }, history, idx, "202620");
  assert.deepEqual([h.code, h.codeSource, h.frequency, h.frequencySource], ["IELE3206", "excel", "biennial", "excel"]);
});

test("frequency: both semesters, one semester, every two years", () => {
  assert.equal(deriveFrequency(["202610", "202520", "202510"], "202620"), "both");
  assert.equal(deriveFrequency(["202620", "202520", "202420"], "202620"), "s2");
  assert.equal(deriveFrequency(["202610", "202410", "202210"], "202620"), "biennial");
  assert.equal(deriveFrequency(["201010"], "202620"), null); // too old
});

test("SE DICTA cell values", () => {
  assert.equal(parseFrequency("1"), "s1");
  assert.equal(parseFrequency("Primer semestre"), "s1");
  assert.equal(parseFrequency("-2"), "s2");
  assert.equal(parseFrequency("Ambos"), "both");
  assert.equal(parseFrequency("1 y 2"), "both");
  assert.equal(parseFrequency("Cada dos años"), "biennial");
  assert.equal(parseFrequency(""), null);
});
