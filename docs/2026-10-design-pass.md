# Design pass — October 2026 (engineering log)

What changed in the explorer between the 2026-09-24 review and the MySQL
release candidate: what, where, why, and how to verify. Product/UX rationale
lives in [`user-flows.md`](user-flows.md); branch and release mechanics in
[`branches-and-releases.md`](branches-and-releases.md); CSS/design tokens in
[`web/components/explorer/DESIGN.md`](../web/components/explorer/DESIGN.md).

Commit trail (all on top of the MySQL checkpoint `7baeb53`):

| Commit | Summary |
|---|---|
| `7baeb53` | Checkpoint: hover-flicker fix, date+API term logic, explorer WIP, DESIGN.md |
| `47087e2` | Design pass 1: tokens, contrast, card redesign, quiet Mi avance |
| `67c79b7` | Basket checkout modal (sections, teachers, weekly preview, descriptions) |
| `f435b36` | Unlock view: off by default, two named levels |
| `4c3e431` | Basket "Qué sigue" step, full-width week, selection card with relation checkboxes |
| `fe72e15` | Welcome modal for Mi avance, no default semester, line legend + chip swatches |
| `66f1030` | Remove the "Ver v1" link |
| `75b552c` | Delete the legacy explorer (`/v1`) and its dead duplicates |

---

## 1. Hover flicker (course map)

**Symptom.** Sweeping the mouse across the map flickered every card.
**Cause.** When the 70 ms hover debounce committed `hoveredId`, `MapCanvas`
rebuilt the `nodes` array (a new `data` object per card) and `handleHover` got a
new identity, so all ~60 cards re-rendered at the instant the hovered card got its
ring.
**Fix** (`MapCanvas.tsx`, `CourseCard.tsx`, `explorer.module.css`):
- the hover ring is pure CSS (`.card:not(.selected)…:hover`), no React state;
- `handleHover` is stable (reads hover/selection through refs);
- the nodes memo depends only on the *selection* (`sel*` sets collapse to shared
  empty constants when nothing is selected) — hover now drives only the preview
  edges and the tooltip.

Verify: sweep the cursor across the map; no card other than the hovered one
repaints.

## 2. Terms: Banner codes, date + live API

New pure module `web/lib/term.ts` (client-safe) and server resolver
`web/lib/termResolve.ts`.

- Codes are `YYYYPP`: `10` = Jan–May ("2026-1"), `19` = Jun–Jul intersemestral
  ("2026-Inter"), `20` = Aug–Dec ("2026-2"). Dates are read in Bogotá time.
  Unknown codes display raw and never anchor "next term" maths.
- `planTerm()` = next *regular* semester after today's calendar term (the
  intersemestral is skipped; planning looks one semester ahead). In Oct 2026 →
  `202710` ("2027-1").
- `resolveOfferingTerm()` (seed, electives route, sections route) picks, in order:
  an explicit `OFFERINGS_TERM` pin → the live API (a **blank-`term`** query to
  `/api/courses` returns the term currently offered; past/unpublished terms
  return 0 rows) → the calendar.
- `OFFERINGS_TERM` now defaults to `auto` in `.env.example`/`.env`. **Vercel's
  env still pins `202620`** until changed there.
- Saved plans (localStorage) for terms that have already started are dropped on
  load. Labels are unified through `termLabel`.

**Rollover runbook.** The planner follows the calendar by itself. "Se dicta este
periodo" and the prereqs come from the last seed, so each term run a normal
re-seed (`npm run seed`, ~60 s, non-destructive) to refresh offerings. No
automatic job exists yet.

## 3. Design tokens, contrast and the card

- One green (`--st-ok #15803d`) and one amber (`--st-warn #b45309`, 5.02:1 on
  white; the old `#d97706` was 3.19:1). New tokens: `--ring-gap`, `--card-r`,
  `--edge-prereq/--edge-coreq`, `--on-type`, solid `--on-type-2-*` (no opacity
  text), `--muted-2` darkened to 4.61:1 on the bands. All seven type fills pass
  white text (6.3–9.6:1, measured).
- Edge colours are SVG props, so `MapCanvas.tsx` reads the tokens at runtime
  (`useEdgeColors`).
- Card: padding budget 8/12/7/10 = 60 px, mono 10.5, two-line titles, an inline
  **type glyph** (circle, square, diamond, triangle, ring, half-circle, bar) as a
  second channel for course type, dashed inset on slot cards.
- Selected card: 5 px accent ring + shadow + lift (F-3). Relation rings are
  `.card.selected` etc. (specificity 0,2,0) so a status rule that sets
  `box-shadow` can never erase them.
- Mi avance is **quiet by default**: no ring on available/planned cards.
  Approved = green fill + check; in basket = term pill; blocked = hatching;
  admin rule = amber lock.
- `.stAvailable/.stPlanned` are intentionally empty hooks.

## 4. Basket checkout ("Tu canasta")

`components/explorer/BasketModal.tsx`, `lib/sections.ts`,
`app/api/sections/route.ts`.

