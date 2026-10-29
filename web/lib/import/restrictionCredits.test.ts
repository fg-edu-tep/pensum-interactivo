import test from "node:test";
import assert from "node:assert/strict";
import { highestExcludedSemester, restrictionToCredits } from "./restrictionCredits";

test("'excluye semestres 1–4' (Interfaces Hombre-Máquina) → 60 credits", () => {
  const ihm = "EXCLUYE INGRESA A PRIMER SEMESTRE & EXCLUYE INGRESA A SEGUNDO SEMESTRE & EXCLUYE INGRESA A  TERCER SEMESTRE & EXCLUYE INGRESA A CUARTO SEMESTRE";
  assert.deepEqual(restrictionToCredits(ihm), { semesters: 4, minCredits: 60 });
});

test("highest ordinal wins, accents and order don't matter", () => {
  assert.equal(highestExcludedSemester("EXCLUYE INGRESA A SÉPTIMO SEMESTRE & EXCLUYE INGRESA A PRIMER SEMESTRE"), 7);
  assert.equal(highestExcludedSemester("EXCLUYE INGRESA A PRIMER SEMESTRE"), 1);
});

test("INCLUYE clauses, 'estudiante nuevo' and empty values are not credit requirements", () => {
  assert.equal(restrictionToCredits("INCLUYE INGRESA A PRIMER SEMESTRE & INCLUYE INGRESA A SEGUNDO SEMESTRE"), null);
  assert.equal(highestExcludedSemester("EXCLUYE ESTUDIANTE NUEVO & EXCLUYE INGRESA A SEGUNDO SEMESTRE"), 2);
  assert.equal(restrictionToCredits(""), null);
  assert.equal(restrictionToCredits(null), null);
});
