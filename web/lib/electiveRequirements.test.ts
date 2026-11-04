import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "./import/requirementParser";
import { parseCoreqText } from "./requirementResolve";
import { reqViewText, toReqView } from "./electiveRequirements";

const names = new Map([
  ["IELE2300", "ANÁLISIS DE SISTEMS DE CONTROL"],
  ["IELE2009", "COMPUTACION CIENTÍFICA EN IE"],
  ["IIND2106", "PROBABILIDAD Y ESTADÍSTICA I"],
  ["LENG1156", "ENGLISH 06"],
  ["IELE3102", "ANÁLISIS SISTEMAS DE POTENCIA"],
  ["IELE3336L", "LAB AUTOMATIZACIÓN INDUSTRIAL"],
]);

test("an OR of English alternatives collapses to one requirement", () => {
  const v = toReqView(parseRequirement("IELE 2300 Y (LENG 2999 O LENG 1156 O ENGL7 O INLE4 O RLEC1 O RLEN1 )"), names);
  assert.equal(v?.k, "all");
  assert.equal(
    reqViewText(v),
    "Análisis de sistems de control y Requisito de lectura en inglés (LENG 2999, English 06 (LENG 1156), ENGL7, INLE4, RLEC1 o RLEN1)"
  );
});

test("master's / doctoral standing go after the course path", () => {
  const v = toReqView(parseRequirement("EXMA1 O (IELE 2300 Y IELE 2009 Y IIND 2106) O EXDO1"), names);
  assert.equal(v?.k, "any");
  if (v?.k !== "any") return;
  assert.equal(v.items[0].k, "all");
  assert.deepEqual(v.items.slice(1).map((i) => (i.k === "token" ? i.code : "")), ["EXMA1", "EXDO1"]);
});

test("soft codes keep 'puede ser al tiempo'; unknown codes show spaced", () => {
  const v = toReqView(parseRequirement("IELE 3102* O IELE 3110*"), names);
  assert.equal(reqViewText(v), "Análisis sistemas de potencia (puede ser al tiempo) o IELE 3110 (puede ser al tiempo)");
});

test("hyphenated lab corequisite resolves by name", () => {
  const v = toReqView(parseCoreqText("IELE-3336L"), names);
  assert.deepEqual(v, { k: "course", code: "IELE3336L", name: "Lab automatización industrial", soft: false });
});

test("empty requirement → null", () => {
  assert.equal(toReqView(parseRequirement(""), names), null);
});
