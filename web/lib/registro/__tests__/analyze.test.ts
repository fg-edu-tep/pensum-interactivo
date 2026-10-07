import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRegistro,
  effectiveResolution,
  pendingDecisions,
  planLinks,
  validateResolutions,
} from "../analyze";
import type { CatalogCourseInput, CatalogInput, DictionaryEntry } from "../types";

function entry(code: string, p: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    code, displayCode: code, name: code, credits: 3, departamento: "D", nivel: "PREG",
    period: "202620", prereqText: "", coreqText: "", restrictions: {}, isCore: true, ...p,
  };
}
function dict(...es: DictionaryEntry[]) {
  return new Map(es.map((e) => [e.code, e]));
}
let id = 0;
function cc(code: string | null, p: Partial<CatalogCourseInput> = {}): CatalogCourseInput {
  return {
    id: ++id, displayCode: code ?? "CBU", code, name: code ?? "CBU", credits: 3,
    isPlaceholder: code === null, placeholderKind: code === null ? "CBU" : null,
    prereqText: null, coreqText: null, manuallyEdited: false, lockedFields: [], ...p,
  };
}
const cat = (slug: string, ...courses: CatalogCourseInput[]): CatalogInput => ({ slug, courses });
const kinds = (items: ReturnType<typeof analyzeRegistro>) => items.map((i) => i.key).sort();

test("analyze: bound code with no registro row -> bound-missing (action), with name-based suggestions", () => {
  const e = dict(entry("IELE3119", { name: "Sistemas de Potencia" }));
  const items = analyzeRegistro(e, [cat("iele", cc("IELE3118", { name: "Sistemas de Potencia" }))]);
  const it = items.find((i) => i.key === "bound-missing:IELE3118")!;
  assert.equal(it.severity, "action");
  assert.deepEqual(it.allowed, ["keep", "rebind"]);
  assert.equal((it.detail.suggestions as { code: string }[])[0].code, "IELE3119");
});

test("analyze: one bound-missing item per code even when several catalogs use it", () => {
  const items = analyzeRegistro(dict(), [cat("a", cc("IELE2150")), cat("b", cc("IELE2150"))]);
  const its = items.filter((i) => i.kind === "bound-missing");
  assert.equal(its.length, 1);
  assert.deepEqual(its[0].catalogs, ["a", "b"]);
});

test("analyze: ref-missing only for refs made by catalog-bound courses", () => {
  const e = dict(
    entry("IELE2100", { prereqText: "FISI 1028 O FISI 1528" }),
    entry("IELE9999", { prereqText: "LENG 3001" }), // not in any catalog -> noise
    entry("FISI1528")
  );
  const items = analyzeRegistro(e, [cat("iele", cc("IELE2100"))]);
  assert.deepEqual(kinds(items), ["ref-missing:FISI1028"]);
});

test("analyze: a referenced code that is itself bound in a catalog is NOT ref-missing", () => {
  const e = dict(entry("IELE2100", { prereqText: "IELE 2150" }));
  const items = analyzeRegistro(e, [cat("c", cc("IELE2100"), cc("IELE2150"))]);
  assert.ok(!items.some((i) => i.key === "ref-missing:IELE2150"));
  assert.ok(items.some((i) => i.key === "bound-missing:IELE2150"));
});

test("analyze: ref-missing BLOCKS only when a department (core) course references it; other depts' stale alternatives are info", () => {
  const e = dict(
    entry("IELE2100", { prereqText: "FISI 1028", isCore: true }),
    entry("IIND2401", { prereqText: "ECON 2106 O ECON 2108", isCore: false })
  );
  const items = analyzeRegistro(e, [cat("c", cc("IELE2100"), cc("IIND2401"))]);
  const sev = Object.fromEntries(items.filter((i) => i.kind === "ref-missing").map((i) => [i.code, i.severity]));
  assert.deepEqual(sev, { ECON2106: "info", ECON2108: "info", FISI1028: "action" });
  // info items never block apply, and keep is their default
  assert.deepEqual(pendingDecisions(items, {}).map((i) => i.key), ["ref-missing:FISI1028"]);
  const plan = planLinks(e, [cat("c", cc("IIND2401"))], items, {});
  assert.equal(plan.courses[0].changes[0].after, "ECON 2106 O ECON 2108"); // verbatim
});

