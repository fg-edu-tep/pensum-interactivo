import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_ORDER, courseTypeOfCategory, parseCategory } from "./courseCategory";

test("TIPO: the four generic values and the PDF's seven categories, any case or accents", () => {
  assert.equal(parseCategory("Obligatorio"), "obligatorio");
  assert.equal(parseCategory("OBLIGATORIA"), "obligatorio");
  assert.equal(parseCategory("Proyecto"), "proyecto");
  assert.equal(parseCategory("Proyectos"), "proyecto");
  assert.equal(parseCategory("Electiva"), "electiva");
  assert.equal(parseCategory("CBU"), "cbu");
  assert.equal(parseCategory("Fundamentos de Ingeniería"), "fing");
  assert.equal(parseCategory("FUNDAMENTOS TRANSVERSALES IEE"), "ftiee");
  assert.equal(parseCategory("fundamentos  específicos"), "fesp");
  assert.equal(parseCategory("Ciclo Terminal"), "terminal");
  assert.equal(parseCategory("Ciclo de Ciencias y Matemáticas"), "ciencias");
  assert.equal(parseCategory("Educación General"), "edugen");
  assert.equal(parseCategory(""), null);
  assert.equal(parseCategory("Otra cosa"), null);
});

test("course type per group keeps the planner's logic (projects, CBU, electives)", () => {
  assert.equal(courseTypeOfCategory("proyecto"), "proyecto");
  assert.equal(courseTypeOfCategory("terminal"), "electiva");
  assert.equal(courseTypeOfCategory("edugen"), "nucleo");
  assert.equal(CATEGORY_ORDER.length, 10);
});
