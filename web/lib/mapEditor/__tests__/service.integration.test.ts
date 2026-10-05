// B1 service integration — runs ONLY against a scratch database (DATABASE_URL must name a
// database containing "test"; copy it inside the container, never write the real one).
// Works on MySQL and on Postgres (the Vercel/Neon line): the raw SQL below is dialect-aware.
//   DATABASE_URL=mysql://root:pensum@127.0.0.1:3306/pensum_maptest \
//     node --import tsx --test lib/mapEditor/__tests__/service.integration.test.ts
import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { ReqNode } from "../../types";

const url = process.env.DATABASE_URL ?? "";
const isPg = /^postgres/i.test(url);
/** identifier quoting: Postgres folds unquoted camelCase to lowercase */
const q = (n: string) => (isPg ? `"${n}"` : n);
const txt = isPg ? "TEXT" : "CHAR";
const skip = !/\/[^/?]*test[^/?]*(\?|$)/i.test(url) && "DATABASE_URL is not a scratch (…test…) database";

type Svc = typeof import("../service");
type Db = typeof import("../../db");
let svc: Svc;
let prisma: Db["prisma"];
const SLUG = "iele-cbu3";

before(async () => {
  if (skip) return;
  svc = await import("../service");
  prisma = (await import("../../db")).prisma;
});