test("analyze: a ref shared by a core and a non-core course is an action (core wins)", () => {
  const e = dict(
    entry("IELE2100", { prereqText: "FISI 1028", isCore: true }),
    entry("IIND2401", { prereqText: "FISI 1028", isCore: false })
  );
  const it = analyzeRegistro(e, [cat("c", cc("IELE2100"), cc("IIND2401"))]).find((i) => i.key === "ref-missing:FISI1028")!;
  assert.equal(it.severity, "action");
  assert.deepEqual(it.detail.coreReferencedBy, ["IELE2100"]);
});

test("analyze: exam tokens -> token-nocourse (info, accept), never ref-missing", () => {
  const e = dict(entry("IELE2300", { prereqText: "LENG 2999 O ENGL7  O RLEC1 " }), entry("LENG2999"));
  const items = analyzeRegistro(e, [cat("c", cc("IELE2300"))]);
  const toks = items.filter((i) => i.kind === "token-nocourse").map((i) => i.code).sort();
  assert.deepEqual(toks, ["ENGL7", "RLEC1"]);
  assert.ok(items.filter((i) => i.kind === "token-nocourse").every((i) => i.severity === "info"));
  assert.ok(!items.some((i) => i.kind === "ref-missing"));
});

test("analyze: name drift is accent/case/punctuation-insensitive; real differences flagged", () => {
  const e = dict(
    entry("IELE2100", { name: "CIRCUITOS 1" }),
    entry("IELE2206", { name: "ELECTRONICA ANALOGA" })
  );
  const items = analyzeRegistro(e, [
    cat("c", cc("IELE2100", { name: "Circuitos 1" }), cc("IELE2206", { name: "Electrónica de Potencia" })),
  ]);
  assert.ok(!items.some((i) => i.key === "name-drift:IELE2100"));
  assert.ok(items.some((i) => i.key === "name-drift:IELE2206"));
});

test("analyze: credits drift only when registro has credits and they differ", () => {
  const e = dict(entry("A1111", { credits: 4 }), entry("B1111", { credits: null }), entry("C1111", { credits: 3 }));
  const items = analyzeRegistro(e, [cat("c", cc("A1111"), cc("B1111"), cc("C1111"))]);
  assert.deepEqual(items.filter((i) => i.kind === "credits-drift").map((i) => i.code), ["A1111"]);
});

test("analyze: placeholders are reported per catalog, never auto-bound", () => {
  const items = analyzeRegistro(dict(), [cat("c", cc(null), cc(null))]);
  const p = items.find((i) => i.kind === "placeholder-slot")!;
  assert.equal(p.detail.count, 2);
  assert.equal(p.severity, "info");
});

test("pendingDecisions: only unresolved ACTION items; info items never block", () => {
  const items = analyzeRegistro(dict(entry("X1111", { prereqText: "ENGL7" })), [cat("c", cc("X1111"), cc("IELE2150"))]);
  const pend = pendingDecisions(items, {});
  assert.deepEqual(pend.map((i) => i.key), ["bound-missing:IELE2150"]);
  assert.equal(pendingDecisions(items, { "bound-missing:IELE2150": { action: "keep" } }).length, 0);
});

test("validateResolutions: unknown key, disallowed action, missing/self target", () => {
  const e = dict(entry("IELE3119"));
  const items = analyzeRegistro(e, [cat("c", cc("IELE3118"))]);
  const errs = validateResolutions(
    items,
    {
      "nope:X": { action: "keep" },
      "bound-missing:IELE3118": { action: "drop" } as never,
    },
    e
  );
  assert.equal(errs.length, 2);
  assert.deepEqual(validateResolutions(items, { "bound-missing:IELE3118": { action: "rebind", code: "iele 3119" } }, e), []);
  assert.equal(validateResolutions(items, { "bound-missing:IELE3118": { action: "rebind", code: "ZZZZ0000" } }, e).length, 1);
  assert.equal(validateResolutions(items, { "bound-missing:IELE3118": { action: "rebind", code: "IELE3118" } }, e).length, 1);
});

test("effectiveResolution: defaults to the first allowed action", () => {
  const items = analyzeRegistro(dict(), [cat("c", cc("IELE2150"))]);
  assert.deepEqual(effectiveResolution(items[0], {}), { action: "keep" });
});

