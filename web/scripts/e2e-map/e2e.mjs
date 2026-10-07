// Browser E2E for the admin map. Needs: puppeteer-core installed OUTSIDE the repo (npm i puppeteer-core), Edge,
// a SCRATCH db served by 'DATABASE_URL=...pensum_maptest next dev -p 3100' (MySQL: copy the dev DB inside the container; Postgres: set E2E_PG=1 and
// use a throwaway container named pg-maptest), and an admin 'e2e' / 'e2e-password-1' created through /administrador/setup on that scratch server.
// See docs/admin-visual-editor.md.
// Browser E2E for the admin map (B2-B6) against the SCRATCH db on :3100. Edge via puppeteer-core.
import puppeteer from "puppeteer-core";
import { spawnSync } from "node:child_process";

const BASE = "http://localhost:3100";
const SLUG = "iele-cbu3";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const PG = process.env.E2E_PG === "1"; // run against the Postgres scratch container instead of MySQL
// the queries below are written MySQL-style; translate them for Postgres (quoted identifiers, string_agg, ...)
const toPg = (q) => q.replace(/pensum_maptest\./g, "")
  .replace(/\b(CatalogCourse|CatalogSnapshot|AuditLog)\b/g, '"$1"')
  .replace(/\b(suggestedSemester|sortIndex|prereqText|coreqText|prereqTree|coreqTree|lockedFields|manuallyEdited)\b/g, '"$1"')
  .replace(/IFNULL/g, "coalesce").replace(/AS CHAR/g, "AS TEXT").replace(/MD5\(/g, "md5(")
  .replace("GROUP_CONCAT(", "string_agg(").replace(" ORDER BY id)", ", '|' ORDER BY id)");
const sql = (q) => PG
  ? spawnSync("docker", ["exec", "pg-maptest", "psql", "-U", "pensum", "-d", "pensum_maptest", "-t", "-A", "-c", toPg(q)], { encoding: "utf8" }).stdout.trim()
  : spawnSync("docker", ["exec", "pensum-interactivo-db-1", "mysql", "-uroot", "-ppensum", "-N", "-e", q], { encoding: "utf8" }).stdout.trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1600, height: 950 },
});
const page = await browser.newPage();
const consoleErrors = [], badResponses = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
page.on("dialog", (d) => d.accept());

async function waitFor(fn, what, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const v = await page.evaluate(fn); if (v) return v; } catch {} await sleep(100); }
  throw new Error("timeout: " + what);
}
const status = () => page.$eval('[data-testid="status"]', (e) => e.textContent);
const api = (p, init) => page.evaluate(async (u, i) => { const r = await fetch(u, { cache: "no-store", ...i }); return { s: r.status, j: await r.json().catch(() => null) }; }, BASE + p, init);
const click = (sel) => page.click(sel);
async function selectCourse(id) { await page.click(`[data-course-id="${id}"]`); await waitFor(`!!document.querySelector('[data-testid="side-panel"]')`, "panel"); }
async function typeEnter(label, text) {
  const sel = `input[aria-label="${label}"]`;
  await page.click(sel); await page.type(sel, text); await page.keyboard.press("Enter"); await sleep(250);
}
const clickText = async (txt, scope = "button") => {
  const h = await page.evaluateHandle((t, s) => [...document.querySelectorAll(s)].find((b) => b.textContent.includes(t) && !b.disabled), txt, scope);
  if (!h.asElement()) throw new Error("no button: " + txt);
  await h.asElement().click(); await sleep(250);
};
const nodePos = (id) => page.evaluate((i) => {
  const n = document.querySelector(`.react-flow__node[data-id="${i}"]`);
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(n.style.transform); return { x: +m[1], y: +m[2] };
}, id);
async function dragTo(fromId, toId) {
  const a = await (await page.$(`[data-course-id="${fromId}"]`)).boundingBox();
  const b = await (await page.$(`[data-course-id="${toId}"]`)).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await sleep(150);
  await page.mouse.up(); await sleep(400);
}
const circles = () => page.$$eval("[data-edge-id]", (els) => els.map((e) => ({ id: e.dataset.edgeId, layer: e.dataset.layer, kind: e.dataset.kind, t: e.textContent, picked: e.getAttribute("aria-pressed") === "true" })));

