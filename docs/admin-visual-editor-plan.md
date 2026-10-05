# Admin · Visual pensum editor (Phase B) — plan

Status: **B0–B6 done and verified (2026-10-04)** — user-facing description and code map in [`admin-visual-editor.md`](admin-visual-editor.md). The four decisions in [§9](#9-open-decisions) are settled;
the rest reflects what you asked for and what the code and data showed.

**Decisions (2026-10-04):** (1) canvas edits pin only the changed fields, not the whole row;
(2) corequisites are editable both graphically and in the list editor; (3) **no cross-plan actions** — edits
apply to one plan, step by step; (4) no age-based staleness warning — the Registro dictionary is considered
current as long as its run covers the current term (courses don't change mid-semester).
Phase A (Registro wizard) and the discrepancy alerts are done and documented in
[`admin-registro-wizard.md`](admin-registro-wizard.md) and [`admin-discrepancies.md`](admin-discrepancies.md).

Hard rule from the start: **a separate admin canvas. The student explorer (`PensumExplorer`,
`MapCanvas`, `CourseCard`) and `lib/catalogPayload.ts` are not modified.** Importing pure helpers
(e.g. `lib/availability.ts`) read-only is fine; changing them is not.

---

## 1. Why visual editing

### 1.1 What was asked for

In your words (2026-10-03):

> *"What if we give them a similar exploration page to that of the students, but they can drag
> subjects, click to establish prerequisites (or add codes in accordance with the Excel_Registro)."*
> *"Select two edges with a 'circle' on each so it's obvious what it's connecting. Also allow for list
> editing in case a subject is complicated so that the visualization remains clean."*
> The intended whole flow: *"a multi-step wizard: drop the excel, solve unresolved names (no
> correspondence on the API, placeholder codes, overrides…) and then link what needs linking to the
> current pensum and drag subjects and their edges for prereq / coreq."*

So the editor is the **last step of a pipeline**: Registro import (done) → resolve mismatches (done)
→ *shape the pensum visually* (this plan).

### 1.2 What is wrong with form-based editing today

Today an admin edits a plan through tabbed forms (`CatalogEditor` → `CourseTable` → `CourseRow`).
Grounded in the code and the data:

1. **Requirements are free text.** The field is a textarea labelled *Prerrequisito (respaldo)*,
   parsed on save. A typo, a wrong operator or an unknown code is not visible until a student hits it.
   The real data shows how easily non-course tokens slip in (`MATE 1105C*`, `ENGL7`, `RLEC1`).
2. **You cannot see consequences.** A form cannot show that a course gates five others, that a chain
   is six semesters deep, or that an edit creates a cycle. The student explorer can (upstream /
   downstream highlighting) — the admin cannot.
3. **Placement is indirect.** Semester is a number box; order inside a semester is up/down swap
   buttons. Structural mistakes are easy to make and hard to spot. A real example from the project
   history: `IELE3106` sat in the semester-6 slot where `IELE3200` belonged (finding B-2, 2026-09-24).
   It was only noticed by looking at the student view.
4. **Corequisites cannot be edited at all.** The course route (`PATCH …/courses/[id]`) has no
   `coreqText` field; corequisites only ever come from imports.
5. **Any edit silently flags the whole row** (`manuallyEdited = true`), which later makes the Registro
   wizard skip the entire course.
6. **No feedback loop with official data.** Before the discrepancy alerts, an edit that students would
   never see (because the API governs ≈ 85 % of courses) gave no sign at all.

### 1.3 What a visual editor changes

- **What you edit is what students see** (with the API caveat below): same grid, same cards, same
  edges, so coordinators judge a change the way students experience it.
- **Structure becomes editable directly:** drag a course to another semester; connect two courses to
  create a requirement; group alternatives with a visible marker.
- **Mistakes become visible immediately:** cycles, unknown codes, orphaned chains, duplicates — before
  saving, not after.
- **Consequences are visible:** select a course and see what it gates and what gates it.
- **Official data is visible next to the edit:** the API requirement is shown as a read-only layer, with
  the same discrepancy alerts, so an admin knows at the moment of editing whether students will see it.
- **Complex cases stay manageable:** the list editor handles deep expressions so the drawing stays clean.

### 1.4 What it does **not** change

**Precedence stays exactly as it is** (confirmed): students see the official API requirement whenever
the API has data for the course; the document is only a fallback. Canvas edits are document edits, so
they reach students **only for courses with no usable API data** (≈ 15 % today). The editor must never
imply otherwise — see B5.

### 1.5 Success criteria

1. An admin can restructure a plan (move courses between semesters, reorder, add/remove/regroup
   prerequisites and corequisites) without typing requirement expressions.
2. Nothing is written that creates a cycle or references an unknown code without an explicit override.
3. Every save is atomic, audited and **exactly undoable** (same standard as the Registro wizard).
4. The canvas never misleads about what students will see.
5. The student view is byte-for-byte unaffected by anything except the data the admin deliberately changed.

---

## 2. Ground truth (measured / read from the code, 2026-10-04)

| Fact | Consequence |
|---|---|
| The student canvas places a card by `course.semester` (column) and its **index in the payload order, i.e. `sortIndex`** (row). Geometry: `COL_PITCH 168`, `ROW_PITCH 70`, `CARD 148×60`, `BAND_HEADER 52`, `INSET_X 20`, `INSET_TOP 16`. | A drag can only reach students through `suggestedSemester` and `sortIndex`; the admin canvas can reproduce the same geometry independently. |
| `CatalogCourse` has `@@unique([catalogId, sortIndex])`. The reorder route swaps two rows through a temporary `-1`. | Multi-row moves need an ordered, transactional reindex, not pairwise swaps. |
| `CatalogCourse.prereqTree / coreqTree` are `ReqNode` JSON (`AND` / `OR` / `COURSE{code,soft}`), with the Spanish text in `prereqText / coreqText`. | The model to edit already exists; both the text and the tree must be rewritten together. |
| Expression census over the 5 plans (documents): prereq — 70 **AND-of-OR-groups**, 10 AND-of-leaves, 15 OR-of-leaves, 19 single, 40 none, **20 deeper ("complex")**; coreq — 94 single, 80 none. API: biggest prerequisite has **22 leaves**. | A drawing with edge-grouping covers the common shape; the list editor is **necessary** for the ≈ 15 % deeper ones (`MATE1207`, `FISI1518/1528`, `IIND2401`). |
| Plans: 49 courses (8 semesters) ×4, 56 (9 semesters) ×1. | Small enough to render all edges; no virtualization needed. |
| `reactflow` 11.11.4, Next 15, React 19. | Same library the student canvas uses; a separate component tree. |
| The Registro dictionary (`RegistroCourse`, latest applied run) holds code, name, credits, period, prereq/coreq for ≈ 83 codes. | Autocomplete / validation source; **limited to the department + referenced codes**, so unknown ≠ invalid. |
| Precedence: API tree → "none" if the API synced with no requirement → document. | Canvas edits matter only where the document governs; the discrepancy module already computes this. |

---

## 3. Principles

1. **Separate component.** No edits to the student explorer or payload builder.
2. **Edit the document, show the official.** Two edge layers, clearly distinguished.
3. **One atomic, auditable, undoable write path.** Reuse the Registro wizard's pattern: exact before/after rows, all-or-nothing undo, refuse on conflicts.
4. **Reject, don't warn, for things that break the student view** (cycles, self-reference). Warn for things that may be legitimate (unknown code, API discrepancy).
5. **Pin what was decided, flag only what was edited.** Canvas edits record which *fields* were deliberately changed (`lockedFields`) rather than marking the whole row.
6. **Same wording everywhere.** Reuse `DiscrepancyAlert` / `headlineFor`.
7. **Pure logic first, UI last.** The requirement model is unit-tested before any drawing exists.

---

## 4. Design

### 4.1 The canvas (route `/administrador/catalogos/[slug]/mapa`)

- Same grid as the student view (semester bands, cards), rendered by **new** components.
- Card: code, name, credits, type; badges for *document-governed* vs *API-governed*, and a warning
  marker when the document differs from the API.
- **Two edge layers:** document edges (solid, editable) and official-API edges (dashed, read-only,
  toggleable). Where they agree the edge is drawn once.
- Side panel for the selected course: requirements (as a readable list), what it gates, discrepancy
  alert, lock toggles, link to the classic form editor.
- Selecting a course highlights upstream/downstream like the student view (reusing the pure helpers in
  `lib/availability.ts` read-only).

### 4.2 Interactions

| Action | Behaviour |
|---|---|
| **Move a course** | Drag to another semester column or a new row; snaps to the grid; shows the drop target. Writes `suggestedSemester` + `sortIndex`. Moving a course *before* its prerequisite's semester is allowed but flagged. |
| **Create a requirement** | Drag from a course's handle to another (prerequisite → dependent), or click source then target. Creates an AND-ed requirement by default. Hold a modifier / toggle for *corequisite*. |
| **Group alternatives (OR)** | Every edge shows a **circle** at its midpoint. Select two or more circles → *"Alternativas (O)"* merges them into one OR group; the group is drawn with a shared marker and label. *Ungroup* reverses it. The circle makes it obvious which connection you are selecting. |
| **Add by code** | A field with autocomplete against the Registro dictionary (code or name). A code outside the dictionary needs explicit confirmation ("not in the Registro window — add anyway?"). |
| **Remove** | Select an edge/circle → delete; or ✕ in the list. |
| **List editor** | A structured list (groups → alternatives) beside the drawing for the selected course. Deep expressions (the ≈ 15 %) are edited here; the canvas shows them collapsed as one grouped edge bundle with a "ver en lista" affordance. |
| **Undo / history** | Per-batch undo in the session; and a persisted, exact undo like the wizard's. |

### 4.3 Alerts in context (B5)

For the selected course and on each node: the discrepancy status (`differs`, `doc-hidden`, `unverified`…)
and a plain statement — *"Students will see the official requirement (API); your change here is a
backup"* or *"No official data: students will see your change."* Same component and wording as today.

### 4.4 Write model

- **One batch endpoint** (e.g. `POST /api/admin/catalogs/[slug]/map/apply`) taking a list of operations
  (`move`, `setRequirement`, `setSemesterOrder`…). It validates everything first, then writes in one
  transaction: rows, `prereqText`/`prereqTree`, `coreqText`/`coreqTree`, `lockedFields` for the fields
  actually changed.
- Records per-row before/after (and SQL `NULL` vs JSON `null`, as fixed in Phase A) so **undo** restores
  exactly, refusing if rows changed since.
- A `pre-map` snapshot per batch for audit; audit entries attributed to the logged-in user.
- Validation (shared pure module, used by client and server): no cycles, no self-reference, codes
  normalised, semester ≥ 1, `sortIndex` reindexed without collisions.
- **Optimistic concurrency:** the batch carries the row versions it was built from; if a row changed, the
  server refuses with a readable conflict instead of overwriting.
- Text and tree are generated together from the model, so they cannot diverge (rendering reuses
  `lib/registro/requirements.ts`).

---

## 5. Phases

Each phase ends with its own tests and a short section added to this document.

| Phase | Delivers | Exit criteria |
|---|---|---|
| **B0 — requirement model (pure)** | `lib/mapEditor/model`: tree ⇄ editable structure (groups/alternatives), add/remove/group/ungroup, text+tree rendering, cycle & reference validation, batch-operation types. | Round-trips every real expression in the 5 plans and the API exactly; exhaustive unit tests; cycle/self-reference/unknown-code cases. |
| **B1 — safe writes** | Batch endpoint, versions/conflicts, lock policy, exact undo, audit, `pre-map` snapshot. Fixes the "coreq not editable" gap. | Service tests on a scratch DB: apply→undo leaves the table **byte-identical** (raw-SQL compare); conflict refusal; cycles rejected; nothing written on any failure. |
| **B2 — read-only admin canvas** | Grid, cards, both edge layers, side panel, selection highlighting, discrepancy chips. | Visual parity with the student grid (positions compared numerically); all 5 plans render; no student-view change. |
| **B3 — move** | Drag between/within semesters with snapping, batch save, undo. | Browser tests incl. undo; student payload identical except the moved rows. |
| **B4 — requirement editing** | Connect, circles + OR grouping, add-by-code with dictionary autocomplete, list editor, coreq support. | Browser tests per interaction; every edit visible in the side list and persisted correctly; deep cases editable via the list. |
| **B5 — alerts in context** | "Students will / won't see this" at edit time; live discrepancy on nodes/edges. | Parity with the Discrepancias page counts. |
| **B6 — hardening** | Real-data pass on all plans incl. the ≈ 20 deep expressions; keyboard access; empty/error states; docs. | Full E2E on a scratch copy; accessibility pass on the interactions. |

Suggested order of value: B0→B1 (foundation), B2 (useful alone), B3, B4, B5, B6.

---

## 6. Testing strategy

- **Pure unit tests** for B0 (incl. a corpus test: every real `prereqTree`/`coreqTree`/API tree round-trips).
- **Service integration on a scratch database** (copied *inside the container*; never pipe dumps through
  PowerShell — accents corrupt) for B1.
- **Browser E2E** (Edge via `puppeteer-core`, installed outside tracked files) for B2–B6.
- **Mutation checks, run sequentially** (edit → run → restore → run); plant edge cases because the real
  data does not exercise rare branches (lesson from the discrepancy work).
- **Student-view invariance:** compare `buildCatalogPayload` output before/after for untouched rows.
- Never write to the real database during testing.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Admins believe an edit reached students when the API governs it | B5 alerts at edit time; the two-layer edge display; reuse of the discrepancy wording |
| Deep expressions make the drawing unreadable | Collapsed group bundles + the list editor; measured ≈ 15 % |
| `sortIndex` uniqueness collisions on reorder | Server-side ordered reindex in one transaction; tested with collisions |
| Concurrent edits (two admins) | Versioned batches; conflict refusal; audit trail |
| Drift between the canvas's notion of "visible" and the real payload | Reuse the discrepancy mirror (already locked to `buildCatalogPayload` by an equivalence test) |
| Dictionary covers only ≈ 83 codes | Unknown code = confirm-to-add, never silently rejected or accepted |
| Scope creep into the student app | Hard rule: no edits there; CI-style check that those files are unchanged |
| Large interaction surface | Phased delivery; every phase independently valuable and tested |

---

## 8. Non-goals

- Changing the API-first precedence.
- Fixing the two known student-payload inconsistencies (basket `coreqText`, prereq text with an empty
  tree) — reported in [`admin-discrepancies.md`](admin-discrepancies.md), separate decision.
- Editing placeholders' pools, electives or graduation rules on the canvas (existing editors remain).
- A new re-sync of API data (the P2.4 queue is still not built).
- Mobile/touch editing.

---

## 9. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | **Edit flag.** Should a canvas edit mark the whole course `manuallyEdited` (today's behaviour, which makes the Registro wizard skip the row entirely) or pin only the fields actually changed? | Pin only the changed fields (as the wizard does). Avoids making the course untouchable for future imports. |
| 2 | **Corequisites.** Draw and edit corequisites on the canvas, or list-only? | Draw them (distinct style) — the data is simple (94 single, 80 none) and currently cannot be edited anywhere. |
| 3 | **Cross-plan edits.** Apply an edit to one plan only, or offer "apply to the other plans containing this course"? | One plan by default, with an explicit, previewed "apply to N other plans" action (five plans share most courses). |
| 4 | **Dictionary.** Treat the latest applied Registro run as the code dictionary, with a staleness warning after N days? | Yes; warn after ~90 days; unknown code = confirm-to-add. |

---

### Decision log

| # | Decision |
|---|---|
| 1 | Pin only changed fields (`lockedFields`); do not set `manuallyEdited`. |
| 2 | Draw **and** list-edit corequisites (distinct style on the canvas). |
| 3 | No "apply to other plans". One plan per edit. (Removes that action from B4/B1 scope.) |
| 4 | No N-day staleness warning. Dictionary = latest applied Registro run; stale only if it does not cover the current term. Unknown code = confirm-to-add. |

## 9b. Phase results

### B0 — requirement model (done 2026-10-04)

Code: `web/lib/mapEditor/` — `model.ts` (tree ⇄ groups/alternatives, add/remove/group/ungroup/soft,
text+tree rendering via `lib/registro/requirements`), `validate.ts` (cycles, self-reference, semester,
`sortIndex` collisions, unknown code, prereq-after-dependent), `ops.ts` (batch types for B1).
Tests: `lib/mapEditor/__tests__/` (19, in `npm run test`).

- **Model:** a requirement = AND of groups, each group an OR of alternatives. An alternative that is itself an
  AND (e.g. `(A Y B) O C`) is a `complex` alternative, kept verbatim and edited as a unit, so every tree
  round-trips losslessly.
- **Corpus:** all 4 130 distinct prereq/coreq expressions in `Excel_Registro.xlsx` round-trip (tree, rendered
  text re-parsed, idempotent). **702 (17 %) are complex** — matches the plan's "list editor is necessary" estimate.
- **Finding:** 2 real texts are unparseable by `parseRequirement` (`MUS070.0`, `MUS060.0`) and yield `null`.
  The editor would show them as empty — B1/B2 must surface unparseable text instead of silently dropping it.
- **Rules chosen:** prerequisite cycles and self-reference are errors; coreq cycles are allowed (mutual coreqs
  are legitimate), coreq self-reference is an error; unknown codes and a prerequisite in a later semester are
  warnings.
- **Mutation check:** breaking `ungroup` fails the suite; restored.

### B1 — safe writes (done)

`lib/mapEditor/service.ts`, `plan.ts`, `version.ts`; routes `…/map`, `…/map/apply`, `map-edits/[id]/undo`; migration `add_map_edit`.
Row versions are a hash of the editable columns (no `updatedAt` column exists); moves also carry an `orderVersion`. `sortIndex` is rewritten
in two phases (the unique key) and a move keeps the *set* of values, so only the rows whose position changed are touched.
Fixes the "coreq not editable" gap (`setRequirement` with `kind:"coreq"`). Verified on a scratch DB: apply→undo is byte-identical
(raw SQL), stale versions → 409, cycles/self-reference rejected, failures write nothing, undo refuses after later edits.

### B2 — read-only canvas (done)
Grid, cards, both edge layers, side panel, selection edges, discrepancy chips. Card positions equal the student formula with delta 0 on all rows
(and the constants are tied to the student file by a test); all 5 plans render.

### B3 — move (done)
Drag with a drop-slot preview, semester/row controls, Alt+arrows, batch save, local and persisted undo. After a real save the student payload
differs only for the edited rows; after undo it is identical again.

### B4 — requirement editing (done)
Connect (handles or click), circles, OR grouping/ungrouping, delete, add by code with autocomplete, list editor, text editor for compound
expressions, coreqs drawn and list-edited. Deep expressions: 20 across the 5 plans (exactly the plan's estimate), editable through the list/text.

### B5 — alerts in context (done)
"Students will / won't see this" per field, live discrepancy alert recomputed from the pending edit, `API`/`Doc`/`⚠` card badges; the toolbar
`⚠ N` equals the catalog-list badge (10 on the local `iele-cbu3`).

### B6 — hardening (done)
Real-data pass over all 5 plans / 252 rows / 228 requirements (all round-trip as no-ops), keyboard access (cards are focusable buttons,
Alt+arrows, Del, Esc, a full list editor that needs no pointer), accessible names on every control, empty/error states, unparseable stored text
surfaced as a banner, docs. Bugs found are listed in `admin-visual-editor.md`.

## 10. Documentation to produce with the work

- This document, updated per phase (what was built, decisions, measured results, bugs found).
- `docs/admin-visual-editor.md` (user-facing behaviour + code map) once B2 lands.
- `PROGRESS.md` / `CLAUDE.md` / `docs/README.md` entries per phase, plus a line in the branch log.
