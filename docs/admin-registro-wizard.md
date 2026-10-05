# Admin · Registro import wizard (Phase A)

Status: **Phase A implemented and verified** (branch `admin-auth-and-experience`, not committed).
Phase B (the drag-and-drop authoring canvas) builds on this and is documented
separately once started. **Nothing here touches the student explorer
(`PensumExplorer` / `MapCanvas`) or the existing `PLANES.xlsx` import path.**
See [Implementation & verification](#implementation--verification) for what differs from the first design.

## Why

`Excel_Registro.xlsx` (Banner/Registro master export, ~117k rows, every term back
to 2004) is the authoritative source for course names, credits, prereqs, coreqs
and restrictions. Today only `scripts/seed.ts` reads it, for one hard-coded term.
Coordinators need to (1) drop a fresh export in the admin, (2) have it reduced to
what matters for Ing. Eléctrica / Electrónica, (3) resolve everything that does
not line up, and (4) link the result to the live pensums — all with review and
rollback. The reduced, resolved data is also the **code dictionary** Phase B
uses for autocomplete/validation.

## Facts measured on the real file (2026-10-03)

| Fact | Value | Consequence |
|---|---|---|
| Size / parse | 2.8 MB, 116,692 data rows, ~7 s, ~650 MB RSS with `xlsx` | fine for a one-off admin upload; parse in a Node route, never in the browser |
| Junk row | last row is `Filtros aplicados: …` in the `Periodo` cell | rows whose `Periodo` is not `^\d{6}$` are dropped |
| Ragged rows | trailing empty cells omitted by some readers | always read by header index with `defval: ""` |
| Term codes | `10` 1st sem, `20` 2nd sem, `19` inter, plus sub-terms `11–15`, `18` (almost all graduate MAIA + one thesis), and a future `202701` with **0** department rows | "last 3 terms" must be defined on **regular** terms (see below) |
| Row order | newest period first per code (not chronological) | pick the newest period **inside the window** explicitly |
| **IELC has no code prefix** | 0 rows start `IELC`; electronics courses are `IELE…` | a prefix filter cannot express "IELE / IELC" |
| Department | `INGEN. ELECTRICA Y ELECTRONICA` (4,341 rows) + legacy `INGENIERIA ELECTRONICA` (60 rows, 2006-era `IEL2-…`) | scope by department |
| Program restriction | empty on 145/152 in-scope rows | cannot split IELE vs IELC either; both pensums share the department |
| Code formats | `AAAA-9999`, `AAAA-9999A` (lab/practice suffix), `AAA9-9999`; prereq text uses `IELE 2100`, soft marker `MATE 2210*`, fused tokens `ENGL7` `INLE4` `RLEC1` `RLEN1` | reuse `normalizeCode` + `requirementParser` (already handle all of these) |
| Prereq grammar | only `Y` / `O` and parentheses | existing parser is sufficient |
| Pensum deps outside the dept | MATE, FISI, IIND, ISIS, DERE, LENG, ESCR, LITE… (27 codes referenced by in-scope rows) | scope = department rows **plus closure** |
| Gaps | 5 codes bound in the DB have no registro row at all (`IELE2150 IELE3118 IELE3218 IELE3502 MATE1201`); 12 referenced codes have no row in the window (`FISI1028 IELE1006 IELE1010 IELE2210 LENG1103 LENG1501 LENG1512 LENG2999 LENG3001 LITE1611 LITE1622 MATE1257`) | these are the real test cases for the "resolve" step. (The 12 was measured over all department rows; `LENG3001` is only referenced by department courses that are not bound in any plan, so the wizard raises 11 blocking items — see "Decisions made while building".) |
| Name/credit drift inside the window | none | still detected and surfaced generically |

## Rules

**Term window.** Compute from the file, not the clock. Take the rows in
department scope, collect the distinct **regular** terms (`YYYY10`, `YYYY20`),
sort descending, keep the top **3** (today: `202620, 202610, 202520`). The
window is the inclusive range `[oldest regular, newest regular]`; non-regular
periods (`19`, `11–15`, `18`) that fall inside the range are kept, those outside
are not. The admin can override the auto-detected selection in step 2 (checkbox
per regular term). Why department-based: `202701` exists in the file but has no
department rows; a whole-file calculation would wrongly make it the newest term.

**Scope.**
1. *Core rows:* `Departamento ∈ {INGEN. ELECTRICA Y ELECTRONICA, INGENIERIA ELECTRONICA}`
   and `Nivel = PREG` (toggle to include `POST`), `Estado = ACTIVO`, period in window.
2. *Closure rows:* any code (any department, any level) that is referenced by a core
   row's prereq/coreq, or bound by a selected catalog, if it has a row in the window.
3. For each code the **newest period in the window** wins.

**Unresolved items** (step 3) — each must be resolved or explicitly accepted:

| Kind | Example | Choices |
|---|---|---|
| `bound-missing` — a code bound in a catalog has no row in the window | `IELE2150` | map to another registro code · keep catalog data as-is (no registro data) |
| `ref-missing` — a prereq/coreq token has no row in the window | `FISI1028` | map to a replacement code · keep as text-only reference · drop from the expression. **Blocks only if a department (core) course makes the reference**; stale alternatives inside another department's expression (e.g. `IIND2401` lists a dozen) are informational and default to keep |
| `token-nocourse` — fused non-course token | `ENGL7`, `RLEC1` | accept as exam/equivalence token (kept verbatim) |
| `name-drift` / `credits-drift` — registro differs from the catalog slot | | use registro · keep catalog value (recorded as an override) |
| `placeholder-slot` — catalog slot that is a pool (`CBU`, `ELECTIVA IELE`, `IELE 301X`) | | left alone; shown for information, never auto-bound |

Overrides (replace / drop / rebind) are recorded on the run and, when applied, pin
the field in `CatalogCourse.lockedFields` (`prereqText`, `coreqText`, or `displayCode`
for a rebind — the name the course editor uses for the code pin) so a later run cannot
silently undo them. The wizard **never sets `manuallyEdited`**: that flag means "an
admin hand-edited this row" and makes every later run skip it entirely.

**Link / apply.** For every non-placeholder `CatalogCourse` whose bound code has a
dictionary entry: write `prereqText/coreqText` + regenerate `prereqTree/coreqTree`
through `parseRequirement` (coreq `-` → space, as `persistCatalog` does); update
`Course.nameEs/defaultCredits` only via the chosen resolution. Rows that are
`manuallyEdited` or have the field in `lockedFields` are **skipped and reported**
unless the admin ticks "forzar". A `CatalogSnapshot` (`pre-import`) is written per
catalog first; everything runs in one transaction and is audited.

## Data model (new tables only — no existing table changes)

- `RegistroImport` — one wizard run: filename, status (`parsed | resolving | applied | discarded`),
  scope + window JSON, stats JSON, `resolutions` JSON, uploader, timestamps.
- `RegistroCourse` — the reduced dictionary for one import: `importId`, `normalizedCode`,
  `displayCode`, `nameEs`, `credits`, `department`, `nivel`, `period`, `prereqText`,
  `coreqText`, `restrictions` JSON, `isCore` (vs closure). `@@unique([importId, normalizedCode])`.
  The latest *applied* import is the live dictionary for Phase B.

Existing `ImportJob`/`PLANES.xlsx` flow is untouched.

## Wizard steps (`/administrador/registro`)

1. **Subir** — drop `Excel_Registro.xlsx`; server parses + reduces; shows row counts
   before/after and discarded-row reasons.
2. **Alcance** — term window (editable), departments, PREG/POST, preview counts.
3. **Resolver** — the unresolved table above, one decision per row, with registro search.
4. **Vincular** — per-catalog diff (prereq/coreq/name/credits changes, skipped locked
   rows); choose catalogs; "forzar" toggle.
5. **Aplicar** — snapshot + transaction + audit; summary and link to the catalogs.

## Test plan

Unit (node:test via `tsx --test`, no new dependencies), on synthetic workbooks built
with `xlsx` in-memory **and** on the real file (skipped if absent):
- parser: footer junk row, ragged rows, header-order independence, BOM/whitespace, `-` cells
- term window: regular-term selection, future term without dept rows ignored, `19`/sub-term inclusion, <3 terms available
- newest-in-window wins regardless of row order (the known landmine)
- scope: department variants, PREG vs POST toggle, closure pulls MATE/FISI, closure ignores out-of-window
- analysis: each unresolved kind, using the 5 + 12 real gaps as golden expectations
- idempotence: same input → identical reduced output

Integration: migrate, upload the real file via the API, walk every step, apply to a
copy of the local DB, verify prereq text/trees changed as expected, snapshot created,
audit rows attributed, locked rows skipped, and the student `/p/<slug>` pages still
render identically (byte-compare payload before/after for untouched catalogs).

## Implementation & verification

### Where things are

| Piece | Path |
|---|---|
| Pure logic (no I/O) | `web/lib/registro/{types,parse,reduce,requirements,analyze}.ts` |
| DB orchestration | `web/lib/registro/service.ts` (upload, rescope, resolutions, view, apply, undo, discard) |
| API | `POST /api/admin/registro` · `GET/PATCH/DELETE /api/admin/registro/[id]` · `POST …/[id]/apply` · `POST …/[id]/undo` (all behind the admin session middleware) |
| UI | `/administrador/registro` (list + upload), `/administrador/registro/[id]` (wizard), `web/components/admin/registro/*`, "Registro" in `AdminNav` |
| Schema | `RegistroImport`, `RegistroCourse` — migration `20261004011952_add_registro_import` (additive; no existing table changed) |
| Tests | `npm run test` → `tsx --test "lib/**/*.test.ts"` (Node's built-in runner; no new dependency) |

### Decisions made while building (differences from the first draft)

- **Scope is department-based** (IELC has no code prefix and the program-restriction column is empty).
- **The uploaded xlsx is kept** (`RegistroImport.fileBytes`, LONGBLOB) while a run is open so the term window can be re-computed (re-parse ≈ 8 s); it is dropped on apply/discard. The reduced dictionary (`RegistroCourse`, ≈ 83 rows) stays; the latest applied run is the code dictionary for Phase B.
- **Blocking decisions on the real file: 16** — the 5 bound-but-absent codes (`IELE2150 IELE3118 IELE3218 IELE3502 MATE1201`) plus 11 department-referenced stale codes (`FISI1028 IELE1006 IELE1010 IELE2210 LENG1103 LENG1501 LENG1512 LENG2999 LITE1611 LITE1622 MATE1257`). The first draft made every missing reference blocking (47 on the real file) which buried the useful ones.
- **Undo stores exact row state, not the snapshot.** `CatalogSnapshot.payload` is the *student view* (`buildCatalogPayload`), in which live API prereqs win over the stored document text, so it cannot restore a raw `prereqText`. Apply therefore records per-row before/after in `RegistroImport.applyResult.undo`; `undoImport` restores them all-or-nothing, refuses (listing the rows) if any touched row was edited since, and restores SQL `NULL` vs JSON `null` faithfully. A `pre-registro` snapshot is still written per changed catalog for the audit trail.
- **Rebind** binds the slot to the other registro code and updates `displayCode`; it does not re-pair offerings — the slot shows "Sin verificar" until the next sync.
- **Replace that duplicates an alternative** (`FISI 1028 O FISI 1528`, 1028→1528) collapses to one; a hard requirement is never weakened to soft by the merge.
- **Names and credits are only written when the admin picks "usar el valor del registro"** per code; the default keeps the plan's values.

### What the student sees (important for Phase B)

`buildCatalogPayload` prefers the live course-API prerequisites when a course was offered this term and only falls back to `CatalogCourse.prereqText/prereqTree` otherwise. **This precedence is the intended behaviour** (confirmed by the coordinator): *prefer the API, only fall back to the document*. The wizard writes the *fallback*, so its changes are visible to students only for courses with no usable API data (≈ 15 %). Applying registro data to the seeded catalogs is a no-op today (the seed was built from the same file).

Because that is easy to forget, the wizard and the rest of the admin now **alert on every difference between the document and the official API data** — see [`admin-discrepancies.md`](admin-discrepancies.md): the Vincular/Aplicar steps mark each planned change as *students will see it / agrees with the API / differs from the API and students won't see it*, and the Resolver step warns when the official API still lists a code the registro lacks (`FISI1028` — a code with no row in the 3-term window is **not** necessarily retired, so "keep" is the safe default; the first draft's help text wrongly suggested such codes were retired).

Phase B does **not** change this precedence (confirmed: prefer the API, only fall back to the document). Admin-authored edges are document data, so they reach students only for courses with no usable API data; the Phase B canvas must therefore show the official API requirement as a read-only layer and raise the same discrepancy alerts.

### Verification performed (2026-10-03/04)

All destructive runs used a scratch database (`pensum_regtest`, copied inside the container with `mysqldump`/`mysql`; dropped afterwards). The real database was never written to.

- **Unit (75 tests, all pass):** parser (footer row, ragged rows, header matching, garbage input, no valid rows), term window (future term without department rows, overrides, legacy department), newest-wins under reordering, scope/levels/ACTIVO, closure, analyzer (each item kind, severity rules), link planning (tree-not-whitespace comparison, locks, `manuallyEdited`, overrides, rebind), tree rewrite/dedupe/render round-trips, and 9 golden tests on the real `Excel_Registro.xlsx`. A mutation check (reduce → "last row wins") is caught by 5 tests.
- **Service integration (36 checks):** apply refused while decisions pending; invalid resolutions rejected; stale/locked/hand-edited rows handled; replace/drop/rebind written and pinned; snapshots; audit attribution; re-apply refused; undo refused on conflict with nothing changed; undo restores the whole `CatalogCourse` table **byte-for-byte** (raw-SQL comparison) and student payloads are identical.
- **Browser E2E (35 checks, Edge via puppeteer-core, outside the repo):** auth redirect, real-file upload, window and rescope, resolve, save/dirty state, server-side validation error surfaced, link diff, catalog selection, apply, undo through the UI; only the deliberately provoked 4xx responses occur. After the full journey the scratch `CatalogCourse` table had **0 differing rows** versus the real database.

### Bugs the verification caught (kept here so they aren't reintroduced)

1. Every missing reference blocked apply (47) → severity now depends on whether a core course references it.
2. Undo compared JSON with a plain `JSON.stringify`; MySQL re-orders JSON keys → every row looked edited. Now key-order-independent.
3. Undo restored SQL `NULL` as JSON `null` (invisible to the app, visible to a raw diff) → now restored exactly.
4. The "all decisions taken" banner was computed from the unsaved draft → it now follows saved state and warns about unsaved changes.
5. A replace could leave `(FISI 1528 O FISI 1528)` → de-duplicated.
6. A header-only workbook parsed "successfully" with zero rows → now a clear error.
7. Windows gotcha: editing UTF-8 files with PowerShell `Get-Content`/`Set-Content` double-encodes accents (it garbled a component and the test script). Use the editor tools; piping a `mysqldump` through PowerShell corrupts accents too — copy databases inside the container.

### Known limits / not done

- No registro search endpoint: the whole ≈ 83-entry dictionary ships to the browser and is filtered client-side (fine at this size).
- Only one open run is encouraged; concurrent runs are allowed but each apply re-plans against the live DB.
- The wizard does not re-sync offerings after a rebind.
- No favicon (pre-existing 404).