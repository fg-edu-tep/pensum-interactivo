import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePlanesMatrix, isCompanion, slotSpec, displayCodeOf } from "./planesMatrix";
import { parseBolsas, parseProjection, rolesFromAttrs, emptyAttrs } from "./bolsas";
import { offeringFor } from "./offering";
import { programAllows, programAllowList, levelAllowsPregrado } from "./programRestriction";
import { prepareOfficialLoad } from "./prepare";
import { restrictionToCredits, highestExcludedSemester } from "../restrictionCredits";

// ---------- pure ----------

test("PROXIMO: a period, SEM, NODEF, blank", () => {
  assert.deepEqual(parseProjection("202810"), { kind: "term", term: "202810" });
  assert.deepEqual(parseProjection("2028-1"), { kind: "term", term: "202810" });
  assert.deepEqual(parseProjection("SEM"), { kind: "sem" });
  assert.deepEqual(parseProjection("NODEF"), { kind: "nodef" });
  assert.deepEqual(parseProjection(""), { kind: "none" });
});

test("'no primer semestre': EXCLUYE INGRESA A PRIMER SEMESTRE → 15 credits; estudiante nuevo counts as semester 1", () => {
  assert.deepEqual(restrictionToCredits("EXCLUYE INGRESA A PRIMER SEMESTRE"), { semesters: 1, minCredits: 15 });
  assert.equal(highestExcludedSemester("EXCLUYE ESTUDIANTE NUEVO"), 1);
  assert.equal(highestExcludedSemester("EXCLUYE INGRESA A SEMESTRE 12"), 12);
  // inclusion clauses ("only students entering semester n") are not minimums
  assert.equal(restrictionToCredits("INCLUYE INGRESA A PRIMER SEMESTRE"), null);
});

test("program restriction: allow-list, deny-list, double program", () => {
  const maia = "INCLUYE MAEST.INTELIGENCIA ARTIFICIAL & INCLUYE MAEST.GERENC.TECNOLOG.INFORMAC";
  assert.equal(programAllows(maia, "IELE"), false);
  assert.equal(programAllows(maia, "DOBLE"), false);
  const both = "INCLUYE INGENIERIA ELECTRONICA & INCLUYE INGENIERIA ELECTRICA & INCLUYE MAESTRIA EN ING.ELECTRICA";
  assert.equal(programAllows(both, "IELE"), true);
  assert.equal(programAllows(both, "IELC"), true);
  assert.equal(programAllows("INCLUYE INGENIERIA ELECTRICA", "IELC"), false);
  assert.equal(programAllows("INCLUYE INGENIERIA ELECTRICA", "DOBLE"), true);
  // "Maestría en ing. eléctrica" is not the undergraduate program
  assert.equal(programAllows("INCLUYE MAESTRIA EN ING.ELECTRICA", "IELE"), false);
  assert.equal(programAllows("EXCLUYE MAEST.INTELIGENCIA ARTIFICIAL", "IELE"), true);
  assert.equal(programAllows("", "IELE"), true);
  assert.equal(programAllowList(maia), "Maestría en inteligencia artificial, Maestría en gerencia tecnologías información");
  assert.equal(levelAllowsPregrado("INCLUYE MAGISTER"), false);
  assert.equal(levelAllowsPregrado("INCLUYE DOCTORADO & INCLUYE MAGISTER & INCLUYE PREGRADO"), true);
});

test("offering: export row for P, projection, coverage", () => {
  const covered = new Set(["202620", "202710"]);
  assert.equal(offeringFor(["202610", "202710"], covered, "202710", { kind: "term", term: "202810" }).status, "offered");
  assert.equal(offeringFor(["202620"], covered, "202710", { kind: "term", term: "202720" }).status, "not_offered");
  // no requisites → never in the export (IELE-2110): unknown unless projected
  assert.equal(offeringFor([], covered, "202710", { kind: "sem" }).status, "unknown");
  assert.equal(offeringFor([], covered, "202710", { kind: "term", term: "202710" }).status, "offered");
  // a period the export doesn't cover: the projection decides
  assert.equal(offeringFor(["202710"], covered, "202720", { kind: "sem" }).status, "offered");
  assert.equal(offeringFor(["202710"], covered, "202720", { kind: "term", term: "202810" }).status, "not_offered");
  assert.equal(offeringFor(["202710"], covered, "202720", { kind: "nodef" }).status, "unknown");
});

