# Admin · Discrepancy alerts (document vs official API)

Status: **implemented and verified** (branch `admin-auth-and-experience`).
Sibling docs: [`admin-registro-wizard.md`](admin-registro-wizard.md) (how document data gets written),
[`admin-auth.md`](admin-auth.md) (who the audit rows name).

## Why

A student's prerequisites/corequisites come from two places. The **official API**
(`CourseOffering.api*`, synced per term from the Uniandes course-details endpoint) and
the **document** (`CatalogCourse.prereqText/prereqTree/coreqText/coreqTree` — the seed,
the Registro wizard, and manual edits). The intended behaviour, confirmed by the
coordinator, is:

> **Prefer the API; fall back to the document only when the API has no data for the course.**

That is correct, but it has a consequence admins could not see: **an edit to the
document is silently ignored for every course the API covers** (≈ 85 % of courses in
every plan). Before this feature nothing told an admin that their edit (or a Registro
import) differed from the official data, or that students would never see it.

This feature makes every such difference visible, where the admin is working, with the
exact values on both sides and who most likely caused the difference.

## The precedence (what students see)

Implemented in `lib/catalogPayload.ts` (student payload builder — **intentionally
untouched**). `off` = the course's `CourseOffering` for **`catalog.term`** (e.g. `202620`);
`detailsFetched = off.detailsSyncedAt && !off.detailsError`.

| Field | Students get | Governor |
|---|---|---|
| **Prerequisites** | `off.apiPrereqTree` if present | API |
| | else, if `detailsFetched` and the API has no prereq text → **none** (the document is *ignored* even if it has text) | API |
| | else the document tree (`CatalogCourse.prereqTree`) | document |
| **Corequisites** | `off.apiCoreqTree` if present | API |
| | else, if `detailsFetched` → **none** | API |
| | else the document tree | document |

"Document governs" therefore means: no offering row for the term, course not offered,
offering sync failed, details never fetched, details fetch failed, or the API returned
prerequisite text that could not be parsed into a tree.

### Known inconsistencies in the student payload (documented, not changed)

Found while building this; the discrepancy logic mirrors them so it tells the truth.

1. **Prerequisite text vs tree.** `prereqText = apiPrereqTree ? apiText : document text`.
   When the API confirms "no prerequisite" the *tree* is empty but the *text* is the document's.
   The explorer draws from the tree, so this is harmless today, but the text is wrong.
2. **Corequisite text is always the document's** (`coreqText: cc.coreqText`), regardless of
   who governs the tree. `components/explorer/BasketModal.tsx` prints `coreqText` as a chip
   ("Correquisito …") and in the pre-enrolment tips, so **a document corequisite that disagrees
   with the API can still reach students in the enrolment basket.** The coreq alerts say so.

Whether to fix these is a separate decision (it would mean touching the student payload).

## What is reported

For every real (non-placeholder) course of every catalog, for **each** of prereq and coreq:

| Status | Meaning | Severity |
|---|---|---|
| `match` | document and API ask for the same thing (or both empty) | ok |
| `soft-only` | same requirement; only the `*` (concurrent) marker differs | info |
| `differs` | the document asks for something different from the API | **warn** |
| `doc-hidden` | the API confirms *no* requirement, the document has one → not applied in the map | **warn** |
| `api-only` | the API has a requirement, the document is empty | info |
| `unverified` | no usable API data → the document governs and cannot be checked | info |

`unverified` carries a reason: no offering row for the term · not offered · offering sync
failed · courseDetails never fetched · courseDetails fetch failed · API text could not be parsed.

Each report also carries: who governs, what students see (tree + text), both raw values,
the course codes present on only one side, the API sync date, and the **cause** of the
document value — `pinned` (field in `lockedFields`, e.g. a Registro replace/drop/rebind),
`edited` (row is `manuallyEdited`), or `imported` (seed / Registro / PLANES).

### How two expressions are compared

`lib/discrepancy/compare.ts` canonicalises both trees before comparing: nested groups of the
same operator are flattened, operands are sorted, duplicates collapse, single-item groups
become the item. So `(A O B) O C`, `C O B O A` and `A O (B O C)` are the same. `*` markers
are compared in a second pass (→ `soft-only`). It does **not** try to prove logical
equivalence (absorption, distribution); structurally different trees are reported as
different, which is the safe direction for an alert.

## Where admins see it