// ------------------------------------------------------------------ planLinks

test("plan: prereq/coreq changes are detected by TREE, not by whitespace", () => {
  const e = dict(entry("IELE2100", { prereqText: "IELE 1001  Y  (MATE 1207 O MATE 1208)", coreqText: "IELE-2100L" }), entry("IELE2100L"));
  const c = cc("IELE2100", { prereqText: "IELE 1001 Y (MATE 1207 O MATE 1208)", coreqText: "IELE-2100L" });
  const plan = planLinks(e, [cat("c", c)], [], {});
  assert.equal(plan.courses[0].changes.length, 0);
  assert.equal(plan.perCatalog.c.unchanged, 1);
});

test("plan: a real prereq change is reported with before/after", () => {
  const e = dict(entry("IELE3200", { prereqText: "IELE 2206" }));
  const c = cc("IELE3200", { prereqText: "IELE 2100" });
  const ch = planLinks(e, [cat("c", c)], [], {}).courses[0].changes;
  assert.deepEqual(ch, [{ field: "prereqText", before: "IELE 2100", after: "IELE 2206" }]);
});

test("plan: registro clearing a prereq is a change to null", () => {
  const e = dict(entry("IELE2100", { prereqText: "" }));
  const ch = planLinks(e, [cat("c", cc("IELE2100", { prereqText: "IELE 1001" }))], [], {}).courses[0].changes;
  assert.deepEqual(ch, [{ field: "prereqText", before: "IELE 1001", after: null }]);
});

test("plan: names/credits are NOT touched unless the admin chose use-registro", () => {
  const e = dict(entry("A1111", { name: "Nuevo", credits: 4 }));
  const items = analyzeRegistro(e, [cat("c", cc("A1111", { name: "Viejo", credits: 3 }))]);
  assert.equal(planLinks(e, [cat("c", cc("A1111", { name: "Viejo", credits: 3 }))], items, {}).courses[0].changes.length, 0);
  const res = { "name-drift:A1111": { action: "use-registro" as const }, "credits-drift:A1111": { action: "use-registro" as const } };
  const ch = planLinks(e, [cat("c", cc("A1111", { name: "Viejo", credits: 3 }))], items, res).courses[0].changes;
  assert.deepEqual(ch.map((x) => x.field).sort(), ["credits", "name"]);
});

test("plan: ref-missing replace / drop rewrite the written expression", () => {
  const e = dict(entry("IELE2100", { prereqText: "FISI 1028 Y IELE 1002" }), entry("FISI1528"), entry("IELE1002"));
  const catalogs = [cat("c", cc("IELE2100"))];
  const items = analyzeRegistro(e, catalogs);
  const rep = planLinks(e, catalogs, items, { "ref-missing:FISI1028": { action: "replace", code: "FISI1528" } });
  assert.equal(rep.courses[0].changes[0].after, "FISI 1528 Y IELE 1002");
  const drp = planLinks(e, catalogs, items, { "ref-missing:FISI1028": { action: "drop" } });
  assert.equal(drp.courses[0].changes[0].after, "IELE 1002");
  const keep = planLinks(e, catalogs, items, { "ref-missing:FISI1028": { action: "keep" } });
  assert.equal(keep.courses[0].changes[0].after, "FISI 1028 Y IELE 1002"); // verbatim
});

test("plan: rebind produces a binding change and uses the TARGET's requirements", () => {
  const e = dict(entry("IELE3119", { prereqText: "IELE 2206" }));
  const catalogs = [cat("c", cc("IELE3118", { prereqText: "IELE 2100" }))];
  const items = analyzeRegistro(e, catalogs);
  const plan = planLinks(e, catalogs, items, { "bound-missing:IELE3118": { action: "rebind", code: "IELE3119" } });
  const p = plan.courses[0];
  assert.equal(p.targetCode, "IELE3119");
  assert.deepEqual(p.changes.map((c) => c.field), ["binding", "prereqText"]);
  assert.equal(p.noRegistro, false);
});

