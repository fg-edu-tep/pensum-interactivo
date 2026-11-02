import test from "node:test";
import assert from "node:assert/strict";
import { VENN_ELC, VENN_ELE, countByMask, filterVenn, toVennElectives, vennMask, type VennElectiveInput } from "./electiveVenn";

const row = (p: Partial<VennElectiveInput>): VennElectiveInput => ({
  id: 1,
  name: "X",
  code: null,
  level: "pregrado",
  ciclo: null,
  roles: { eleFrom2024: { norm: null }, elcFrom2024: { norm: null } },
  offeredTerms: [],
  ...p,
});

test("two sets from the 2024-I+ role columns; 'both' is the intersection", () => {
  assert.equal(vennMask(row({ roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: { norm: null } } })), VENN_ELE);
  assert.equal(vennMask(row({ roles: { eleFrom2024: null, elcFrom2024: { norm: "area_mayor" } } })), VENN_ELC);
  assert.equal(
    vennMask(row({ roles: { eleFrom2024: { norm: "curso_integrador" }, elcFrom2024: { norm: "electiva" } } })),
    VENN_ELE | VENN_ELC
  );
});

test("no master's set: master's-only rows and non-electives stay outside", () => {
  assert.equal(vennMask(row({ level: "maestria", roles: { eleFrom2024: { norm: "maestria" }, elcFrom2024: { norm: "maestria" } } })), 0);
  assert.equal(vennMask(row({ roles: { eleFrom2024: { norm: "obligatoria" }, elcFrom2024: { norm: "proy_grado" } } })), 0);
  // a master's-level course that IS an elective sits in its program's set
  assert.equal(vennMask(row({ level: "maestria", code: "IELE4111", roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: null } })), VENN_ELE);
});

test("filters: curso integrador and offered this semester, combinable", () => {
  const list = toVennElectives([
    row({ id: 1, isCursoIntegrador: true, roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: { norm: "electiva" } } }),
    row({ id: 2, roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: null } }),
    row({ id: 3, isCursoIntegrador: true, roles: { eleFrom2024: null, elcFrom2024: { norm: "electiva" } } }),
  ]);
  assert.deepEqual(filterVenn(list, { integrador: true, offeredIds: null }).map((e) => e.id), [1, 3]);
  assert.deepEqual(filterVenn(list, { integrador: true, offeredIds: new Set([3]) }).map((e) => e.id), [3]);
  const counts = countByMask(filterVenn(list, { integrador: false, offeredIds: null }));
  assert.deepEqual([counts.get(VENN_ELE), counts.get(VENN_ELE | VENN_ELC), counts.get(VENN_ELC)], [1, 1, 1]);
});

// ---- official bag (2026-10-29 review §2) ----
import { tagText, vennRows, vennCounts, programTag } from "./electiveVenn";

const off = (id: number, name: string, iele: object, ielc: object, offeredTerms: string[] = []) =>
  row({ id, name, attrs: { IELE: iele, IELC: ielc }, offeredTerms });
const PRACT = off(1, "Práctica profesional", { integrador: true }, { integrador: true }, ["202710"]);
const DIG = off(2, "Digitalización", { electiva: true, integrador: true }, { electiva: true, integrador: true }, ["202710"]);
const POT = off(3, "Electrónica de potencia", { obligatoria: true }, { electiva: true }, []);
const ROB = off(4, "Robótica", { electiva: true }, { electiva: true }, ["202710"]);
const list = toVennElectives([PRACT, DIG, POT, ROB]);

test("tags are per program and independent: 'Solo integrador', 'Electiva + Integrador', 'Solo electiva'", () => {
  assert.equal(tagText(list[0].ele!), "Solo integrador");
  assert.equal(tagText(list[1].ele!), "Electiva + Integrador");
  assert.equal(tagText(list[3].elc!), "Solo electiva");
  // obligatoria in Eléctrica → not in its column
  assert.equal(programTag(POT, "IELE"), null);
  assert.equal(list[2].mask, VENN_ELC);
});

test("double program: rows aligned by course, empty slot where a course doesn't count", () => {
  const rows = vennRows(list, { programs: { ele: true, elc: true }, type: "todas", term: null });
  const pot = rows.find((r) => r.e.name === "Electrónica de potencia")!;
  assert.deepEqual([pot.ele, pot.elc], [false, true]);
  assert.equal(rows.length, 4);
});

test("filters: integradores keeps tags (Electiva + Integrador still says so), period = an NRC in P", () => {
  const integ = vennRows(list, { programs: { ele: true, elc: false }, type: "integradores", term: null });
  assert.deepEqual(integ.map((r) => r.e.name).sort(), ["Digitalización", "Práctica profesional"]);
  assert.equal(tagText(integ.find((r) => r.e.name === "Digitalización")!.e.ele!), "Electiva + Integrador");
  const p = vennRows(list, { programs: { ele: false, elc: true }, type: "electivas", term: "202710" });
  assert.deepEqual(p.map((r) => r.e.name).sort(), ["Digitalización", "Robótica"]);
  assert.equal(vennCounts(list, "todas", null).get(VENN_ELE | VENN_ELC), 3);
});