| Surface | What |
|---|---|
| **`/administrador/discrepancias`** (sidebar: *Discrepancias*) | Per plan: counts, last API sync (with a stale-data warning after 14 days), and each difference with the official value, the document value, the differing codes and the cause. Filters: *Solo advertencias* (default) / *Todas las diferencias y sin verificar*, and per plan. |
| **Catalog list** (`/administrador`) | New column: `⚠ N` (links to that plan's page) or `sin advertencias`. |
| **Course editor** (`/administrador/catalogos/[slug]#cursos`) | Inline alert under *Prerrequisito (respaldo)* (and a coreq warning when it differs). If you start editing the backup value of a course the API governs, an extra warning says students will keep seeing the API. |
| **Registro wizard · Resolver** | A `ref-missing` code (e.g. `FISI1028`) shows which courses' **official** expressions still list it — "not retired, just no row in the window". The help text no longer suggests such codes are retired. |
| **Registro wizard · Vincular / Aplicar** | Each planned requirement change is marked: students *will* see it (document governs) · agrees with the API · **differs from the API and students won't see it**. Totals appear in the Vincular card and the Aplicar summary. |

All alerts come from one component (`components/admin/DiscrepancyAlert.tsx`) and one
wording function (`headlineFor`), so the text is identical everywhere. Warn alerts use
`role="alert"`.

## What it found on the real data (2026-10-03)

After the Registro run #1 (which chose *drop* for `FISI1028`): **10 warnings per plan**
(API governs ≈ 60 of ≈ 70 fields; the document governs 8–14 and is unverifiable):

- 5 × prerequisites of `IELE2002 IELE2010 IELE2100 IELE2206 IELE2300` — cause **pinned**.
  The API still lists `FISI 1028`; the document no longer does, so the document's rule is
  *stricter* than what students see. (Undo the run from `/administrador/registro/1` if unintended.)
- 4 × `MATE1105 MATE1203 MATE1207 MATE1214` — cause **imported**: the Registro export carries
  an extra soft `…C*` companion token the API does not list. Pre-existing.
- 1 × corequisite of `IELE2002` — the API lists `IELE2002T`, the document does not. Pre-existing.

None of these change what students see today (the API governs those courses); they are
latent differences that would surface if the API data for the course ever disappeared.

## Code map

| Piece | Path |
|---|---|
| Tree canonicalisation / comparison | `web/lib/discrepancy/compare.ts` |
| Governance mirror, statuses, causes, wording | `web/lib/discrepancy/report.ts` |
| DB loading (one loader for every surface) | `web/lib/discrepancy/service.ts` (`loadCourseInputs`, `buildDiscrepancyReports`) |
| Wizard glue (student impact, API mentions) | `web/lib/discrepancy/wizard.ts` |
| Shared alert | `web/components/admin/DiscrepancyAlert.tsx` |
| Page | `web/app/administrador/(panel)/discrepancias/page.tsx` |
| Catalog list / editor wiring | `(panel)/page.tsx`, `(panel)/catalogos/[slug]/page.tsx`, `CourseRow.tsx`, `editorTypes.ts` |
| Wizard wiring | `lib/registro/service.ts` (`impact`, `apiMentions`), `StepResolve/StepLink/StepApply.tsx` |
| Tests | `web/lib/discrepancy/__tests__/*` |

Read-only: nothing here writes to the database.

## Design decisions

- **Mirror, don't refactor.** The student payload builder is untouched (the student view was
  verified and the request was "do not touch what works"). The governance logic is duplicated
  on purpose and **locked by a test** (below).
- **Compare against `catalog.term` only** — the same term the payload uses. If a plan's term lags
  behind the current offering term, every comparison is against that older term; the page shows
  the term and the API sync date.
- **One loader** feeds every surface, so the badge, the page and the editor can never disagree
  (the browser test asserts the three agree).
- **Severity is conservative:** only `differs` and `doc-hidden` are warnings. `unverified` is
  information — there is nothing to disagree with.

## Verification (2026-10-03/04)

- **Unit (`npm run test`, 115 tests, 114 pass + 1 DB-only skipped):** canonicalisation (order,
  nesting, duplicates, AND≠OR), every status, every unverified reason, cause precedence, coreq
  rules, the text mirror, wording rules, the exact `FISI 1028` and `MATE 1105C*` cases from the real
  data, the wizard glue (agrees / would differ / document governs / non-requirement fields ignored).
- **Equivalence with the student payload** (`lib/discrepancy/__tests__/payloadEquivalence.test.ts`):
  for every course of every plan it requires the same effective tree, governor and prerequisite
  text as `buildCatalogPayload`. Read-only; skipped without a database. Run with
  `node --env-file=.env --import tsx --test lib/discrepancy/__tests__/payloadEquivalence.test.ts`
  (or set `DATABASE_URL`). **On the real data alone it is a coarse net** — a deliberate mutation of
  the coreq rule was *not* caught, because no real course reaches that branch. So it was also run on
  a scratch copy with planted edge cases (API says *no* coreq while the document has one; API says
  *no* prereq while the document has one; unparsed API text; details failed; never synced; no
  offering row), where the same mutation **is** caught. The unit tests also catch it.
  The scratch run found a real divergence in the first version of the mirror (visible prerequisite
  *text* when the API says "none") — see Known inconsistencies.
- **Browser E2E (29 checks, Edge via puppeteer-core, scratch DB):** page, filters, sidebar, the
  default view hiding noise, planted scenarios reported with the right wording and reasons,
  official + document values and the cause shown, warn alerts announced, **chip counts = alerts
  rendered = catalog-list badges** (9 per plan on the scratch data), editor inline alert and the
  "students won't see this" edit warning, the corrected wizard help text, the "API still lists
  FISI1028" notice, the student-impact summary in Vincular and Aplicar, and no unexpected
  4xx/5xx or console errors (only the pre-existing missing favicon).
- **Real data, read-only:** the report produced the 10-per-plan breakdown above.
- `npm run build` passes.

## Known limits / not done

- There is no in-app **re-sync** of API data; the page only shows how old it is. (The P2.4
  manual-pairing queue / re-sync from the original plan is not built.)
- Registro-vs-API is not compared directly; the comparison is always document-vs-API (the
  document is what the Registro wizard writes).
- Placeholders and requirement nodes are out of scope.
- The two student-payload inconsistencies above are reported, not fixed.
- Wording is Spanish only, consistent with the rest of the admin.