test("plan: bound code with no entry (kept) -> noRegistro, nothing changed", () => {
  const catalogs = [cat("c", cc("IELE2150"))];
  const plan = planLinks(dict(), catalogs, analyzeRegistro(dict(), catalogs), {});
  assert.equal(plan.courses[0].noRegistro, true);
  assert.equal(plan.perCatalog.c.noRegistro, 1);
});

test("plan: manuallyEdited rows are skipped and reported unless force", () => {
  const e = dict(entry("IELE3200", { prereqText: "IELE 2206" }));
  const c = cc("IELE3200", { prereqText: "IELE 2100", manuallyEdited: true });
  const held = planLinks(e, [cat("c", c)], [], {}).courses[0];
  assert.equal(held.changes.length, 0);
  assert.deepEqual(held.skipped, { fields: ["prereqText"], reason: "manuallyEdited" });
  const forced = planLinks(e, [cat("c", c)], [], {}, { force: true }).courses[0];
  assert.equal(forced.changes.length, 1);
  assert.equal(forced.skipped, null);
});

test("plan: lockedFields hold back only the locked field", () => {
  const e = dict(entry("ABCD1111", { prereqText: "MATE 2222", coreqText: "FISI-3333", name: "N", credits: 3 }));
  const c = cc("ABCD1111", { prereqText: "", coreqText: "", lockedFields: ["prereqText"] });
  const p = planLinks(e, [cat("c", c)], [], {}).courses[0];
  assert.deepEqual(p.changes.map((x) => x.field), ["coreqText"]);
  assert.deepEqual(p.skipped, { fields: ["prereqText"], reason: "locked" });
});

test("plan: slugs filter restricts which catalogs are planned", () => {
  const e = dict(entry("ABCD1111", { prereqText: "MATE 2222" }));
  const plan = planLinks(e, [cat("x", cc("ABCD1111")), cat("y", cc("ABCD1111"))], [], {}, { slugs: ["y"] });
  assert.deepEqual(Object.keys(plan.perCatalog), ["y"]);
});

test("plan: placeholders are never linked", () => {
  const plan = planLinks(dict(), [cat("c", cc(null))], [], {});
  assert.equal(plan.courses.length, 0);
});

test("plan: plain registro updates are NOT overrides; replace/drop/rebind are", () => {
  const e = dict(entry("IELE2100", { prereqText: "FISI 1028 Y IELE 1002" }), entry("IELE1002"), entry("FISI1528"));
  const catalogs = [cat("c", cc("IELE2100", { prereqText: "" }))];
  const items = analyzeRegistro(e, catalogs);
  const plain = planLinks(e, catalogs, items, {}).courses[0].changes[0];
  assert.equal(plain.override, undefined);
  const rep = planLinks(e, catalogs, items, { "ref-missing:FISI1028": { action: "replace", code: "FISI1528" } }).courses[0].changes[0];
  assert.equal(rep.override, true);

  const e2 = dict(entry("IELE3119"));
  const cats2 = [cat("c", cc("IELE3118"))];
  const it2 = analyzeRegistro(e2, cats2);
  const rb = planLinks(e2, cats2, it2, { "bound-missing:IELE3118": { action: "rebind", code: "IELE3119" } }).courses[0].changes[0];
  assert.deepEqual([rb.field, rb.override], ["binding", true]);
});

test("plan: a rebind is held back when the slot's displayCode is locked (editor's name for the code pin)", () => {
  const e = dict(entry("IELE3119"));
  const cats = [cat("c", cc("IELE3118", { lockedFields: ["displayCode"] }))];
  const items = analyzeRegistro(e, cats);
  const p = planLinks(e, cats, items, { "bound-missing:IELE3118": { action: "rebind", code: "IELE3119" } }).courses[0];
  assert.equal(p.changes.length, 0);
  assert.deepEqual(p.skipped, { fields: ["binding"], reason: "locked" });
});

test("plan: a dropped token that was the ONLY prerequisite clears the field", () => {
  const e = dict(entry("IELE2100", { prereqText: "FISI 1028" }));
  const cats = [cat("c", cc("IELE2100", { prereqText: "FISI 1028" }))];
  const items = analyzeRegistro(e, cats);
  const ch = planLinks(e, cats, items, { "ref-missing:FISI1028": { action: "drop" } }).courses[0].changes;
  assert.deepEqual(ch, [{ field: "prereqText", before: "FISI 1028", after: null, override: true }]);
});
