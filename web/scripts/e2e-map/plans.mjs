// Browser E2E for the admin map. Needs: puppeteer-core installed OUTSIDE the repo (npm i puppeteer-core), Edge,
// a SCRATCH db (docker exec ... mysqldump | mysql into pensum_maptest) served by 'DATABASE_URL=...pensum_maptest next dev -p 3100',
// and an admin 'e2e' / 'e2e-password-1' created through /administrador/setup on that scratch server. See docs/admin-visual-editor.md.
import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3100";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1600, height: 950 } });
const page = await browser.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon") && !m.text().includes("404")) errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("pageerror " + e.message));
await page.goto(BASE + "/administrador/login");
await page.evaluate(async () => { await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "e2e", password: "e2e-password-1" }) }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugs = ["iele-cbu3", "iele-cbu3-pc", "ielc-cbu3", "ielc-cbu3-pc", "doble-cbu3"];
let deepSeen = 0;
for (const slug of slugs) {
  const view = await page.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).json(), `${BASE}/api/admin/catalogs/${slug}/map`);
  await page.goto(`${BASE}/administrador/catalogos/${slug}/mapa`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-course-id]");
  const n = await page.$$eval("[data-course-id]", (e) => e.length);
  ok(n === view.rows.length, `${slug}: ${n}/${view.rows.length} cards render`);
  // deep expressions: select each, the list must show the compound alternative
  const hasAndInOr = (t) => { if (!t || t.op === "COURSE") return false; const groups = t.op === "AND" ? (t.items ?? []) : [t]; return groups.some((g) => g.op === "OR" && (g.items ?? []).some((k) => k.op === "AND")); };
  const isDeep = hasAndInOr;
  const deep = view.rows.filter((r) => isDeep(r.prereqTree) || isDeep(r.coreqTree));
  for (const r of deep) {
    deepSeen++;
    await page.click(`[data-course-id="${r.id}"]`); await sleep(120);
    const txt = await page.$eval('[data-testid="side-panel"]', (e) => e.textContent);
    if (!txt.includes("compuesta")) { ok(false, `${slug} ${r.displayCode}: deep expression shows as compound in the list`); }
  }
  // a11y: every button / input / link has an accessible name
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, input:not([type=hidden]), textarea, select")]
    .filter((e) => !(e.getAttribute("aria-label") || e.textContent.trim() || (e.labels && e.labels.length) || e.placeholder || e.title))
    .map((e) => e.outerHTML.slice(0, 80)));
  ok(unnamed.length === 0, `${slug}: all controls have accessible names ${unnamed.length ? JSON.stringify(unnamed.slice(0, 2)) : ""}`);
}
ok(deepSeen > 0, `deep expressions exercised in the UI (${deepSeen} selections, all showed as compound)`);
// keyboard access: Tab reaches a card, Enter selects it, panel opens
await page.goto(`${BASE}/administrador/catalogos/iele-cbu3/mapa`, { waitUntil: "networkidle0" });
const first = await page.$eval("[data-course-id]", (e) => e.dataset.courseId);
await page.focus(`[data-course-id="${first}"]`);
await page.keyboard.press("Enter"); await sleep(250);
ok(await page.$('[data-testid="side-panel"]') !== null, "Enter on a focused card selects it (keyboard access)");
const tabbable = await page.$$eval("[data-course-id]", (e) => e.every((x) => x.tabIndex === 0 && x.getAttribute("role") === "button"));
ok(tabbable, "every card is focusable with role=button");
// empty state: help panel when nothing selected
await page.keyboard.press("Escape");
{ const box = await (await page.$('[data-testid="canvas"]')).boundingBox(); await page.mouse.click(box.x + 4, box.y + 4); } await sleep(250);
ok((await page.$eval("main", (e) => e.textContent)).includes("Selecciona un curso"), "empty state explains how to start");
ok(errs.length === 0, "no console errors / page errors across all 5 plans " + (errs.length ? JSON.stringify(errs.slice(0, 3)) : ""));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