- Opens from the lower-left basket button, the planner footer ("Revisar mi
  canasta"), and "Ver mi canasta y confirmar" on a course already in the basket
  (opens focused on it). Two steps: **Revisar** → **Qué sigue**.
- **`GET /api/sections?codes=A,B&term=YYYYPP`** — server-side proxy of the
  Uniandes `/api/courses` (no CORS; sits behind Cloudflare, `curl` gets 403 but
  Node `fetch` works). Returns normalised sections: NRC, section, instructors,
  seats, period, and meetings (`day` 0=Lun…6=Dom, minutes, room, building). Day
  columns are `l,m,i,j,v,s,d` (**`i` = miércoles**). Lookups are exact on
  `<class><course>` (drops labs such as `1002L`), cached 10 min in memory, max
  12 codes, code regex-validated.
- **Reference fallback.** The planner targets next semester, whose offering opens
  late (2027-1 returns 0 rows today). Empty → fall back to the current offering
  term, flagged `isReference` and labelled "referencia" everywhere.
- Step 1: full-width week (summary tiles, rich blocks, legend, exact clash list),
  collapsible NRC explainer, per-course description (clamped), requisite status,
  selectable sections (seat pills), "N alternativas sin cruce". Picks persist in
  `localStorage` under `pensum:<slug>:sections:<term>`.
- Step 2: copy NRCs → Mi Horario → MiBanner, pre-enrolment checklist, links to
  the official Registro guides (`registro.uniandes.edu.co`, MiBanner registration
  page as linked from that article).
- Descriptions come from `Course.description`. They were empty; the project's
  scraper (`npm run scrape:desc`) filled 35/42 **in the local MySQL only**.
  Neon has none until the admin panel's *Descripciones → Sincronizar faltantes*
  (or the CLI against Neon) is run.

## 5. Relations: what a course needs / unlocks / depends on

Selection card (`MapCanvas.tsx`, `UnlockViewControl.tsx`) replaces the dark pill:
three checkboxes with counts — **Qué necesito** (on), **Qué desbloquea**
(courses this one opens *by itself*), **Qué depende de él** (everything
downstream, partial unlocks in amber). The forward two are **off by default**;
state persists in `localStorage` key `pensum:rel-view`
(`{needs,unlocks,depends}`; the older single-choice key `pensum:unlock-view` is
migrated on read). The card docks 256 px in from each side so it never covers the
lower-left zoom/basket controls.

> Supersedes the 2026-09-24 decision D-5 (forward-chain highlighting always on)
> as the *default*; the behaviour is one click away.

## 6. First arrival at Mi avance

`AvanceWelcome.tsx`; `SetupSheet.tsx` (no default semester); `Toolbar.tsx`
(legend + swatches); `tours.ts`.

- First visit with nothing saved (also via `?modo=avance`) opens a welcome modal
  with a path per situation (starting out / finished some semesters / off the
  plan / just look) and a "cómo leer el mapa" key.
- **Bug removed:** the by-semester setup preselected II and silently marked all
  of semester I as approved. Now nothing is preselected or marked until a semester
  is chosen; choosing I means "start from zero".
- Mi avance toolbar gained the solid-blue prerequisite / dashed-amber corequisite
  legend and a swatch on each status chip. The Mi avance tour copy no longer
  describes the removed green rings.

## 7. Legacy removal

Deleted `app/v1`, `components/legacy/*` and eight dead top-level duplicates
(`CourseNode`, `CurriculumGraph`, `ElectivePicker`, `GradoChecklist`,
`PlanSwitcher`, `SearchBar`, `SidePanel`, `SummaryBar`). `ElectivePicker` and
`GradoChecklist` were still used by the live explorer, so they moved to
`components/explorer/`. `app/globals.css` is untouched (those two use its global
classes) — pruning it is a separate audit. `/v1` returns 404.

## 8. Local MySQL data actions (not in code!)

These happened on the **local docker MySQL only** and are lost on a
`SEED_REBUILD_COURSES=1` re-seed unless the source Excel is fixed:

- Re-seeded from `Excel_Registro.xlsx` with `SEED_REBUILD_COURSES=1`.
- The rebuild reproduced a known Excel mislabel: the "Electrónica Análoga" slots
  in `ielc-cbu3`, `ielc-cbu3-pc`, `doble-cbu3` were bound to `IELE3106`
  (Potencia), giving it Potencia's prereq `IELE 2100` and lab. The three slots were
  rebound to `IELE3200` (prereq `IELE 2206`, coreq `IELE-3200L`), flagged
  `manuallyEdited`. **Root fix:** Mauricio's corrected pensum Excel (M-2).
- Not re-applied locally (patched on Neon on 2026-09-24): `IELE 2150 → IELE2110`
  rebinds, the `MATE2301` course, and the dropped `ManualPairing` rows.

## 9. Open items

- Q-3: "Disponibles" chip count vs the panel's "Disponibles para agregar".
- Pensum Excel (M-2) fixes; re-apply the Neon-only patches.
- `app/globals.css` pruning; remove the root Vite `app/` once signed off.
- Dockerfile + compose `web` service (P3) for the MySQL monolith release.
- Automatic term rollover (cron/admin "sync now"); Vercel `OFFERINGS_TERM`.
- Contrast to measure: `--accent` on its tint is 4.46:1 (just under 4.5).
