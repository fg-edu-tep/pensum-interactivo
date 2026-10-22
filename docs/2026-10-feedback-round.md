# October 2026 feedback round — every improvement, by category

All of this is in one pull request, [fgutep/pensum-interactivo#3](https://github.com/fgutep/pensum-interactivo/pull/3)
(branch `claude/loving-edison-ftxjls`), as four stacked commits:

| Commit | What |
|---|---|
| `0de695b` | Onboarding + tour rework, single-choice relation toggle, catalog order, electives/EFI, information priority (IELE 3206 fix) |
| `4d41ed6` | Credit thresholds for slots (admin-editable), "Marcar como vista" everywhere, CBU in the basket |
| `47418cd` | Credit thresholds become a soft "aún no" state instead of a lock |
| `01a4a3c` | Labs in the basket, "Requisito segundo idioma", elective availability + history, CBU rules |

---

## 1. Onboarding and guidance

- **First visit → a centred welcome popup** (`IntroModal`) replaces the old onboarding side panel. It can't
  be dismissed by clicking outside or Esc; its single button starts the **Mi avance** guide, and when the
  guide ends the "¿En qué punto vas?" screen opens so the student chooses where to start.
- **Returning students → "¡Hola de nuevo! ¿Necesitas un repaso?"** — a timed notification (9 s, with a
  draining countdown bar; hovering pauses it), shown once per browser session, with a "Ver la guía" button.
- **The tour is now a checklist**, not a card glued to a button:
  - every step is listed up front ("Te mostramos…"), steps get a ✓ as they are seen, any step can be revisited;
  - the card always sits in the same corner (bottom-left, flips right only if it would cover the target);
  - the target gets a dashed "this is here" outline and a numbered marker matching its checklist row —
    no "press me" glow;
  - the page is inert while the guide runs, so clicking along can't break the sequence;
  - wording shows instead of commanding ("aquí puedes…", "cuando quieras…").
- New tour step (both tours) explaining the relation selector by the questions it answers; the example
  course is the one most others depend on, so every view has something to show.

## 2. Map and navigation

- **Relation selector** under a selected course is a **single-choice segmented toggle** (not checkboxes).
  The active option shows its question:
  - *Qué necesito* — ¿Qué debo aprobar antes de inscribir este curso?
  - *Qué desbloquea* — ¿Qué se me abre con solo aprobar este curso (o tenerlo en mi canasta)?
  - *Qué depende de él* — ¿Qué cursos lo piden, aunque también pidan otros?
- **Pensum order everywhere** (landing page, plan switcher, `/api/catalogs`): Electrónica → Eléctrica →
  Doble programa → Maestrías; standard plan before its "con Precálculo" variant.

## 3. Mi avance and the basket

- **Every course and slot can be marked as seen** from its panel ("Marcar como vista"), locked or not —
  covers equivalence credits (homologaciones) and courses taken out of order.
- **CBU slots can go in the next-semester basket.** The basket lists them under "Espacios por elegir"
  with a link to the CBU offering; they count toward basket credits, the copied list and the next steps.
  The planner suggests one open CBU.
- **Credit thresholds for slots** (a UX aid for first-semester students, not a rule): below its threshold
  a slot shows the ordinary grey "aún no" state — no lock, no message — and can still be marked as seen.
  Defaults for the undergraduate plans: **EFI 75, Electivas 80, Curso de libre elección 40, Curso
  integrador 40** (editable in the admin, see §7). Maestrías get none.
- **Labs and complementarias in the checkout schedule.** A course's lab (`…L`), complementaria (`…C`),
  práctica (`…P`) or taller (`…T`), plus any corequisite the data declares under another code
  (e.g. IELE 3402 → IELE 3403), becomes its own entry right after the course: its own section/NRC, in
  "Tu semana", in the clash check and in the NRC list. It can't be removed on its own.
- **Obligatory co-enrolment is announced in the basket**: a banner ("Un curso de tu canasta tiene
  correquisitos obligatorios: IELE 1218 → IELE 1218L (laboratorio)… se inscriben al mismo tiempo, cada uno
  con su propio NRC") and a "+ IELE 1218L obligatorio" tag on the course.
- **CBU rules**: the CBU panel and the basket state the combination (1 CBU de Colombia + 2 CBU libres)
  and link to [educaciongeneral.uniandes.edu.co/transicion-de-cbu](https://educaciongeneral.uniandes.edu.co/transicion-de-cbu/).
- The course panel's bottom bar puts "Agregar a mi canasta" on its own row (it was cramped).

## 4. Electives

- **Removed** the "Pensum 2024-I+ | Hasta 2023-II" toggle; only the 2024-I columns of the bag are used.
- **Electiva en Fundamentos de Ingeniería (EFI)**: any engineering code is valid (I*** — IELE, IMEC, IBIO,
  ISIS, IIND, ICYA, IQUI…). The student types a code; name and credits come from the live offering, then
  the course database, then the Registro upload.
- **Source of truth = the Excel bag.** The live API only enriches it (code, credits, number of sections and,
  new, this semester's prerequisites). Electives in the bag but not offered this semester fall back to the
  Registro Excel.
- **"Última vez dictado en: 2025-1"** on electives not offered this semester, plus when they're usually
  taught: semester 1, semester 2, both, or every two years.
- **Excel mechanism**: the bag can carry two optional columns, found by header text like
  "ES CURSO INTEGRADOR":
  - `CÓDIGO` — the course code (avoids guessing by name);
  - `SE DICTA` — `1` / `Primer semestre`, `2` / `Segundo semestre`, `Ambos`, `Cada dos años`.

  Blank cells are filled by the seed from the full Registro history (code by name — exact, then
  abbreviation-aware since Registro truncates names —, last period taught, usual semester over the last
  8 years, Registro prerequisites/credits). On the current data 33 of 51 electives get a code
  automatically; the rest need `CÓDIGO` (pregrado: Diseño de líneas, COIL vehículos espaciales, Pasantía
  de investigación, Proyecto de ingeniería (PI)). The exported `ELECTIVAS.xlsx` template has a "Se dicta"
  dropdown.
- **Can I take it?** In Mi avance each elective shows in colour with "Puedes tomarla" or greyed/striped
  with a 🔒 "Aún no". Clicking any row answers **"¿Qué necesito antes de tomar X?"**: the full requirement,
  the missing courses (click → jumps to the course on the map) and the source (this semester's offering,
  or Registro at the last period taught). E.g. with ISIS 1221 seen, *Interfaces Hombre-Máquina* is
  available while *Automatización Industrial* is locked ("Te falta: IELE 2300").

## 5. Graduation checklist

- New **"Requisito segundo idioma"**, distinct from "Requisito de lectura en inglés", with a
  "Más información" link to
  [the second-language requirement page](https://cienciassociales.uniandes.edu.co/lenguas-cultura/servicios/requisitos-lenguas-grado/requisito-de-dominio-en-segunda-lengua/).
- Checklist items can carry a "Más información" link (`infoUrl`, editable in the admin).

## 6. Data and information priority

- **One written-down priority for prerequisites/corequisites** (`lib/requirementResolve.ts`), used by both
  the student map and the admin discrepancy alerts, so they can't disagree:
  1. the live API for the plan's semester (if it confirms "no requirement", that counts);
  2. the plan's own document data (seed, PLANES.xlsx, Registro wizard, admin edits);
  3. the uploaded Registro Excel (latest applied upload, else the latest not discarded);
  4. the API data of another semester (most recent first).

  **An empty source is skipped**, never read as "no requirement". This fixes **Instrumentación
  (IELE 3206)**, which is only taught in first semesters, so it had no 2026-2 offering and an empty
  document row.
- The text students see (side panel, basket) always comes from the winning source; the course panel says
  where the requirements came from ("Según la oferta oficial de 2026-2", "Según Registro (2026-1)…").
- Re-running the seed fills **empty** prerequisite/corequisite text on existing rows from the Registro
  Excel (never touching hand-edited rows or pinned fields).

## 7. Admin panel

- **Plan → Reglas → "Desbloqueo por créditos"**: a table of slot types (EFI, Electivas, CLE, Curso
  integrador, CBU) + number of credits; add / remove / save. Defaults appear automatically until a plan
  is saved or seeded once; after that what the admin left (deletions included) is final. PLANES.xlsx
  imports keep the thresholds.
- Checklist items (attestations) gained a "Enlace «Más información»" field.
- A code set on an elective in the admin is kept by later seeds.

## 8. Deploy, data and migrations

- One new **additive** migration: `20261022125700_elective_offering_history` (new nullable columns on
  `Elective`). `vercel-build` applies it.
- Works on deploy without a seed: onboarding/tour, toggle, order, basket labs, CBU, credit thresholds,
  second-language item, elective lock/"qué necesito" (for electives offered this semester, via the API).
- Needs a **(non-destructive) `npm run seed` against the production database** after merging: the
  elective history columns ("Última vez dictado", usual semester, Registro prerequisites for electives not
  offered this semester), and filling empty prerequisite text on existing plan rows.

## 9. Verification and known limits

- Unit tests: 174 pass (11 skipped need a scratch database, as before); the student-map vs admin-alerts
  consistency test passes; production build passes. Every change above was clicked through in a browser
  against a local seeded database, including phone width for the tour.
- **Not verified:** anything that depends on the live Uniandes API (sections, course details, elective
  enrichment) — the development environment couldn't reach it; the Excel/database/Registro fallbacks were
  checked.
- 18 of 51 electives have no code until the `CÓDIGO` column is filled.