test("slot pseudo-codes and companions", () => {
  assert.equal(slotSpec("CBU3", "CICLO BASICO UNIANDINO")?.kind, "CBU");
  assert.equal(slotSpec("IXXX", "ELECTIVA EN FUNDAMENTOS DE INGENIERÍA")?.kind, "EFI");
  assert.equal(slotSpec("ELEC", "ELECTIVAS IELE")?.boxCredits, 2);
  assert.equal(slotSpec("CINTEG", "CURSO INTEGRADOR")?.kind, "CI");
  assert.equal(slotSpec("YYYY-4XXX", "CURSO LIBRE")?.kind, "CLE");
  assert.equal(slotSpec("IELE-1002", "FUNDAMENTOS DE CIRCUITOS"), null);
  assert.ok(isCompanion("IELE-1002L", "LAB.FUNDAMENTOS CIRCUITOS", 0));
  assert.ok(isCompanion("IELE-3403", "LAB. REDES DE TELECOMUNICACION", 0));
  assert.ok(!isCompanion("IELE-2900", "MONITORIA ING ELECTR-ELECTRO 1", 0) === true);
  assert.ok(!isCompanion("IELE-1002", "FUNDAMENTOS DE CIRCUITOS", 3));
  assert.equal(displayCodeOf("IELE-1002L"), "IELE 1002L");
});

test("roles from attributes: integrador is independent of electiva", () => {
  const a = emptyAttrs();
  a.IELE.integrador = true;
  a.IELC.electiva = true;
  a.IELC.integrador = true;
  const r = rolesFromAttrs(a);
  assert.equal(r.eleFrom2024.norm, "curso_integrador");
  assert.equal(r.elcFrom2024.norm, "electiva");
});

// ---------- golden: the department's files (skipped when absent) ----------

const DIR = resolve(process.cwd(), "..", "datos");
const files = {
  planes: resolve(DIR, "PLANES_202710.xlsx"),
  bolsas: resolve(DIR, "BOLSAS_202710.xlsx"),
  requisitos: resolve(DIR, "PRERREQUISITOS_202710.xlsx"),
};
const have = Object.values(files).every((f) => existsSync(f));

test("golden PLANES_202710: 7 plans, slots, companions, credits", { skip: !have }, () => {
  const m = parsePlanesMatrix(readFileSync(files.planes));
  assert.equal(m.period, "202710");
  assert.deepEqual(
    m.plans.map((p) => p.slug),
    ["iele-cbu3-pc", "iele-cbu3", "ielc-cbu3-pc", "ielc-cbu3", "doble-cbu3", "miele", "mielc"]
  );
  const credits = (slug: string) => m.courses[slug].reduce((s, c) => s + (c.credits ?? 0), 0);
  assert.equal(credits("iele-cbu3"), 134);
  assert.equal(credits("ielc-cbu3-pc"), 134);
  assert.equal(credits("doble-cbu3"), 149);
  // ELEC 4 cr → two 2-credit boxes: 8 elective credits = 4 boxes; double program 16 = 8
  const boxes = (slug: string) => m.courses[slug].filter((c) => c.placeholderKind === "ELECTIVA");
  assert.equal(boxes("iele-cbu3").length, 4);
  assert.ok(boxes("iele-cbu3").every((b) => b.credits === 2));
  assert.equal(boxes("doble-cbu3").length, 8);
  // labs are the parent's corequisite, never map nodes
  assert.deepEqual(m.companions.IELE2002, ["IELE2002L", "IELE2002T"]);
  assert.deepEqual(m.companions.IELE3402, ["IELE3403"]);
  for (const list of Object.values(m.courses)) assert.ok(!list.some((c) => /L$/.test(c.normalizedCode) && c.credits === 0));
  // PC = starts with Precálculo (MATE 1201) — only the PC plans have it
  assert.ok(m.courses["iele-cbu3-pc"].some((c) => c.normalizedCode === "MATE1201" && c.semester === 1));
  assert.ok(!m.courses["iele-cbu3"].some((c) => c.normalizedCode === "MATE1201"));
  // the corequisite is kept on the parent
  assert.equal(m.courses["iele-cbu3"].find((c) => c.normalizedCode === "IELE1002")?.coreqText, "IELE-1002L");
  // master's plans are drafts
  assert.equal(m.catalogs.find((c) => c.slug === "miele")?.status, "draft");
  assert.deepEqual(m.warnings, []);
});

