# Admin · Visual pensum editor (Phase B)

Route: **`/administrador/catalogos/[slug]/mapa`** (button "Mapa" in the catalog list, link in the classic editor).
Plan, rationale and decisions: [`admin-visual-editor-plan.md`](admin-visual-editor-plan.md).

A separate admin canvas on the same grid as the student explorer. The student explorer
(`PensumExplorer`, `MapCanvas`, `CourseCard`) and `lib/catalogPayload.ts` are **not modified** (verified by `git status`;
the grid constants are compared to the student file's source by a test).

## Workspace (full screen)

The builder covers the whole window (it hides the admin sidebar; **← Catálogos** leaves, asking first if there are unsaved changes).

- **Top bar:** plan name, link to the classic editor, pending-changes pill, **↶ Deshacer**, **Descartar**, **Guardar (n)**.
- **Tool row:** *Conectar como* Prerrequisito / Correquisito, **Conectar por clic**, **Alternativas (O)**, **Separar**, **Eliminar**, "Todas las aristas", "Capa oficial (API)" and the `⚠ N` discrepancy count. Disabled tools explain why in their tooltip.
- **Canvas:** the grid, fitted to the screen and pinned to the top on load / resize / `F` (zoom buttons at the bottom left). With a course selected the rest dim; its edges stay visible.
- **Inspector (right, collapsible with ›):** the selected course — placement, prerequisite and corequisite list editors, what it gates, discrepancy alerts. With nothing selected it shows a short "start here" guide.
- **Bottom bar:** legend, **problems** popover (new errors/warnings), **history** popover (per-batch undo), **?** keyboard shortcuts.
- **Toasts** replace the old status line; errors stay until dismissed or the next action, others fade after 7 s.
- "Pending" counts only the courses you touched or whose fields changed — rows whose `sortIndex` merely shifted to make room are not counted.

## What an admin can do

| Action | How |
|---|---|
| Select a course | Click / Enter. Its edges appear (checkbox "Todas las aristas" shows every edge). |
| Move a course | Drag the card (a blue dashed slot shows where it lands), or use the semester box / ↑ ↓ in the side panel, or **Alt + arrows** on the selected card. A new empty semester column sits at the right. |
| Create a requirement | Drag from a card's **right dot** to another card's **left dot**; or "Conectar por clic" (requirement first, then the course that needs it); or type a code in the side panel (autocomplete from the plan + Registro dictionary). The toolbar toggle picks **Prerrequisito** or **Correquisito**. |
| OR group | Every edge has a **circle** at its midpoint (`Y` and, `O` or, `C` coreq, `≡` compound). Pick two or more circles of the same course (Shift/Ctrl for several) → **Alternativas (O)**. **Separar** reverses it. |
| Remove | Pick circle(s) → **Eliminar** (or Del), or ✕ in the list. |
| Compound expressions (an AND inside an OR, ≈ 17 % of expressions) | Shown as `≡` circles; edited in the side-panel list or with **Editar como texto**. |
| Review before saving | Pending cards are dashed; "Problemas" lists new errors/warnings; **Guardar** is disabled while there are new errors. |
| Undo | **↶ Deshacer** (before saving, step by step), **Descartar**, and per saved batch "Deshacer" in the history popover (exact restore). |

Two edge layers: **document** edges (solid, editable) and **official API** edges (dotted grey, read-only, toggle "Capa oficial").
Where both agree the edge is drawn once.

## What students will see (unchanged precedence)

Students get the API requirement whenever the API has data for the course; the document is only the fallback. The side panel
says which applies to the selected course (*"Los estudiantes verán el requisito oficial (API); lo que edites aquí es un
respaldo"* / *"No hay datos oficiales para este curso: los estudiantes verán tu cambio"*) and shows the usual
discrepancy alert, recomputed live from the pending edit. Cards carry `API` / `Doc` and `⚠` badges; the toolbar `⚠ N`
uses the same counting rule as the catalog list and the Discrepancias page (verified equal).

## Rules

- **Rejected** (never written): prerequisite cycle, a course requiring itself, semester < 1, `sortIndex` collision,
  invalid code format. Only *new* problems block; imperfect existing data does not stop unrelated edits.
- **Needs confirmation:** a code that is not a plan course, not in the Registro dictionary, not an exam token (`ENGL7`),
  and not a lab/practice companion of a known course (`FISI1518P`). The API replies 409 with the code list; the UI asks, then resends with `allowUnknown`.
- **Warned:** a prerequisite placed in a later semester than its dependent.
- **Dictionary** = latest applied Registro run (`RegistroCourse`). No age-based warning (decision 4): it is considered
  current while its newest period ≥ the plan's term; otherwise a banner says so.
- **Pins, not the whole-row flag:** a batch pins only the fields it changed (`suggestedSemester`, `prereqText`, `coreqText`)
  in `lockedFields`. It never sets `manuallyEdited`, so the Registro wizard and imports keep working on the row.
- **One plan per edit** (decision 3): there is no "apply to other plans".
- Stored requirement text the parser cannot read (e.g. `MUS070.0`) is **shown as an error banner**, not silently displayed as empty.

## Write path (B1)

`POST /api/admin/catalogs/[slug]/map/apply` takes a `MapBatch` (`lib/mapEditor/ops.ts`): ops `move` and `setRequirement`,
the **row versions** (hash of every editable column) and an `orderVersion` (needed for moves) the canvas loaded.

1. Version check → `409` with a readable "el plan cambió" if any touched row (or the layout) changed; nothing written.
2. The same pure planner the browser uses computes the end state; the end state is validated.
3. A `pre-map` `CatalogSnapshot` (student view, for audit), then **one transaction** (READ COMMITTED): the plan is locked by writing its `Catalog` row,
   versions re-checked, two-phase `sortIndex` write (park on unique negatives, then final), text **and** tree written together
   from the model, `lockedFields` pinned.
4. A `MapEdit` row stores the exact per-row before/after (incl. SQL `NULL` vs JSON `null`); `AuditLog` `map.apply` names the logged-in user.

`POST /api/admin/map-edits/[id]/undo` restores every row exactly, all-or-nothing; refuses (409, conflicting ids) if a row was
edited since, unless `force`. Move semantics: `position` is the row among the target semester's other courses; the batch keeps
the *set* of `sortIndex` values and only reorders, so unrelated rows do not change.
`GET /api/admin/catalogs/[slug]/map` returns rows + versions + dictionary + history.

## Code map

| Path | What |
|---|---|
| `web/lib/mapEditor/model.ts` | tree ⇄ groups/alternatives, add/remove/group/ungroup/soft, text + tree rendering, `canonical` |
| `web/lib/mapEditor/validate.ts` | cycles, self-reference, semester, collisions, unknown codes (`isKnownCode`) |
| `web/lib/mapEditor/plan.ts` | pure batch planner (`planBatch`), shared by client preview and server |
| `web/lib/mapEditor/version.ts` | row/order version hashes (server only) |
| `web/lib/mapEditor/geometry.ts`, `edges.ts` | grid layout / slot snapping; edge derivation + API layer merge |
| `web/lib/mapEditor/service.ts`, `http.ts` | `applyMapBatch`, `undoMapEdit`, `loadMapView`, dictionary |
| `web/app/api/admin/catalogs/[slug]/map/**`, `map-edits/[id]/undo` | routes |
| `web/components/admin/map/` | `MapEditor` (state/ops + full-screen layout), `MapNodes` (cards, bands, circles), `MapSidePanel` (inspector / list editor), `map.module.css` |
| `web/prisma/migrations/20261004163217_add_map_edit` | `MapEdit` table (additive) |

## How it was verified (2026-10-04)

- **Unit (in `npm run test`):** model, validation, planner, geometry/edges — 35 tests incl. a corpus test over all
  4 130 distinct expressions of `Excel_Registro.xlsx` and a parity test reading the student grid constants from source.
- **Service integration on a scratch DB** (copied inside the container; refuses to run unless the DB name contains `test`):
  `DATABASE_URL=mysql://root:pensum@127.0.0.1:3306/pensum_maptest node --import tsx --test lib/mapEditor/__tests__/service.integration.test.ts`
  — 10 checks: apply→undo leaves the whole table **byte-identical** (raw SQL, incl. NULL vs JSON null), stale version, cycles,
  rollback on a failing op, unknown-code confirmation, undo refusal/force, no-op refusal, and **all 5 plans / 252 rows /
  228 requirements round-trip as no-ops (20 deep expressions)**. Mutation checks (breaking SQL-NULL restore, `ungroup`) fail the suites.
- **Browser E2E (Edge + puppeteer-core, outside the repo) on a scratch DB:** `web/scripts/e2e-map/e2e.mjs` (50 checks: card positions equal
  the student formula with delta 0, selection/edges, list editing, circles + OR grouping, drag-connect and click-connect, cycle/self refusal,
  compound text, drag move, save, DB pins, `manuallyEdited` untouched, snapshot + audit actor, student payload differs only for edited rows,
  undo through the UI → table identical, unknown-code confirm, API/Doc statements, `⚠` count = catalog-list badge, Alt+arrows, unparsed banner)
  and `plans.mjs` (all 5 plans render, deep expressions shown as compound, every control has an accessible name, keyboard selection, empty state, no console errors).
- `npm run build` passes. The real database was never written during testing.
- **Also verified on Postgres (the Vercel/Neon line, 2026-10-04):** a throwaway `postgres:16-alpine` was loaded with `main`'s existing migration + seed,
  the new additive migration was applied on top (existing tables byte-identical by row count + content hash, `migrate status` up to date, `migrate diff` reports
  no drift), then the same 11 integration checks (incl. the concurrency test and SQL-NULL vs JSON-null), 50 + 15 browser checks and `next build` all pass; the
  Registro import (83-entry dictionary, `bytea` upload) runs there too. The integration test and `e2e.mjs` are dialect-aware (`E2E_PG=1`).

## Bugs found by the verification (fixed)

- **Concurrency (found while preparing the Postgres preview):** two simultaneous batches built from the same version both succeeded. Under MySQL's default
  REPEATABLE READ, Prisma's `update` reads before it writes, which fixed the transaction snapshot *before* the lock wait, so the post-lock version re-check
  could not see the winner's commit. Transactions now run at READ COMMITTED (Postgres' default) and undo got the same lock + in-transaction re-check.
  Covered by `service.integration.test.ts` ("two concurrent batches…": exactly one wins, the loser gets 409).
- **Portability:** the first version used MySQL-only raw SQL (unquoted camelCase identifiers, `FOR UPDATE`) — it would have failed on the Postgres/Neon
  preview. SQL-NULL detection now uses Prisma's `DbNull` filter and the lock is a Prisma write; there is no raw SQL left in app code (see
  [`branches-and-releases.md`](branches-and-releases.md)).

