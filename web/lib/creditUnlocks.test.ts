import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogRules, Course } from "./types";
import { courseAvailability, catalogCodesOf } from "./availability";
import { CREDIT_UNLOCK_DEFAULTS, withCreditUnlockDefaults } from "./creditUnlocks";

const course = (p: Partial<Course>): Course => ({
  id: "X",
  code: "X",
  codeNormalized: "X",
  name: "X",
  credits: 3,
  semester: 1,
  type: "electiva",
  isPlaceholder: false,
  prereqText: "",
  coreqText: "",
  prereqTree: null,
  prereqCourseIds: [],
  prereqExternal: [],
  coreqTree: null,
  coreqCourseIds: [],
  coreqExternal: [],
  ...p,
});
const slot = (id: string, kind: string, semester = 6) =>
  course({ id, code: kind, codeNormalized: id, isPlaceholder: true, placeholderKind: kind, semester });

const efi = slot("ph-efi-s6-1", "EFI");
const ele = slot("ph-electiva-s7-1", "ELECTIVA", 7);
const cle = slot("ph-cle-s7-1", "CLE", 7);
const ci = slot("ph-ci-s7-1", "CI", 7);
const cbu = slot("ph-cbu-s1-1", "CBU", 1);
const real = course({ id: "IELE1002", codeNormalized: "IELE1002", semester: 6, type: "nucleo" });
const all = [efi, ele, cle, ci, cbu, real];
const codes = catalogCodesOf(all);
const rules: CatalogRules = withCreditUnlockDefaults({ gates: [], attestations: [] }, { slug: "ielc-cbu3", programName: "Ingeniería Electrónica" });

const status = (c: Course, credits: number) =>
  courseAvailability(c, new Set(), codes, all, { rules, approvedCredits: credits });

test("defaults: EFI 75, electivas 80, CLE + curso integrador 40", () => {
  const byKind = Object.fromEntries(CREDIT_UNLOCK_DEFAULTS.flatMap((g) => g.appliesTo.placeholderKinds!.map((k) => [k, g.condition.minCredits])));
  assert.deepEqual(byKind, { EFI: 75, ELECTIVA: 80, CLE: 40, CI: 40 });
});

test("a first-semester student (0 cr) sees EFI, electivas, CLE and CI as 'not yet' — not locked, no reason text", () => {
  for (const c of [efi, ele, cle, ci]) {
    const a = status(c, 0);
    assert.equal(a.status, "blocked", c.id);
    assert.deepEqual(a.gateReasons, [], c.id); // no lock, no "Se habilita con…"
  }
  assert.equal(status(cbu, 0).status, "available");
});

test("each slot opens at its own threshold", () => {
  assert.equal(status(cle, 39).status, "blocked");
  assert.equal(status(cle, 40).status, "available");
  assert.equal(status(ci, 40).status, "available");
  assert.equal(status(efi, 74).status, "blocked");
  assert.equal(status(efi, 75).status, "available");
  assert.equal(status(ele, 79).status, "blocked");
  assert.equal(status(ele, 80).status, "available");
});

test("slot gates never touch real courses, and code/semester gates never touch slots", () => {
  assert.equal(status(real, 0).status, "available");
  const bySemester: CatalogRules = { attestations: [], gates: [{ id: "s6", label: "s6", appliesTo: { semesters: [6] }, condition: { minCredits: 999 } }] };
  assert.equal(courseAvailability(efi, new Set(), codes, all, { rules: bySemester, approvedCredits: 0 }).status, "available");
  assert.equal(courseAvailability(real, new Set(), codes, all, { rules: bySemester, approvedCredits: 0 }).status, "blocked");
});

test("a locked slot marked as seen counts as approved", () => {
  assert.equal(courseAvailability(efi, new Set([efi.id]), codes, all, { rules, approvedCredits: 0 }).status, "approved");
});

test("defaults are added once, never to maestrías, and an admin's deletion sticks", () => {
  assert.equal(rules.gates.length, 3);
  assert.equal(rules.creditUnlocksSeeded, true);
  const master = withCreditUnlockDefaults({ gates: [], attestations: [] }, { slug: "m-iele", programName: "Maestría en Ingeniería Eléctrica" });
  assert.equal(master.gates.length, 0);
  const edited = { gates: [CREDIT_UNLOCK_DEFAULTS[0]], attestations: [], creditUnlocksSeeded: true };
  assert.equal(withCreditUnlockDefaults(edited, { slug: "iele-cbu3" }).gates.length, 1);
  // an admin value with a default id is kept, not duplicated
  const custom = { gates: [{ ...CREDIT_UNLOCK_DEFAULTS[0], condition: { minCredits: 60 } }], attestations: [] };
  const merged = withCreditUnlockDefaults(custom, { slug: "iele-cbu3" });
  assert.equal(merged.gates.filter((g) => g.id === "creditos-efi").length, 1);
  assert.equal(merged.gates.find((g) => g.id === "creditos-efi")!.condition.minCredits, 60);
});