/** Whole CatalogCourse table as raw SQL sees it (SQL NULL vs JSON null preserved). */
async function rawTable(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT *, (${q("prereqTree")} IS NULL) AS _n1, (${q("coreqTree")} IS NULL) AS _n2, (${q("lockedFields")} IS NULL) AS _n3,
       CAST(${q("prereqTree")} AS ${txt}) AS _p, CAST(${q("coreqTree")} AS ${txt}) AS _c, CAST(${q("lockedFields")} AS ${txt}) AS _l
     FROM ${q("CatalogCourse")} ORDER BY id`
  );
  return JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
const leafCodes = (t: unknown, out: string[] = []): string[] => {
  const n = t as ReqNode | null;
  if (!n) return out;
  if (n.op === "COURSE") out.push(n.code ?? "");
  else n.items?.forEach((i) => leafCodes(i, out));
  return out;
};

async function view() {
  return svc.loadMapView(SLUG);
}
const versionsFor = (v: Awaited<ReturnType<typeof view>>, ids: number[]) =>
  Object.fromEntries(ids.map((id) => [id, v.rows.find((r) => r.id === id)!.version]));
const leaf = (code: string) => ({ kind: "leaf" as const, code, soft: false });

test("scratch DB sanity", { skip }, async () => {
  const v = await view();
  assert.ok(v.rows.length >= 40);
  assert.equal(new Set(v.rows.map((r) => r.sortIndex)).size, v.rows.length);
});

test("apply (move + prereq + coreq) then undo leaves the table byte-identical", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const real = v.rows.filter((r) => r.code);
  const a = real[0], b = real[1], c = real[2];
  const batch = {
    catalogSlug: SLUG,
    versions: versionsFor(v, [a.id, b.id, c.id]),
    orderVersion: v.orderVersion, allowUnknown: [c.code! + "L"],
    ops: [
      { op: "move" as const, courseId: a.id, semester: 3, position: 0 },
      { op: "setRequirement" as const, courseId: b.id, kind: "prereq" as const, model: { groups: [{ alts: [leaf(c.code!)] }] } },
      { op: "setRequirement" as const, courseId: b.id, kind: "coreq" as const, model: { groups: [{ alts: [leaf(c.code! + "L")] }] } },
    ],
  };
  const out = await svc.applyMapBatch(batch, "tester");
  assert.ok(out.editId > 0 && out.snapshotId);

  const after = await prisma.catalogCourse.findMany({ where: { id: { in: [a.id, b.id] } } });
  const A = after.find((r) => r.id === a.id)!, B = after.find((r) => r.id === b.id)!;
  assert.equal(A.suggestedSemester, 3);
  assert.ok((A.lockedFields as string[]).includes("suggestedSemester"));
  assert.match(B.prereqText ?? "", /^[A-ZÑ]+ \d{3,4}/);
  assert.deepEqual(leafCodes(B.prereqTree), [c.code]);
  assert.deepEqual(leafCodes(B.coreqTree), [c.code + "L"]);
  assert.ok((B.lockedFields as string[]).includes("prereqText") && (B.lockedFields as string[]).includes("coreqText"));
  assert.equal((B as { manuallyEdited: boolean }).manuallyEdited, false, "decision 1: never the whole-row flag");

  const audit = await prisma.auditLog.findFirst({ where: { action: "map.apply" }, orderBy: { id: "desc" } });
  assert.equal(audit?.actor, "tester");
  assert.equal((await prisma.catalogSnapshot.findUnique({ where: { id: out.snapshotId! } }))?.reason, "pre-map");
  assert.equal(new Set((await view()).rows.map((r) => r.sortIndex)).size, v.rows.length, "no sortIndex collisions");
  assert.notEqual(await rawTable(), pristine);

  const undo = await svc.undoMapEdit(out.editId, { actor: "tester" });
  assert.ok(undo.restored >= 2);
  assert.equal(await rawTable(), pristine, "table must be byte-identical after undo");
  await assert.rejects(() => svc.undoMapEdit(out.editId, { actor: "tester" }), /ya fue deshecha/);
});

test("stale version -> 409 and nothing written", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const r = v.rows.find((x) => x.code)!;
  const stale = { catalogSlug: SLUG, versions: { [r.id]: "deadbeefdeadbeef" }, ops: [
    { op: "setRequirement" as const, courseId: r.id, kind: "coreq" as const, model: { groups: [{ alts: [leaf("QQQQ1111")] }] } },
  ] };
  await assert.rejects(() => svc.applyMapBatch(stale, "tester"), (e: Error & { status?: number }) => e.status === 409);
  const move = { catalogSlug: SLUG, versions: versionsFor(v, [r.id]), orderVersion: "nope", ops: [
    { op: "move" as const, courseId: r.id, semester: 2, position: 0 },
  ] };
  await assert.rejects(() => svc.applyMapBatch(move, "tester"), (e: Error & { status?: number }) => e.status === 409);
  const missing = { catalogSlug: SLUG, versions: {}, ops: stale.ops };
  await assert.rejects(() => svc.applyMapBatch(missing, "tester"), (e: Error & { status?: number }) => e.status === 400);
  assert.equal(await rawTable(), pristine);
});

test("cycle / self-reference rejected, nothing written", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const codes = new Set(v.rows.map((r) => r.code).filter(Boolean));
  const dep = v.rows.find((r) => leafCodes(r.prereqTree).some((c) => codes.has(c)))!;
  const pre = v.rows.find((r) => r.code === leafCodes(dep.prereqTree).find((c) => codes.has(c)))!;
  const cyc = { catalogSlug: SLUG, versions: versionsFor(v, [pre.id]), ops: [
    { op: "setRequirement" as const, courseId: pre.id, kind: "prereq" as const, model: { groups: [{ alts: [leaf(dep.code!)] }] } },
  ] };
  await assert.rejects(() => svc.applyMapBatch(cyc, "tester"), /Ciclo de prerrequisitos/);
  const self = { catalogSlug: SLUG, versions: versionsFor(v, [pre.id]), ops: [
    { op: "setRequirement" as const, courseId: pre.id, kind: "coreq" as const, model: { groups: [{ alts: [leaf(pre.code!)] }] } },
  ] };
  await assert.rejects(() => svc.applyMapBatch(self, "tester"), /propio/);
  assert.equal(await rawTable(), pristine);
});

test("a failing later op rolls the whole batch back (nothing written)", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const r = v.rows.find((x) => x.code)!;
  const batch = { catalogSlug: SLUG, versions: { ...versionsFor(v, [r.id]), 999999: "x" }, orderVersion: v.orderVersion, ops: [
    { op: "move" as const, courseId: r.id, semester: 4, position: 0 },
    { op: "move" as const, courseId: 999999, semester: 1, position: 0 },
  ] };
  await assert.rejects(() => svc.applyMapBatch(batch, "tester"));
  assert.equal(await rawTable(), pristine);
});

test("unknown code needs confirmation (dictionary), then goes through and undoes", { skip }, async () => {
  const dict = await svc.loadDictionary();
  assert.ok(dict && dict.size > 10, "scratch DB needs an applied Registro run");
  const pristine = await rawTable();
  const v = await view();
  const r = v.rows.find((x) => x.code)!;
  const mk = (allow?: string[]) => ({
    catalogSlug: SLUG, versions: versionsFor(v, [r.id]), allowUnknown: allow,
    ops: [{ op: "setRequirement" as const, courseId: r.id, kind: "coreq" as const, model: { groups: [{ alts: [leaf("ZZZZ9999")] }] } }],
  });
  await assert.rejects(() => svc.applyMapBatch(mk(), "tester"), (e: Error & { status?: number; detail?: { unknownCodes: string[] } }) =>
    e.status === 409 && e.detail?.unknownCodes?.[0] === "ZZZZ9999");
  assert.equal(await rawTable(), pristine);
  const out = await svc.applyMapBatch(mk(["ZZZZ9999"]), "tester");
  assert.equal(out.changedRows, 1);
  await svc.undoMapEdit(out.editId, { actor: "tester" });
  assert.equal(await rawTable(), pristine);
});

test("SQL NULL vs JSON null survives apply+undo", { skip }, async () => {
  const pristine = await rawTable();
  const nulls = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT cc.id FROM ${q("CatalogCourse")} cc JOIN ${q("Catalog")} c ON c.id = cc.${q("catalogId")}
     WHERE c.slug = '${SLUG}' AND cc.${q("courseId")} IS NOT NULL AND cc.${q("coreqTree")} IS NULL LIMIT 1`
  );
  assert.ok(nulls.length, "need a row with SQL NULL coreqTree");
  const v = await view();
  const id = Number(nulls[0].id);
  const out = await svc.applyMapBatch({
    catalogSlug: SLUG, versions: versionsFor(v, [id]), allowUnknown: ["MATE1203L"],
    ops: [{ op: "setRequirement", courseId: id, kind: "coreq", model: { groups: [{ alts: [leaf("MATE1203L")] }] } }],
  }, "tester");
  await svc.undoMapEdit(out.editId, { actor: "tester" });
  assert.equal(await rawTable(), pristine);
});