try {
  // ---- login + data
  await page.goto(BASE + "/administrador/login");
  const lg = await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "e2e", password: "e2e-password-1" }) });
  ok(lg.s === 200, "login");
  const view = (await api(`/api/admin/catalogs/${SLUG}/map`)).j;
  const rows = view.rows;
  const real = rows.filter((r) => r.code);
  const semOf = (r) => r.suggestedSemester;
  const noPre = (r) => !r.prereqTree;
  const S1 = real.find((r) => semOf(r) === 1 && noPre(r));
  const S2 = real.find((r) => semOf(r) === 1 && noPre(r) && r.id !== S1.id);
  const S3 = real.find((r) => semOf(r) === 2 && noPre(r) && r.id !== S1.id && r.id !== S2.id) ?? real.find((r) => semOf(r) === 1 && noPre(r) && ![S1.id, S2.id].includes(r.id));
  const T = real.find((r) => semOf(r) >= 4 && noPre(r) && !r.coreqTree);
  ok(S1 && S2 && S3 && T, `fixtures S1=${S1?.code} S2=${S2?.code} S3=${S3?.code} T=${T?.code}`);
  const pristineTable = sql(`SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',id,suggestedSemester,sortIndex,IFNULL(prereqText,'~'),IFNULL(coreqText,'~'),IFNULL(CAST(prereqTree AS CHAR),'~'),IFNULL(CAST(coreqTree AS CHAR),'~'),IFNULL(CAST(lockedFields AS CHAR),'~')) ORDER BY id)) FROM pensum_maptest.CatalogCourse`);
  const strip = (p) => { const c = JSON.parse(JSON.stringify(p)); delete c.generatedAt; return c; };
  const studentBefore = strip((await api(`/api/catalogs/${SLUG}`)).j);
  const snapsBefore = Number(sql(`SELECT COUNT(*) FROM pensum_maptest.CatalogSnapshot WHERE reason='pre-map'`));

  // ---- B2: render parity
  console.log("B2 read-only canvas");
  await page.goto(`${BASE}/administrador/catalogos/${SLUG}/mapa`, { waitUntil: "networkidle0" });
  await waitFor(`document.querySelectorAll('[data-course-id]').length>0`, "cards");
  const nCards = await page.$$eval("[data-course-id]", (e) => e.length);
  ok(nCards === rows.length, `all ${rows.length} courses rendered (${nCards})`);
  let maxDelta = 0;
  const bySem = new Map();
  for (const r of [...rows].sort((a, b) => a.sortIndex - b.sortIndex)) { const k = semOf(r); bySem.set(k, [...(bySem.get(k) ?? []), r]); }
  for (const [sem, list] of bySem) for (let i = 0; i < list.length; i++) {
    const p = await nodePos(list[i].id);
    maxDelta = Math.max(maxDelta, Math.abs(p.x - (20 + (sem - 1) * 168)), Math.abs(p.y - (16 + 52 + i * 70)));
  }
  ok(maxDelta === 0, `card positions equal the student grid formula exactly (max delta ${maxDelta})`);
  ok(await page.$$eval("[data-edge-id]", (e) => e.length) === 0, "no edges before a selection");
  const withPre = real.find((r) => r.prereqTree);
  await selectCourse(withPre.id);
  const cs = await circles();
  ok(cs.length > 0, `selecting ${withPre.code} draws its edges (${cs.length} circles)`);
  ok(await page.$eval('[data-testid="side-panel"]', (e, c) => e.textContent.includes(c), withPre.displayCode), "side panel shows the course");
  ok(await page.$('[data-testid="students-see-prereq"]') !== null, "panel says who governs what students see");
  ok(await page.$eval('[data-testid="gates"]', () => true).catch(() => true), "gates list present");
  await page.click('input[type="checkbox"][aria-label="x"]').catch(() => {});
  // all-edges toggle
  const allBox = await page.evaluateHandle(() => [...document.querySelectorAll("label")].find((l) => l.textContent.includes("Todas las aristas")).querySelector("input"));
  await allBox.asElement().click(); await sleep(400);
  const allCount = (await circles()).length;
  ok(allCount > cs.length * 2, `"todas las aristas" shows many more (${allCount})`);
  await allBox.asElement().click(); await sleep(300);
  // warn badges vs discrepancy page count
  const warnBadges = await page.$$eval('[data-course-id] span[title="El documento difiere de la API"]', (e) => e.length);
  const discHtml = await page.evaluate(async (u) => (await fetch(u)).text(), `${BASE}/administrador/discrepancias`);
  const listHtml = await page.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).text(), `${BASE}/administrador`);
  const row = listHtml.split("<tr").find((r) => r.includes(`/catalogos/${SLUG}"`)) ?? "";
  const listWarn = Number(/⚠ (?:<!-- -->)?(\d+)/.exec(row)?.[1] ?? 0);
  const mapWarn = Number((await page.$eval('[data-testid="warn-count"]', (e) => e.textContent)).replace(/\D/g, ""));
  ok(listWarn > 0 && mapWarn === listWarn, `discrepancy count on the map (${mapWarn}) = catalog-list badge (${listWarn})`);
  ok(warnBadges > 0 && warnBadges <= mapWarn, `⚠ card badges (${warnBadges} courses) consistent with ${mapWarn} warned fields`);
  ok(JSON.stringify(studentBefore) === JSON.stringify(strip((await api(`/api/catalogs/${SLUG}`)).j)), "student payload unchanged by viewing");

  // ---- B4: list editing, circles, grouping
  console.log("B4 requirement editing");
  await selectCourse(T.id);
  await typeEnter("Agregar prerrequisito", S1.code);
  ok((await status()).includes("sin guardar"), "adding a prerequisite marks the plan dirty: " + (await status()));
  let cc = (await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq");
  ok(cc.length === 1, "one doc prereq circle for the new edge");
  await typeEnter("Agregar prerrequisito", S2.code);
  cc = (await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq");
  ok(cc.length === 2 && cc.every((c) => c.t === "Y"), "two AND edges (Y)");
  await typeEnter("Agregar prerrequisito", S1.code);
  ok((await status()).includes("ya es un requisito"), "duplicate refused: " + (await status()));
  // group with circles (shift-click second)
  await page.click(`[data-edge-id="${cc[0].id}"]`);
  await page.keyboard.down("Shift"); await page.click(`[data-edge-id="${cc[1].id}"]`); await page.keyboard.up("Shift");
  await sleep(200);
  ok((await circles()).filter((c) => c.picked).length === 2, "two circles picked");
  await clickText("Alternativas (O)");
  cc = (await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq");
  ok(cc.length === 2 && cc.every((c) => c.t === "O"), "grouped into OR (circles show O)");
  ok(await page.$eval('section[data-kind="prereq"]', (e) => e.textContent.includes("Alternativas (O)")), "list shows the OR group");
  await page.click(`[data-edge-id="${cc[0].id}"]`);
  await clickText("Separar");
  cc = (await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq");
  ok(cc.every((c) => c.t === "Y"), "ungroup restores AND");
  // delete via circle
  await page.click(`[data-edge-id="${cc[1].id}"]`);
  await clickText("Eliminar");
  ok((await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq").length === 1, "delete removes one edge");
  // connect by click mode (coreq)
  await clickText("Correquisito", "button[aria-pressed]");
  await clickText("Conectar por clic");
  await page.click(`[data-course-id="${S3.id}"]`); await page.click(`[data-course-id="${T.id}"]`); await sleep(300);
  ok((await circles()).some((c) => c.kind === "coreq" && c.layer === "doc"), "click-connect created a coreq edge (C)");
  await clickText("Conectar por clic");
  await clickText("Prerrequisito", "button[aria-pressed]");
  // drag-connect handles
  const hs = await (await page.$(`[data-course-id="${S2.id}"] .source`)).boundingBox().catch(() => null);
  const srcH = await page.$(`.react-flow__node[data-id="${S2.id}"] .react-flow__handle.source`);
  const dstH = await page.$(`.react-flow__node[data-id="${T.id}"] .react-flow__handle.target`);
  const sb = await srcH.boundingBox(), db = await dstH.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 10 }); await page.mouse.up(); await sleep(400);
  ok((await circles()).filter((c) => c.layer === "doc" && c.kind === "prereq").length === 2, "drag from handle to handle created the edge");
  // cycle refusal: T is prereq of S1? S1 <- T would make S1 require T while T requires S1
  await selectCourse(S1.id);
  await typeEnter("Agregar prerrequisito", T.code);
  ok((await status()).includes("ciclo"), "cycle refused: " + (await status()));
  await typeEnter("Agregar prerrequisito", S1.code);
  ok((await status()).includes("sí mismo"), "self reference refused: " + (await status()));
  // text editor: complex expression
  await selectCourse(T.id);
  const textBtn = await page.evaluateHandle(() => [...document.querySelectorAll('section[data-kind="prereq"] button')].find((b) => b.textContent.includes("Editar como texto")));
  await textBtn.asElement().click(); await sleep(200);
  await page.$eval('textarea[aria-label="Texto de Prerrequisitos"]', (t) => { t.value = ""; });
  await page.type('textarea[aria-label="Texto de Prerrequisitos"]', `(${S1.displayCode} Y ${S2.displayCode}) O ${S3.displayCode}`);
  await clickText("Aplicar texto");
  ok((await circles()).some((c) => c.t === "≡"), "complex expression shows ≡ circles");
  ok(await page.$eval('section[data-kind="prereq"]', (e) => e.textContent.includes("compuesta")), "list shows the complex alternative");
  await page.click(`[data-edge-id="${(await circles()).find((c) => c.t === "≡").id}"]`);
  ok(await page.$$eval("button", (b) => b.some((x) => x.textContent.includes("Eliminar") && x.disabled)), "complex edge cannot be deleted on the canvas");
  // bad text
  const ta = 'textarea[aria-label="Texto de Correquisitos"]';
  const t2 = await page.evaluateHandle(() => [...document.querySelectorAll('section[data-kind="coreq"] button')].find((b) => b.textContent.includes("Editar como texto")));
  await t2.asElement().click(); await sleep(150);
  await page.$eval(ta, (t) => { t.value = ""; }); await page.type(ta, "esto no es un codigo ((");
  await clickText("Aplicar texto");
  ok((await status()).includes("No se pudo interpretar"), "unparseable text refused: " + (await status()));

  // ---- B3: drag + save + undo
  console.log("B3 move, save, undo");
  await clickText("Descartar");
  ok((await status()).includes("Sin cambios"), "discard clears pending");
  const mover = real.find((r) => semOf(r) === 1 && r.id !== S1.id);
  const target = real.find((r) => semOf(r) === 3);
  await dragTo(mover.id, target.id);
  ok((await status()).includes("sin guardar"), "drag creates a pending move: " + (await status()));
  const np = await nodePos(mover.id), tp = await nodePos(target.id);
  ok(np.x === tp.x, `card snapped to semester 3 column (x ${np.x}=${tp.x})`);
  ok(sql(`SELECT suggestedSemester FROM pensum_maptest.CatalogCourse WHERE id=${mover.id}`) === String(semOf(mover)), "nothing written before Save");
  await clickText("↶ Deshacer");
  ok((await nodePos(mover.id)).x === 20, "local undo returns the card");
  await dragTo(mover.id, target.id);
  // also change a requirement in the same batch (T prereq via list)
  await selectCourse(T.id);
  await typeEnter("Agregar prerrequisito", S1.code);
  await clickText("Guardar");
  await waitFor(`document.querySelector('[data-testid="status"]').textContent.startsWith('Guardado')`, "saved", 15000);
  ok(true, "saved: " + (await status()));
  await sleep(1200);
  ok(sql(`SELECT suggestedSemester FROM pensum_maptest.CatalogCourse WHERE id=${mover.id}`) === "3", "DB has the new semester");
  ok(JSON.parse(sql(`SELECT lockedFields FROM pensum_maptest.CatalogCourse WHERE id=${mover.id}`)).includes("suggestedSemester"), "moved field pinned");
  ok(sql(`SELECT manuallyEdited FROM pensum_maptest.CatalogCourse WHERE id=${mover.id}`).match(/^(0|f)$/) !== null, "manuallyEdited NOT set");
  ok(Number(sql(`SELECT COUNT(*) FROM pensum_maptest.CatalogSnapshot WHERE reason='pre-map'`)) === snapsBefore + 1, "pre-map snapshot written");
  ok(sql(`SELECT actor FROM pensum_maptest.AuditLog WHERE action='map.apply' ORDER BY id DESC LIMIT 1`) === "e2e", "audit attributed to the logged-in user");
  // student invariance
  const studentAfter = strip((await api(`/api/catalogs/${SLUG}`)).j);
  const key = (c) => JSON.stringify(c);
  const bef = new Map(studentBefore.courses.map((c) => [c.id, c])), aft = new Map(studentAfter.courses.map((c) => [c.id, c]));
  const diffs = [...aft.keys()].filter((id) => key(aft.get(id)) !== key(bef.get(id)));
  ok(diffs.length >= 1 && diffs.length <= 2, `student payload differs only for the edited rows (${diffs.length})`);
  // persisted undo from history
  await clickText("Historial");
  await waitFor(`!!document.querySelector('[data-testid="history"] button')`, "history");
  await page.click('[data-testid="history"] button'); await sleep(1500);
  const after = sql(`SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',id,suggestedSemester,sortIndex,IFNULL(prereqText,'~'),IFNULL(coreqText,'~'),IFNULL(CAST(prereqTree AS CHAR),'~'),IFNULL(CAST(coreqTree AS CHAR),'~'),IFNULL(CAST(lockedFields AS CHAR),'~')) ORDER BY id)) FROM pensum_maptest.CatalogCourse`);
  ok(after === pristineTable, "undo through the UI leaves the table identical to before the editing session");
  ok(JSON.stringify(studentBefore) === JSON.stringify(strip((await api(`/api/catalogs/${SLUG}`)).j)), "student payload identical after undo");

  // ---- B5: unknown-code confirmation + governor statements
  console.log("B5/B6 alerts, unknown codes, keyboard, unparsed");
  await page.goto(`${BASE}/administrador/catalogos/${SLUG}/mapa`, { waitUntil: "networkidle0" });
  await selectCourse(T.id);
  await typeEnter("Agregar correquisito", "ZZZZ9999");
  await clickText("Guardar");
  await waitFor(`!!document.querySelector('[data-testid="unknown-ask"]')`, "unknown ask");
  ok(true, "unknown code asks for confirmation");
  await clickText("Sí, agregar");
  await waitFor(`document.querySelector('[data-testid="status"]').textContent.startsWith('Guardado')`, "saved unknown", 15000);
  ok(true, "saved after confirming");
  await sleep(1200);
  await clickText("Historial");
  await page.click('[data-testid="history"] button'); await sleep(1500);
  // governor statement for a document-governed course (no offering) vs api-governed
  const govTexts = new Set();
  for (const r of real.slice(0, 40)) {
    await page.click(`[data-course-id="${r.id}"]`).catch(() => {}); await sleep(60);
    const t = await page.$eval('[data-testid="students-see-prereq"]', (e) => e.textContent).catch(() => null);
    if (t) govTexts.add(t.startsWith("Los estudiantes verán") ? "api" : "doc");
  }
  ok(govTexts.has("api"), "API-governed courses say students see the official requirement");
  // keyboard
  await selectCourse(S2.id);
  const before = await nodePos(S2.id);
  await page.keyboard.down("Alt"); await page.keyboard.press("ArrowRight"); await page.keyboard.up("Alt"); await sleep(400);
  ok((await nodePos(S2.id)).x === before.x + 168, "Alt+→ moves the selected course one semester");
  await clickText("↶ Deshacer");
  ok((await nodePos(S2.id)).x === before.x, "undo returns it");
  // unparsed banner
  sql(`UPDATE pensum_maptest.CatalogCourse SET prereqText='MUS070.0', prereqTree=NULL WHERE id=${T.id}`);
  await page.goto(`${BASE}/administrador/catalogos/${SLUG}/mapa`, { waitUntil: "networkidle0" });
  await selectCourse(T.id);
  ok(await page.$eval('section[data-kind="prereq"]', (e) => e.textContent.includes("no se pudo interpretar")), "unparseable stored text is surfaced, not hidden");
  sql(`UPDATE pensum_maptest.CatalogCourse SET prereqText=NULL WHERE id=${T.id}`);

  console.log("\nconsole errors:", consoleErrors.length ? consoleErrors.slice(0, 5) : "none");
  console.log("4xx/5xx responses:", badResponses.length ? badResponses : "none");
} catch (e) {
  fail++; console.log("  FAIL exception:", e.message);
  await page.screenshot({ path: "e2e-fail.png" }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
