import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogRules, Course } from "./types";
import { courseAvailability, catalogCodesOf } from "./availability";
import { RETIRED_DEFAULT_IDS, creditUnlockLabel, withRuleDefaults } from "./creditUnlocks";

const slot = (id: string, kind: string) =>
  ({
    id, code: kind, codeNormalized: id, name: kind, credits: 2, semester: 7, type: "electiva", isPlaceholder: true,
    placeholderKind: kind, prereqText: "", coreqText: "", prereqTree: null, prereqCourseIds: [], prereqExternal: [],
    coreqTree: null, coreqCourseIds: [], coreqExternal: [],
  }) as Course;

const seeded: CatalogRules = {
  attestations: [],
  creditUnlocksSeeded: true,
  gates: [
    { id: "creditos-efi", label: creditUnlockLabel(75), appliesTo: { placeholderKinds: ["EFI"] }, condition: { minCredits: 75 } },
    { id: "creditos-electivas", label: creditUnlockLabel(80), appliesTo: { placeholderKinds: ["ELECTIVA"] }, condition: { minCredits: 80 } },
    { id: "creditos-cle-ci", label: creditUnlockLabel(40), appliesTo: { placeholderKinds: ["CLE", "CI"] }, condition: { minCredits: 40 } },
    { id: "mine", label: "x", appliesTo: { placeholderKinds: ["CBU"] }, condition: { minCredits: 10 } },
  ],
};

test("the 2026-10-22 credit-threshold defaults are removed once; an admin's own threshold stays", () => {
  const r = withRuleDefaults(seeded, { slug: "ielc-cbu3" });
  assert.deepEqual(r.gates.map((g) => g.id), ["mine"]);
  assert.equal(r.creditUnlocksRetired, true);
  // later: an admin re-creates one with a default id → kept
  const again = { ...r, gates: [...r.gates, { ...seeded.gates[0] }] };
  assert.equal(withRuleDefaults(again, { slug: "ielc-cbu3" }).gates.length, 2);
  for (const id of ["creditos-efi", "creditos-electivas", "creditos-cle-ci"]) assert.ok(RETIRED_DEFAULT_IDS.has(id));
});

test("an admin-kept threshold is still a soft 'aún no' state, never a lock", () => {
  const cbu = slot("ph-cbu-s1-1", "CBU");
  const rules = withRuleDefaults(seeded, { slug: "ielc-cbu3" });
  const a = courseAvailability(cbu, new Set(), catalogCodesOf([cbu]), [cbu], { rules, approvedCredits: 0 });
  assert.deepEqual([a.status, a.gateReasons], ["blocked", []]);
  assert.equal(courseAvailability(cbu, new Set(), catalogCodesOf([cbu]), [cbu], { rules, approvedCredits: 10 }).status, "available");
});

test("the Requisito segundo idioma attestation is added once, right after the English one, pregrado only", () => {
  const base = { gates: [], attestations: [{ id: "idioma", label: "Lectura en inglés" }, { id: "saberpro", label: "Saber Pro" }] };
  const r = withRuleDefaults(base, { slug: "iele-cbu3" });
  assert.deepEqual(r.attestations.map((a) => a.id), ["idioma", "segundo-idioma", "saberpro"]);
  assert.match(r.attestations[1].infoUrl ?? "", /requisito-de-dominio-en-segunda-lengua/);
  const removed = { ...r, attestations: r.attestations.filter((a) => a.id !== "segundo-idioma") };
  assert.equal(withRuleDefaults(removed, { slug: "iele-cbu3" }).attestations.length, 2);
  assert.equal(withRuleDefaults(base, { slug: "m-iele", programName: "Maestría en Ingeniería Eléctrica" }).attestations.length, 2);
});
