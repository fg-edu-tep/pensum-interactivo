import test from "node:test";
import assert from "node:assert/strict";
import {
  VENN_ELC,
  VENN_ELE,
  VENN_MAE,
  countByMask,
  isGraduateCode,
  toVennElectives,
  vennMask,
  type VennElectiveInput,
} from "./electiveVenn";

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

test("program sets come from the 2024-I+ role columns", () => {
  assert.equal(vennMask(row({ roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: { norm: null } } })), VENN_ELE);
  assert.equal(vennMask(row({ roles: { eleFrom2024: null, elcFrom2024: { norm: "area_mayor" } } })), VENN_ELC);
  assert.equal(
    vennMask(row({ roles: { eleFrom2024: { norm: "curso_integrador" }, elcFrom2024: { norm: "electiva" } } })),
    VENN_ELE | VENN_ELC
  );
});

test("obligatoria / proyecto de grado rows are not electives", () => {
  assert.equal(vennMask(row({ roles: { eleFrom2024: { norm: "obligatoria" }, elcFrom2024: { norm: "proy_grado" } } })), 0);
  assert.equal(
    vennMask(row({ roles: { eleFrom2024: { norm: "obligatoria" }, elcFrom2024: { norm: "electiva" } } })),
    VENN_ELC
  );
});

test("maestría = bag MAESTRÍA section or a 4000-level code", () => {
  assert.equal(vennMask(row({ level: "maestria" })), VENN_MAE);
  assert.equal(vennMask(row({ code: "MAIA4341" })), VENN_MAE);
  assert.equal(
    vennMask(row({ level: "maestria", roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: { norm: "electiva" } } })),
    VENN_ELE | VENN_ELC | VENN_MAE
  );
  assert.ok(isGraduateCode("IELE 4111"));
  assert.ok(isGraduateCode("MAIA-4341"));
  assert.ok(!isGraduateCode("IELE3336"));
  assert.ok(!isGraduateCode(null));
});

test("missing roles json does not throw", () => {
  assert.equal(vennMask(row({ roles: null })), 0);
});

test("countByMask tallies exact regions", () => {
  const list = toVennElectives([
    row({ id: 1, roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: null } }),
    row({ id: 2, roles: { eleFrom2024: { norm: "electiva" }, elcFrom2024: null } }),
    row({ id: 3, level: "maestria" }),
  ]);
  const c = countByMask(list);
  assert.equal(c.get(VENN_ELE), 2);
  assert.equal(c.get(VENN_MAE), 1);
  assert.equal(c.get(VENN_ELE | VENN_ELC), undefined);
});
