# Embed: electives table (`/embed/electivas`)

The public, iframe-able widget for the department's "Pensum" page. Built from
the "Electivas Tabla" design (2026-11-03). Replaces the earlier role-matrix
widget (`ElectiveVenn`).

```html
<iframe src="https://<host>/embed/electivas" width="100%" height="680" style="border:0" loading="lazy" title="Selector de electivas"></iframe>
```

Query parameters (all optional): `?programa=iele|ielc|ambos`, `?tipo=electivas|integradores`,
`?periodo=<K or K+1, e.g. 202710>`, `?curso=IELE3336` (opens that course).

## What it shows

- **Filters:** Programa (Ambos / Electrónica / Eléctrica), Tipo (Todos / Electivas /
  Integradores), Oferta (any / this semester K / next semester K+1). Integrador is not a
  subset of electiva, so the type filter **dims** the other role's column instead of hiding it.
- **Summary bar**, drawn to scale. Each part filters the list. With Ambos it splits by
  program; with one program it splits by role.
- **Table:** one row per course. Electrónica (blue) and Eléctrica (teal) are column bands
  with an Electiva and an Integrador check. A dashed "no aplica" means the course does not
  count in that program (for example, it is mandatory there).
- **"Se dicta" strip:** K, K+1, then the bag's projection (`PROXIMO`) after K+1, hatched and
  labelled (`SEM` shows as the term after K+1). If nothing is known, a dashed cell reads
  "por definir" (`NODEF`) or "sin oferta prevista" (blank).
- **Click a row** to open it inline. Only one row is open at a time. The panel shows:
  - credits
  - **prerequisites and corequisites for the planning period** (2027-1 while 2026-2 runs)
  - the minimum-credits restriction
  - the offering
  - "Planear con esta materia · <programa>", which opens that program's planner in Mi avance

  Each requirement is labelled with its source:
  - "fijado por la coordinación": an admin override
  - "oferta de cursos 2027-1": the live API
  - "Registro 2027-1": the `PRERREQUISITOS` file row. When the course has no row for the
    planning period, the newest earlier row is used and the label says which (e.g.
    "Registro 2026-2").
- Pressing `/` focuses the search. On a phone-width frame, the course column stays put
  while the rest of the table scrolls sideways.

## Requirements formatting (`lib/electiveRequirements.ts`)

The detail API (`/api/electives/detail`) returns structured `ReqView` trees. It does not
return text.

- Course **names**, cased like the planner's course names, with the code alongside.
- An OR made only of English alternatives (`LENG 2999 O LENG 1156 O ENGL7 …`) collapses to
  "Requisito de lectura en inglés (…)".
- Master's and doctoral standing (`EXMA1`, `EXDO1`) are listed after the undergraduate
  course path.
- `*` (can be taken at the same time) shows as a "puede ser al tiempo" chip.
- Corequisites fall back to the Registro `coreqText` when the API has no data. Before this
  change, the fallback dropped them.

Precedence: admin override (`CatalogCourse.prereqOverride` / `coreqOverride` on a plan row
of the same code) → live API for the period → Registro row stored on the elective.

## Verified (2026-11-03)

Ran against a fresh DB seeded from `datos/*_202710.xlsx`, with headless Chrome at 1200 px
and 390 px:

- open, toggle close and switching rows
- each filter, the summary-bar filter, search with `/`, and the empty state with reset
- the `?curso=` deep link
- no horizontal page scroll on the phone

Checked courses:

| Course | Shown |
|---|---|
| Robótica | 2027-1 lab corequisite from the API |
| Automatización industrial | not offered in 2027-1, so the 2026-2 Registro row, with its lab corequisite |
| Práctica profesional | 75-credit restriction |
| Reinforcement learning | "una de estas opciones", with the master's/doctoral options last |