test("golden BOLSAS_202710: attributes per program and PROXIMO", { skip: !have }, () => {
  const b = parseBolsas(readFileSync(files.bolsas));
  const row = (code: string) => b.rows.find((r) => r.normalizedCode === code)!;
  // Práctica profesional: integrador only, in both programs
  assert.deepEqual(row("IELE3090").attrs.IELE, { obligatoria: false, electiva: false, integrador: true, profundizacion: false });
  // Digitalización de subestaciones: electiva AND integrador
  assert.ok(row("IELE3740").attrs.IELE.electiva && row("IELE3740").attrs.IELE.integrador);
  // Electrónica de potencia: obligatoria in Eléctrica, electiva in Electrónica
  assert.ok(row("IELE3106").attrs.IELE.obligatoria && row("IELE3106").attrs.IELC.electiva);
  assert.deepEqual(row("IELE3338").projected, { kind: "term", term: "202810" });
  assert.equal(row("IELE4112").projected.kind, "nodef");
  assert.equal(row("IELE1002").projected.kind, "sem");
  assert.equal(row("IELE2900").projected.kind, "none");
  // the old bag's invented / mismatched codes are gone
  assert.ok(!b.rows.some((r) => r.normalizedCode === "FISI4961" || r.normalizedCode === "ISIS1226"));
  assert.equal(b.rows.length, 135);
});

test("golden full load: restrictions, program limits, offering per period", { skip: !have }, () => {
  const p = prepareOfficialLoad({
    planes: readFileSync(files.planes),
    bolsas: readFileSync(files.bolsas),
    requisitos: readFileSync(files.requisitos),
    currentTerm: "202620",
  });
  assert.equal(p.planningTerm, "202710");
  const c = p.codes;
  // "excluye ingresa a primer semestre" (Taller IEE 1) and longer ranges
  assert.equal(c.IELE1081.minCredits, 15);
  assert.equal(c.IELE3720.minCredits, 60);
  assert.equal(c.IELE3090.minCredits, 75);
  assert.equal(c.IELE4801.minCredits, 90);
  // MAIA courses closed to pregrado IELE/IELC unless the restriction names them
  assert.equal(programAllows(c.MAIA4100.restrictionPrograma, "IELE"), false);
  assert.equal(programAllows(c.MAIA4341.restrictionPrograma, "IELC"), true);
  assert.equal(programAllows(c.IELE3001.restrictionPrograma, "IELC"), false);
  // Robótica: taught in 2027-1 (row in the export), projected again 2028-1
  assert.equal(c.IELE3338.offering["202710"].status, "offered");
  assert.equal(c.IELE3338.projection?.kind, "term");
  // Análisis de sistemas de potencia: 2026-2 yes, 2027-1 no (projected 2027-2)
  assert.equal(c.IELE3102.offering["202620"].status, "offered");
  assert.equal(c.IELE3102.offering["202710"].status, "not_offered");
  // no requisites → not in the export: no guess
  assert.equal(c.IELE2110.offering["202710"].status, "unknown");
  // requisites come from the 2027-1 row (IELE 2100 no longer lists IELE 1006/1010)
  assert.match(c.IELE2100.prereqText, /^IELE 1002 Y/);
  // corequisites survive (labs)
  assert.equal(c.IELE2002.coreqText, "IELE-2002L");
  assert.ok(p.names.MATE1203?.name);
  assert.deepEqual(p.report.unparsed, []);
});
