import test from "node:test";
import assert from "node:assert/strict";
import type { Course, ElectiveDTO } from "./types";
import { electiveState, slotCatalog, slotOpenness } from "./electiveAvailability";

const role = (norm: string | null) => ({ norm: norm as never, raw: norm ?? "" });
const elective = (id: number, p: Partial<ElectiveDTO>): ElectiveDTO => ({
  id, name: `E${id}`, code: null, level: "pregrado", ciclo: null,
  roles: { eleFrom2024: role("electiva"), elcFrom2024: role("electiva"), eleUntil2023: role(null), elcUntil2023: role(null) },
  isCursoIntegrador: false, offeredTerms: [], ...p,
});
const slot = (kind: string, label = kind) =>
  ({ id: `ph-${kind}`, code: label, codeNormalized: label, name: label, credits: 2, semester: 7, type: "electiva", isPlaceholder: true, placeholderKind: kind, placeholderLabel: label, prereqText: "", coreqText: "", prereqTree: null, prereqCourseIds: [], prereqExternal: [], coreqTree: null, coreqCourseIds: [], coreqExternal: [] }) as Course;

const codes = new Set(["IELE2300", "ISIS1221", "IELE2206"]);
const ctx = (approved: string[], credits = 0) => ({ approved: new Set(approved), cart: new Set<string>(), catalogCodes: codes, approvedCredits: credits });

const AUTO = elective(1, { code: "IELE3336", registroPrereqText: "IELE 2300" });
const IHM = elective(2, { code: "IELE3720", registroPrereqText: "ISIS 1221", minCredits: 60 });
const OBLIG = elective(3, { code: "IELE3106", roles: { eleFrom2024: role("obligatoria"), elcFrom2024: role("obligatoria"), eleUntil2023: role(null), elcUntil2023: role(null) } });
const INTEG = elective(4, { code: "IELE3222", registroPrereqText: "IELE 2206", isCursoIntegrador: true });
const bag = [AUTO, IHM, OBLIG, INTEG];

test("EFI and CLE are always enabled", () => {
  assert.equal(slotOpenness(slot("EFI"), bag, "IELC", ctx([])).open, true);
  assert.equal(slotOpenness(slot("CLE"), bag, "IELC", ctx([])).open, true);
});

test("an IELE elective slot opens when at least one of its electives can be taken now", () => {
  assert.equal(slotOpenness(slot("ELECTIVA", "ELECTIVA IELE"), bag, "IELC", ctx([])).open, false);
  assert.equal(slotOpenness(slot("ELECTIVA", "ELECTIVA IELE"), bag, "IELC", ctx(["IELE2300"])).open, true);
});

test("the credit restriction counts: ISIS 1221 alone doesn't open IHM below 60 credits", () => {
  assert.equal(electiveState(IHM, ctx(["ISIS1221"], 30)), "blocked");
  assert.equal(electiveState(IHM, ctx(["ISIS1221"], 60)), "now");
});

test("obligatory courses are not part of an elective slot's catalog; CI uses the integrador ones", () => {
  assert.ok(!slotCatalog(bag, "IELC", slot("ELECTIVA")).includes(OBLIG));
  assert.deepEqual(slotCatalog(bag, "IELC", slot("CI")).map((e) => e.id), [4]);
  assert.equal(slotOpenness(slot("CI"), bag, "IELC", ctx(["IELE2206"])).open, true);
});

test("a catalog the data can't evaluate stays enabled", () => {
  const unknown = [elective(9, {})];
  assert.deepEqual(slotOpenness(slot("ELECTIVA"), unknown, "IELC", ctx([])), { open: true, reason: "unevaluable" });
});

test("prerequisites outside this pensum must be approved; exam tokens stay informational", () => {
  const grad = elective(20, { code: "IELE4100", registroPrereqText: "EXMA1  O EXDO1  O IELE 3102 O IELE 3110" });
  assert.equal(electiveState(grad, ctx([])), "blocked"); // IELE 3102 isn't in this pensum but is a real course
  assert.equal(electiveState(grad, ctx(["IELE3102"])), "now");
  const english = elective(21, { code: "IELE3338", registroPrereqText: "IELE 2300 Y (LENG 2999 O ENGL7 )" });
  assert.equal(electiveState(english, ctx(["IELE2300"])), "now");
});

test("no code and no requirements = unknown (never 'puedes tomarla'); master's-only is blocked for pregrado", () => {
  assert.equal(electiveState(elective(22, {}), ctx([])), "unknown");
  const mag = elective(23, { code: "IQYA4202", registroLevel: "INCLUYE MAGISTER" });
  assert.equal(electiveState(mag, { ...ctx([]), pregrado: true }), "blocked");
  assert.equal(electiveState(mag, ctx([])), "now");
});