test("undo refuses after a later edit (all-or-nothing); force restores", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const r = v.rows.find((x) => x.code)!;
  const out = await svc.applyMapBatch({
    catalogSlug: SLUG, versions: versionsFor(v, [r.id]), orderVersion: v.orderVersion,
    ops: [{ op: "move", courseId: r.id, semester: 7, position: 0 }],
  }, "tester");
  await prisma.catalogCourse.update({ where: { id: r.id }, data: { name: "x", suggestedSemester: 6 } });
  const mid = await rawTable();
  await assert.rejects(() => svc.undoMapEdit(out.editId, { actor: "tester" }), (e: Error & { status?: number }) => e.status === 409);
  assert.equal(await rawTable(), mid, "refused undo writes nothing");
  await svc.undoMapEdit(out.editId, { actor: "tester", force: true });
  await prisma.catalogCourse.update({ where: { id: r.id }, data: { name: r.name } });
  assert.equal(await rawTable(), pristine);
});

test("a no-change batch is refused", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  // first row of its semester, moved to position 0 of the same semester = no change
  const r = v.rows.find((x) => x.code && v.rows.filter((y) => y.suggestedSemester === x.suggestedSemester)[0].id === x.id)!;
  await assert.rejects(
    () => svc.applyMapBatch({
      catalogSlug: SLUG, versions: versionsFor(v, [r.id]), orderVersion: v.orderVersion,
      ops: [{ op: "move", courseId: r.id, semester: r.suggestedSemester, position: 0 }],
    }, "tester"),
    (e: Error & { status?: number }) => e.status === 422
  );
  assert.equal(await rawTable(), pristine);
});

test("real data, all plans: every row's own requirement round-trips as a no-op; deep expressions counted", { skip }, async () => {
  const { treeToModel, modelToText, isSimple } = await import("../model");
  const { planBatch } = await import("../plan");
  const { parseRequirement } = await import("../../import/requirementParser");
  const slugs = (await prisma.catalog.findMany({ select: { slug: true } })).map((c) => c.slug);
  assert.ok(slugs.length >= 5);
  let rows = 0, withReq = 0, complex = 0;
  for (const slug of slugs) {
    const v = await svc.loadMapView(slug);
    for (const r of v.rows) {
      rows++;
      for (const kind of ["prereq", "coreq"] as const) {
        const tree = (kind === "prereq" ? r.prereqTree : r.coreqTree) as ReqNode | null;
        if (!tree) continue;
        withReq++;
        const model = treeToModel(tree);
        if (!isSimple(model)) complex++;
        const plan = v.rows.map((x) => ({
          id: x.id, code: x.code, semester: x.suggestedSemester, sortIndex: x.sortIndex,
          prereqText: x.prereqText, coreqText: x.coreqText, prereqTree: x.prereqTree as ReqNode | null,
          coreqTree: x.coreqTree as ReqNode | null, lockedFields: (x.lockedFields as string[] | null) ?? [],
        }));
        const out = planBatch(plan, [{ op: "setRequirement", courseId: r.id, kind, model }]);
        assert.equal(out.changed.size, 0, `${slug} ${r.displayCode} ${kind} must be a no-op`);
        // the rendered text must re-parse to the same tree
        assert.deepEqual(
          JSON.stringify(parseRequirement(modelToText(model))),
          JSON.stringify(parseRequirement(modelToText(treeToModel(parseRequirement(modelToText(model)))))),
        );
      }
    }
  }
  console.log(`real data: ${slugs.length} plans, ${rows} rows, ${withReq} requirements, ${complex} deep (complex)`);
  assert.ok(withReq > 100);
});

test("two concurrent batches on the same version: exactly one wins, the other gets a conflict", { skip }, async () => {
  const pristine = await rawTable();
  const v = await view();
  const r = v.rows.find((x) => x.code)!;
  const mk = (sem: number) => ({
    catalogSlug: SLUG, versions: versionsFor(v, [r.id]), orderVersion: v.orderVersion,
    ops: [{ op: "move" as const, courseId: r.id, semester: sem, position: 0 }],
  });
  const results = await Promise.allSettled([svc.applyMapBatch(mk(6), "a"), svc.applyMapBatch(mk(7), "b")]);
  const ok = results.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ editId: number }>[];
  const bad = results.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  assert.equal(ok.length, 1, "exactly one batch applies");
  assert.equal((bad[0].reason as { status?: number }).status, 409, "the loser gets a 409 conflict");
  assert.equal(new Set((await view()).rows.map((x) => x.sortIndex)).size, v.rows.length, "no sortIndex collision");
  await svc.undoMapEdit(ok[0].value.editId, { actor: "tester" });
  assert.equal(await rawTable(), pristine);
});
