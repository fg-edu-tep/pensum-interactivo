# Official load: PLANES, BOLSAS, PRERREQUISITOS

From November 2026 the department maintains three Excel files. They are the official way to update the program, and the app treats them as the source of truth. When the course API is down, they are also the fallback. The same code runs from the admin panel (`/administrador/carga`) and from `npm run seed` (files in `datos/`).

Code: `web/lib/import/official/` (`planesMatrix.ts`, `bolsas.ts`, `programRestriction.ts`, `offering.ts`, `prepare.ts`, `apply.ts`, `settings.ts`). Golden tests against the real files: `official.test.ts`.

## The files

All three start with the Registro columns: `Periodo · Nivel · Facultad · Departamento · Estado · Materia · Créditos · Nombre curso · Código prerrequisito · Nombre prerrequisito · Código correquisito · Nombre correquisito · Restricción de periodo / programa / nivel / grado / departamento / facultad / campo de estudios / atributos alumno`.

Every column is read by its header, hidden columns included. In PLANES the prerequisite column is hidden; in BOLSAS, `IELE CINTEGRAD` and `IELC OBLIGATORIA` are hidden.

### PLANES_&lt;periodo&gt;.xlsx

One row per course, plus one column per plan. The cell holds the **semester** the course sits in for that plan (blank = not in the plan). The last column is `TIPO`.

| Column | Catalog | Notes |
|---|---|---|
| `PLAN IELE PC` | `iele-cbu3-pc` | PC = starts with Precálculo (MATE 1201) |
| `PLAN IELE CD` | `iele-cbu3` | CD = starts with Cálculo Diferencial |
| `PLAN IELC PC` | `ielc-cbu3-pc` | |
| `PLAN IELC CD` | `ielc-cbu3` | |
| `PLAN IELE IELC` | `doble-cbu3` | 9 semesters, 16 elective credits |
| `PLAN MIELE`, `PLAN MIELC` | `miele`, `mielc` | loaded as **drafts** (not shown to students) |

Rules:
- **Slot pseudo-codes:**
  - `CBU1…CBU5` → CBU slot.
  - `IXXX` → EFI.
  - `ELEC` (4 cr) → two 2-credit elective boxes (the half-box model).
  - `CINTEG` → Curso integrador.
  - `CLE` → libre elección.
  - `IELE-4XXX` / `YYYY-4XXX` → master's slots ("CURSO LIBRE" → CLE).
- **Labs and companions:** 0-credit rows (`LAB…`, `TRAB. ASIST…`, codes ending in L/T/P, and `IELE-3403`) are **not map nodes**. They stay the corequisite of their parent course (`IELE-1002` → `IELE-1002L`). 20 such rows in 202710.
- **TIPO:** Obligatorio → núcleo, Proyecto → proyecto, CBU → cbu, Electiva → electiva (CLE → libre elección).
  - TIPO is also the course's **group on the map** (`CatalogCourse.category`, `lib/courseCategory.ts`). It accepts those four values or the seven categories of the pensum PDF: Fundamentos de Ingeniería, Fundamentos Transversales IEE, Fundamentos Específicos, Ciclo Terminal, Ciclo de Ciencias y Matemáticas, Proyectos, Educación General.
  - The PDF colours and the legend follow (`components/explorer/tokens.css`).
  - A file that mixes "Obligatorio" with PDF categories gets a warning.
  - Admins can change or pin the group per course ("Grupo" in the catalogue editor).
- **Names:** Banner truncates names to 30 characters ("ELEMENT.SISTEMAS ELÉCTRICOS"). A course already in a plan keeps its curated name; new courses take the file's name.
- **Requisites:** the PLANES requisites are applied, and they win over the export for the same course. An emptied cell clears them.

### BOLSAS_&lt;periodo&gt;.xlsx

