# Import templates (`export:templates`)

Generates the two human-editable workbooks a coordinator uses to update the
curriculum, **populated from the current DB** (which was seeded from the original
Excels and synced against the course API).

```bash
cd web
npm run export:templates          # -> ../plantillas/PLANES.xlsx + ELECTIVAS.xlsx
TEMPLATES_DIR=/some/dir npm run export:templates
```

## `PLANES.xlsx` — curriculum structure

Replaces the wide grid of `PENSUMS … CBU3.xlsx`. **One row = one course/slot**;
`Semestre` is an explicit column, never inferred (this also fixes the stale
`SEM n` column markers in the "con Precálculo" sheets).

| Sheet | Contents |
|---|---|
| `IELE CBU3`, `IELE CBU3 PC`, `IELC CBU3`, `IELC CBU3 PC`, `DOBLE CBU3` | plan rows: `Semestre` · `Código` · `Nombre` · `Créditos` · `Tipo` · `Prerrequisito (respaldo, opcional)` · `Notas`. A `Total Semestre N` row per block (formula, ignored by the parser). |
| `_CATALOGOS` | one row per plan: slug, programa, variante, término objetivo, estado, color, tagline |
| `_REQUISITOS_GRADO` | atestaciones + gates de grado — add/remove rows to add/remove requirements |
| `_NODOS_REQUISITO` | the 0-credit map nodes (English reading requirement): label, semester, linked attestation, `autoLinkRegex`, explicit `linkedCourseCodes`, info URL |
| `_INSTRUCCIONES` | how to fill each column |

Field sources: `Semestre` and slot credits/labels come from the **coordinator**;
a real course's title/credits/prereqs/coreqs/offering come from the **API** and
may be left blank. `Prerrequisito` in the sheet is only a fallback for courses
with no offering that term.

## `ELECTIVAS.xlsx` — elective bag

`ELECTIVAS` sheet, one row per elective: long name, 4 role columns (Eléctrica /
Electrónica × 2024-I+ / hasta 2023-II), `Es Curso Integrador`, offered terms,
nivel, ciclo, optional code, `Se dicta`. Dropdowns on every role / Sí-No / nivel /
`Se dicta` column.

**`Código` and `Se dicta` in the bag the seed reads** (`electivas/BOLSA DE
ELECTIVAS*.xlsx`, sheet `ELECTIVAS IEE` or `MATERIAS MAESTRIA`): add a column
whose header is `CÓDIGO` and/or `SE DICTA` anywhere after the name; the parser
finds them by header text, like `ES CURSO INTEGRADOR`. `SE DICTA` accepts
`1` / `Primer semestre`, `2` / `Segundo semestre`, `Ambos`, `Cada dos años`.
A blank cell is filled at seed time from the full `Excel_Registro.xlsx`
history (`lib/import/electiveHistory.ts`): the code by name (exact, then
abbreviation-aware — Registro truncates names), the last period taught, the
usual semester (both / one / every two years over the last 8 years), and
Registro's prerequisites/credits for electives not offered this term. On the
2026-10 data 33 of 51 electives match a code; the rest need `CÓDIGO`.

## Formatting

Frozen header + key columns, autofilter, per-semester banding, wrapped text,
data-validation dropdowns (`Tipo`, roles, estado, Sí/No), a conditional-format
rule that turns a row **red when `Semestre` is blank**, subtotal rows, print
fit-to-width.

## Load contract (feeds the P2 importer)

- Stable diff key: real course → `(slug, normalizedCode)`; placeholder →
  `(slug, kind, semester, nth occurrence)`.
- Parser trims, ignores blank rows, `Total …` rows, `_INSTRUCCIONES`, and the
  `Notas` column.
- `Semestre` comes only from that column.
- Field-level diff shown before apply; rows/fields an admin already edited
  (`manuallyEdited` / `lockedFields`) surface as **conflicts to confirm**, never
  silently overwritten.
- Apply = snapshot + upsert-by-key + re-pair against the API. Never
  delete+recreate.
