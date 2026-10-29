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