The elective bag. **Codes are the identity** (nothing is matched by name any more). For each program (`IELE`, `IELC`, and for testing `MIELE`, `MIELC`) there are independent `X` columns: `OBLIGATORIA`, `ELECTIVA`, `CINTEGRAD` (and `PROFUND` for master's).

- **Integrador is not a subset of electiva.** Práctica profesional is integrador only. Digitalización de subestaciones is both.
- A course that is `OBLIGATORIA` in a program, or that is in that program's plan by code, is **not** one of its electives (Electrónica de potencia: obligatoria in Eléctrica, electiva in Electrónica).
- **`PROXIMO`** is the projected next offering:
  - a period (`202810`) = "Próxima oferta proyectada: 2028-1"
  - `SEM` = "Se dicta todos los semestres"
  - `NODEF` = "Próxima oferta: por definir"
  - blank = probably not offered again
- **Loading the bag replaces the old one.** Rows not in the file are deleted. That removes the invented `FISI 4961` and the mismatched "Diseño de líneas" → `ISIS 1226`.

### PRERREQUISITOS_&lt;periodo&gt;.xlsx

The Registro requisitos export, which covers several periods (202410–202710 in the first file).

- **Requisites:** for each code, the row for the declared planning period is used; if there is none, the newest earlier row.
- **"No primer semestre" / "excluye ingresa a N semestre":**
  - `EXCLUYE INGRESA A <ordinal> SEMESTRE` → **15 × N approved credits**.
  - `EXCLUYE ESTUDIANTE NUEVO` counts as N ≥ 1.
  - `INCLUYE INGRESA A …` is not a minimum.
  - 202710 results:

    | Code | Course | Minimum | Restriction |
    |---|---|---|---|
    | IELE 1081 | Taller IEE 1 | 15 cr | no primer semestre |
    | IELE 3720 | Interfaces hombre-máquina | 60 cr | semesters 1–4 |
    | IELE 3090 | Práctica profesional | 75 cr | semesters 1–5 |
    | IELE 3004 | Problema especial | 75 cr | semesters 1–5 |
    | IELE 4801 | Gerencia avanzada de proyectos | 90 cr | semesters 1–6 |

- **Program restriction:** `INCLUYE` clauses form an allow-list and `EXCLUYE` clauses a deny-list. Only the exact undergraduate names match: "INGENIERIA ELECTRICA" is not "MAESTRIA EN ING.ELECTRICA". Results:
  - Courses only for some master's (most `MAIA-41xx/42xx/43xx`) are never "Puedes tomarla" for IELE/IELC.
  - `MAIA-4341/4342` list both undergraduate programs, so they stay open.
  - `IELE-3001` is Eléctrica only; `IELE-3002` is Electrónica only.
- **Level restriction:** `INCLUYE MAGISTER` alone → graduate only (Curso tutorial IELE 4003).
- **Last period taught** = the newest period ≤ the current one. It is shown only as secondary information, under "Más detalles".

## "Se dicta en P" (offering without the API)

The export lists, per period, every course that has requisites and is open that period. Mauricio confirmed this in his email of 2026-10-29, so the cartelera is not needed for now. `offering.ts`:

| Case | Result |
|---|---|
| Row for P in the export | offered |
| PROXIMO = P | offered |
| The export covers P, the course has other rows, none for P | not offered |
| P not covered and PROXIMO = SEM | offered |
| PROXIMO is a later period, or blank | not offered |
| anything else | unknown (no badge) |

These verdicts are written as `CourseOffering` rows with `source = "archivo"` for the current period and the planning period. **A live API row always wins** and is never overwritten.

Courses with no requisites never appear in the export (`IELE-2110`, `CCOM-1100`, `MATE-1201`). For them the answer comes only from PROXIMO.

## Periods

- **Current period:** from the date (Bogotá time).
- **Planning period:** declared by the admin at upload ("¿Esta carga es para la planeación de qué periodo?"). It is stored in `AdminSetting.planning_term`.
  - Every loaded catalog takes `term = planningTerm`. That period's requisites win (API for P → document → Registro).
  - The cart plans that period.
- **Student toggle:** "Ver lo que se dicta este semestre (K)" / "Planear mi próximo semestre (K+1)" switches the offering shown in the side panel and the pickers.
- **API down:** when the course API is down and an official load exists, the planner **does not block**. It uses the loaded offering and shows a blue notice. This is the review's proposal; before any load the old block stays.

## Applying

`/administrador/carga`:
1. Choose the period and upload the three files (they are recognised by name).
2. Read the report:
   - per plan: courses, slots, credits, semesters, and the change against the database
   - restrictions turned into credits
   - program-only and graduate-only courses
   - the bag's attributes and PROXIMO counts
   - offering per period, and courses with no row in the export
   - warnings (e.g. 25 old alternative codes in prerequisites)
3. "Aplicar la carga".

Before writing, every plan is snapshotted, exactly like a PLANES template import. Admin-pinned fields are kept unless forced. Rows the file dropped are removed unless the box is unticked. The row order follows the file.

The plan diff is also visible course by course at `/administrador/importar/<id>`. It is read-only there: an official load is applied only from `/administrador/carga`.

Seed: `npm run seed` reads the newest `datos/PLANES_*`, `BOLSAS_*` and `PRERREQUISITOS_*`. Environment variables:
- `PLANNING_TERM` / `CURRENT_TERM` override the periods.
- `SEED_KEEP_REMOVED=1` keeps dropped rows.
- `SEED_FORCE_CONFLICTS=1` overwrites pinned fields.
- `SEED_LEGACY=1` forces the old workbook pipeline.

Re-running produces no changes (verified).

## Also new in the data model

Migration `official_load`:
- `Course`: `programRestriction`, `levelRestriction`, `offeringProjection`
- `CourseOffering.source`
- `Elective`: `attrs`, `projection`, `programRestriction`, `coreqText`, `source`
- a new `CodeName` table: every code the export knows → its name, so requirements are shown by name ("Necesitas: uno de Diseño prod. e innovación TI, Análisis de sistemas de control")