- Click-connect used a stale requirement kind (callback closure) → created a prerequisite instead of a coreq. Now goes through a ref.
- In connect mode React Flow set `pointer-events:none` on non-draggable cards (the same quirk as the student canvas, 2026-09-24) → a no-op `onNodeClick`.
- Save warnings listed every pre-existing unknown code as new (the "before" validation ran without the dictionary).
- Exam tokens (`ENGL7`) and lab companions (`FISI1518P`) were reported as unknown codes.
- A stale error message stayed in the status line after discard/undo; duplicate React keys in the "Habilita" list.
- The student payload carries `generatedAt`, so payload comparisons must ignore it (and must bypass the browser cache, which had made the first invariance check vacuous).

## Known limits

- Edges are shown for the selected course by default (the full grid is a hairball); "Todas las aristas" shows everything.
- The canvas edits requirements by course code; placeholders (electives, CBU slots) have no editable requirements here — use the classic editor.
- No cross-plan propagation, by decision. Two admins editing at once get a conflict instead of a merge.
- Mobile/touch editing is out of scope.

## UI pass (2026-10-04, after first review)

Screenshot review found: the first fit ran on an empty canvas (grid off-centre, semester 1 cut off), the admin sidebar and page heading ate space,
tools wrapped over two rows and the side panel was cramped. Fixed by the full-screen layout above; `fitView` now runs once real nodes exist, on
resize and when the inspector toggles, and pins the grid to the top. The tool row sits *above* the canvas (an overlay would cover the first row of
cards), and a minimap was tried and removed (the whole plan already fits). Regression: the same 50 + 15 browser checks pass on the new layout.
