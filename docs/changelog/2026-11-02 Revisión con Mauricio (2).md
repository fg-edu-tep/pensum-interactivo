---
title: Revisión con Mauricio Guerrero (2) — changelog
date: 2026-11-02
review: 2026-10-29
tags:
  - pensum-iele
  - changelog
  - revision-mauricio
  - carga-oficial
branch: claude/loving-edison-ftxjls
status: en-revision
release-gate: listo
dsit-deploy: 2026-11-04
updated: 2026-11-03
aliases:
  - Changelog 2026-11-02
  - Carga oficial 202710
---

# Revisión con Mauricio (2) — 2026-11-02

> [!summary]
> The three release gates are done:
> 1. Cart warnings that persist through checkout.
> 2. "Next semester" marked **on every** cart change.
> 3. The elective bag, which now works for any combination of credits.
>
> The department's **three Excels** (PLANES, BOLSAS, PRERREQUISITOS) are now the official way to load the program, from the admin panel or the seed. They are loaded for **2027-1** and verified course by course.
>
> Also in this round: the electives widget (tags, program, two aligned columns, period), the "Planeación" page, Mauricio's two email grievances, and the smaller fixes (quick selection, Spanish writing requirement, CLE, contrast, loading veil, login).
> Previous rounds: [[2026-10-29 Revisión con Mauricio]] · Engineering doc: [[admin-official-load]] · Spec: *Pensum IELE — Improvements from Review with Mauricio Guerrero (2026-10-29)*
>
> **Update 2026-11-03** (§10): a QA pass over every item of the spec, then the fixes it led to. The map's groups and colours now come from TIPO and the pensum PDF. The Mi avance filters are simpler, the cart button stays on screen, and the electives widget is now a summary bar plus a role matrix instead of the Venn diagram.

> [!success] Verification
> - `npm run test`: **229 ✅ · 0 ❌** (11 pre-existing skips).
> - DB equivalence test ✅. `npm run build` ✅.
> - Golden tests against the three real files.
> - Every screenshot below comes from the app running on the 2027-1 load (Electrónica plan).

---

## 0. The department's Excels (official load)

> [!info] Decision
> Mauricio's email (2026-10-29) says requisitos for 202710 already tell us what is taught in 202710, so **no cartelera is needed**. The only exception is IELE-2110, which has no requisites. The offering is derived from the export plus `PROXIMO` (see [[admin-official-load#"Se dicta en P" (offering without the API)]]).

- [x] **Admin "Carga oficial":** upload the three files, declare the period ("¿Esta carga es para la planeación de qué periodo?"), read a full report, then apply. A snapshot is taken first; admin pins are respected; the row order follows the file.
- [x] **PLANES:** one column per plan.
  - PC/CD of IELE and IELC, the double program, and the master's plans as **drafts**.
  - Labs (L/T/P rows and `IELE-3403`) become **corequisites** of their course: 20 rows.
  - `ELEC` 4 cr becomes two 2-credit boxes; CBU*n*, IXXX, CINTEG and CLE become their slots.
- [x] **BOLSAS:** independent attributes per program (obligatoria / electiva / integrador), with codes as the identity. **PROXIMO** becomes "Próxima oferta proyectada / Se dicta todos los semestres / por definir".
- [x] **PRERREQUISITOS:** the requisites of the declared period.
  - **"Excluye ingresa a N semestre" → 15 × N credits**; "no primer semestre" = 15 (Taller IEE 1).
  - Program and level restrictions are applied (MAIA courses that only some master's can take).
- [x] **Seed** reads `datos/` and is idempotent: a second run gives 0 changes.

![admin carga oficial](assets/2026-11-02/15-admin-carga-oficial.png)
![admin informe de carga](assets/2026-11-02/16-admin-informe-de-carga.png)

What the 2027-1 load changed in the plans (vs. the old workbook):
- **New courses:**
  - CCOM 1100 replaces the "ESCR" slot.
  - IELE 2110 replaces IELE 2150 (its code changed).
  - MATE 2301 replaces the "IELE xxxx Ecuaciones diferenciales" wildcard.
  - IELE 3018 replaces "IELE 301X".
- **Electrónica análoga** is now **IELE 3200**; the old workbook had IELE 3106 by mistake.
- **Requisites** are those of 2027-1. For example, Elementos de sistemas eléctricos no longer lists IELE 1006 / 1010, and Análisis y estimación SD gained "MATE 1207 Y IIND 2106".

## 1. Release gate 1 — cart warnings (§3)

- [x] **Before adding:** an amber warning triangle in a highlighted box: "Ojo: no has aprobado Probabilidad y estadística, Computación científica. Puedes agregarla igual…".
- [x] **In "Revisar mi canasta":** an **orange box at the very top**, on every step, lists each course and what it is missing.
- [x] **A corequisite taken out of the cart is flagged** (§3.3). "Fundamentos de electrónica: Física II debe estar aprobada o en tu canasta". This is re-checked on every cart change.

![aviso antes de agregar](assets/2026-11-02/03-aviso-antes-de-agregar.png)
![canasta sin requisitos](assets/2026-11-02/04-canasta-sin-requisitos.png)

## 2. Release gate 2 — next semester marked live (§4)

- [x] Adding Probabilidad marks Comunicaciones **at once** with the blue "La vas a poder ver" outline. Removing it clears the mark. It is only an annotation: nothing is added for the student.
- [x] Step 0 of checkout stays as the summary.

![marca proximo semestre en vivo](assets/2026-11-02/02-marca-proximo-semestre-en-vivo.png)

## 3. Release gate 3 — electives as one bag (§5)

- [x] **How it works:** all elective boxes are **one bag**. The layout is a pure function of the ordered list of chosen electives, so it is never stored. The spec's 6 layouts are unit tests, plus any sequence (3, 2, 4, 1, 4, 1, 4).
- [x] **Splits are shown:**
  - "(cont.)" on a continuation half, and "1 cr libre" on a free half.
  - Tooltip: "Esta materia vale 3 créditos: ocupa 1½ casillas".
  - "2 cr en electivas + 1 cr excedente" for a course split by the overflow.
- [x] **Overflow notice:** "Tienes N créditos de electivas por encima de los del plan… pueden contar como CLE". It renders without corrupting the boxes.
- [x] **Removing reflows:** removing a course moves the later ones up.
- [x] **The cart holds the course, not the box** (§5.2). An unnamed elective exists only through "Agregar electiva sin especificar", which asks for its credits (1–4).
- [x] **One source of truth** (§5.3): the X in the cart takes the elective out of the bag, and the menu shows the same thing.

![bolsa 3 3 3 excedente](assets/2026-11-02/05-bolsa-3-3-3-excedente.png)
![bolsa reacomodo y sin especificar](assets/2026-11-02/06-bolsa-reacomodo-y-sin-especificar.png)
![la canasta guarda la materia](assets/2026-11-02/07-la-canasta-guarda-la-materia.png)

## 4. Electives widget (§2)

> [!note] Superseded on 2026-11-03
> The rules below still hold, but the Venn circles were replaced by a summary bar and a role matrix. See §10.4.

- [x] **Tags always visible:** "Electiva + Integrador", "Solo integrador", "Solo electiva", whatever the filter.
- [x] **Program buttons:**
  - none selected = everything;
  - one selected = one column;
  - **both selected = two columns aligned by course (Electrónica | Eléctrica)**, with a **dashed neutral empty slot** where a course doesn't count, never red. Electrónica de potencia shows "no aplica en Eléctrica".
- [x] **Type filter:** Todos / Electivas / Integradores.
- [x] **Period filter (optional):** only K or K+1.
- [x] The master's set is still not shown.
- [x] **Inline detail** (requirements by name, last and next offering) **and** "Planear con esta materia" → the planner of the program being viewed.

![electivas todas](assets/2026-11-02/10-electivas-todas.png)
![electivas dos columnas](assets/2026-11-02/11-electivas-dos-columnas.png)
![electivas integradores](assets/2026-11-02/12-electivas-integradores.png)
![electivas detalle](assets/2026-11-02/13-electivas-detalle.png)

## 5. Mauricio's email of 2026-10-29

- [x] **"Choosing Diseño de líneas loads an ISIS course":** the picker matched electives to the offering **by name**. It now matches by **code** (the official bag), and the old row (`ISIS 1226`) is gone.
- [x] **"In 'aún no', list the prerequisites":** each locked elective shows "Necesitas: …" without opening it. An unmet alternative reads "uno de: Diseño prod. e innovación TI · Análisis de sistemas de control".
- [x] **"A FISI course among the electives":** `FISI 4961` (an invented code) is not in the official bag, so it no longer exists.

![aun no con prerrequisitos](assets/2026-11-02/08-aun-no-con-prerrequisitos.png)

## 6. Enablement and loading (§6)

- [x] **Re-checked with the new requisites:**
  - MAIA courses that only some master's can take are never "Puedes tomarla".
  - Interfaces hombre-máquina asks for 60 credits.
  - Taller IEE 1 asks for 15 ("no primer semestre").
- [x] **Unmarking re-evaluates:** for a semester-zero student, Electiva and CI switch off again; EFI and CLE stay on.
- [x] **Loading veil:** "Cargando la oferta de 2027-1…" instead of a list that looks all locked.

![no primer semestre](assets/2026-11-02/19-no-primer-semestre.png)
![semestre cero casillas](assets/2026-11-02/22-semestre-cero-casillas.png)
![cargando electivas](assets/2026-11-02/09-cargando-electivas.png)

## 7. Smaller fixes (§7)

- [x] **Quick selection — "¿Qué semestres ya terminaste?":** per-semester toggles (non-contiguous allowed) plus a "del I al N" shortcut. Each selection replaces the previous one.
- [x] **Spanish writing requirement:** Fundamentos de electrónica no longer shows "lectura en inglés". The cause was that the English pattern also caught LENG 1512. The group now reads "Requisito de escritura en español · uno de estos", and courses outside the plan are shown by name.
- [x] **CLE:** a better help article in the side panel; it is attest-only (never in the cart); its credits count toward the total, not toward the bags.
- [x] **Contrast:** a test checks every classification and status colour at ≥ 4.5:1, plus the new warning colours.
- [x] **Last offered is secondary** (under "Más detalles"). Next offering shows wherever offering does.

![seleccion rapida semestres](assets/2026-11-02/17-seleccion-rapida-semestres.png)
![escritura en espanol](assets/2026-11-02/18-escritura-en-espanol.png)
![curso libre eleccion](assets/2026-11-02/20-curso-libre-eleccion.png)
![proxima oferta proyectada](assets/2026-11-02/23-proxima-oferta-proyectada.png)

## 8. Periods K / K+1 and API outage (§1.4)

- [x] **Student toggle:** "Ver lo que se dicta este semestre (2026-2)" / "Planear mi próximo semestre (2027-1)".
- [x] **API down:** with the department's load present, the planner **uses the loaded data instead of blocking**, with a blue notice.

![periodo k k1 y respaldo](assets/2026-11-02/01-periodo-k-k1-y-respaldo.png)
![vista semestre actual](assets/2026-11-02/24-vista-semestre-actual.png)

## 9. "Planeación" page (§8) and admin login

- [x] **`/planeacion`:**
  - electives selector, planner, and Mauricio's Genially (link pending);
  - each block has "Abrir en grande";
  - ready-to-paste snippets for the site's "Pensum" page.
  - `/portal` redirects here.
- [x] **Login:** a password pasted with a trailing space or newline now works. If his account still fails on the DSIT server, create it from the super-panel there (each server has its own accounts).

![planeacion](assets/2026-11-02/14-planeacion.png)

## 10. Round of 2026-11-03: QA pass and fixes

> [!success] QA pass (every item of the 2026-10-29 spec, in the browser)
> - Ran on a local Postgres seeded from `datos/`, driving the app in a headless browser on the Electrónica con precálculo plan.
> - **The three release gates pass.**
>   - Gate 1: the amber warning appears before adding; the orange box tops checkout; a removed corequisite is flagged.
>   - Gate 2: adding Cálculo vectorial outlines Ecuaciones diferenciales and Computación científica at once; removing it clears them.
>   - Gate 3: all six layouts of the spec's table match in the UI, and so does the sequence 3, 2, 4, 1, 4, 1, 4.
> - **Also passing:** loading veil, Spanish writing requirement, CLE, projected next offering, tags under every filter, and the two-column view with no red.
> - **Kept by design:** a course not taught in the planning period can still go in the cart. Its requisites come from the history window in `PRERREQUISITOS`. The warning "Ojo: no has aprobado … Pensar, comunicar y colaborar" is also correct: that course is the requirement's name.

### 10.1 Quick selection wording and the "unlocked" animation

- [x] **Every way into quick selection asks "¿Qué semestres ya terminaste?"** Both the welcome option and the "Selección rápida" chooser used to say "dinos qué semestre vas a cursar". The welcome picker now reads "¿Qué semestres ya terminaste? Del I al…", so choosing III pre-marks I–III.
- [x] **The "just unlocked" animation only lands on courses the map shows as available.** It used to play on courses that stayed blocked, such as Señales, Variable compleja and Fundamentos de electrónica. The cause was two different availability checks. Now the map and the animation share one status function. After marking I–III it plays on exactly the four courses that opened.

![bienvenida semestres terminados](assets/2026-11-02/25-bienvenida-semestres-terminados.png)

### 10.2 Map groups and colours from TIPO and the pensum PDF

- [x] **The group comes from the `TIPO` column of PLANES,** for courses and slots alike. It accepts the four values the file uses today (Obligatorio, Proyecto, Electiva, CBU) **or the PDF's seven categories**: Fundamentos de Ingeniería, Fundamentos Transversales IEE, Fundamentos Específicos, Ciclo Terminal, Ciclo de Ciencias y Matemáticas, Proyectos, Educación General. Case and accents don't matter.
- [x] **The legend and filter chips** list only the groups the plan has, with the file's names.
- [x] **Colours are the PDF's,** darkened only as far as white text needs (≥ 5.5:1). Each group keeps a shape glyph as a second cue.
  - Fundamentos de Ingeniería is **olive**: the PDF green at that darkness is the "aprobada" green, 1.11:1 apart.
  - The generic "Obligatorio" keeps the app's teal.
  - Electiva takes Ciclo Terminal's pink, and CBU takes Educación General's purple.
- [x] **The importer warns** when a file mixes "Obligatorio" with PDF categories, because they would share a colour family on the map.
- [x] **Editable in the admin:** the catalogue editor has a "Grupo" field, which can be pinned against re-imports.
- [x] **Re-imports fill it in:** the plan diff updated about 270 rows with no conflicts, so no rebuild is needed.
- [x] **Contrast test:** it also checks every group's secondary text (≥ 4.5:1) and that the olive stays apart from "aprobada".
- [x] **Long legends wrap:** with seven names the toolbar wraps to two rows on desktop; on a phone it stays one row that scrolls sideways.

![grupos desde tipo](assets/2026-11-02/26-grupos-desde-tipo.png)
![grupos categorias pdf](assets/2026-11-02/27-grupos-categorias-pdf.png)

*The second capture is a preview: one plan's TIPO was set to the PDF's categories in a test database.*

### 10.3 Mi avance: status filters and the cart button

- [x] **Status filters: Aprobadas · Disponibles · Canasta · Desbloqueadas con canasta.** "Regla administrativa" and "Bloqueadas" are gone.
  - Nothing is selected by default.
  - Tapping one or more filters lights up only those courses and dims the rest.
  - "Desbloqueadas con canasta" covers what the cart opens this semester (by corequisite) or the next. With Cálculo vectorial in the cart it lights Señales, Variable compleja, Ecuaciones diferenciales and Computación científica.
- [x] **"Revisar mi canasta" stays at the bottom left once the cart has something in it,** in Explorar and Mi avance, with a course open, in quick selection, and with the planner panel open.

![filtros de estado](assets/2026-11-02/28-filtros-de-estado.png)
![canasta siempre visible](assets/2026-11-02/29-canasta-siempre-visible.png)

### 10.4 Electives widget: summary bar and role matrix

The Venn diagram spent its whole area on 36 shared courses and couldn't show the electiva / integrador distinction. Four alternatives were prototyped on the real bag, and **A, a summary bar plus a role matrix,** was chosen.

- [x] **Summary bar:** drawn to scale, and each part filters the list.
  - With "Ambos" it splits by program: 36 in both · 1 solo Electrónica · 1 solo Eléctrica.
  - With one program it splits by role: 29 solo electiva · 6 electiva + integrador · 2 solo integrador.
- [x] **Role matrix:** one row per course, with ● electiva and ◆ integrador per program in the PDF's Ciclo Terminal pink.
  - Where a course doesn't count, the program cell shows a dashed "no aplica", never red.
  - The two courses that differ between programs come first, tinted. Then electiva + integrador, solo integrador, solo electiva.
- [x] **"Se dicta" column:** green for K / K+1, amber for the projected period, grey for "por definir".
- [x] **Kept from §4:** filters (Programa, Tipo, Se dicta en), search, inline detail and "Planear con esta materia". Existing links (`?programa=`, `?tipo=`, `?periodo=`) work unchanged.
- [x] **Built for an iframe:** it reflows by its own width, with one card per course on a phone. Checked at 1100, 700 and 390 px with no sideways scroll. The admin page now calls it "Selector de electivas".

![selector electivas](assets/2026-11-02/30-selector-electivas.png)
![selector electivas celular](assets/2026-11-02/31-selector-electivas-celular.png)

> [!success] Verification (2026-11-03)
> - `npm run test`: **236 ✅ · 0 ❌** (12 skips need a scratch DB).
> - `tsc --noEmit` ✅. `npm run build` ✅.
> - New tests cover TIPO parsing (generic + PDF categories, the mixed-nomenclature warning, the golden PLANES), the role matrix (order, summary, search) and the contrast of every group colour.

---

## Questions for Mauricio

> [!question] IELE-2110 Transición energética
> In BOLSAS its PROXIMO is **SEM**, but your email says it is annual, in second semesters. It has no requisites, so it is not in the export. Today the app says "sin dato" for 2027-1 rather than guessing. Should PROXIMO be **202720**?

> [!question] Taller IEE 1
> The file says "EXCLUYE INGRESA A PRIMER SEMESTRE", which means 15 credits. In the meeting we said "excludes 1st **and 2nd** semester", which would be 30. Which one is right?

> [!question] PROXIMO for courses taught in 2027-1
> Robótica has a row in 2027-1 and PROXIMO = 202810. Taller de sistemas de potencia has a row in 2027-1 and PROXIMO = **202710**. We read PROXIMO as "the next projected offering" and show it as is. Should it always be the one **after** the planning period?

> [!question] Colours of the pensum PDF (update 2026-11-03)
> We now have the PDF (`ielc2026pc52`), and its colours are in the app (§10.2). The Excels still carry no classification, so the map shows TIPO's four groups. Can you write the PDF category of each course in the **TIPO** column of PLANES (for example "Fundamentos Transversales IEE")? Everything else follows on the next load.

> [!question] EXMA1 / EXDO1
> We show them as "ser estudiante de maestría / doctorado". Is that the right meaning?

> [!question] Things built as the spec's *proposals* — keep them?
> - When the API is down, fall back to your data instead of blocking.
> - An amber warning (not red).
> - An explicit "Electivas" filter.
> - In the elective box, both "Agregar electiva sin especificar" and "the cart holds the course".
> - The electives widget keeps inline detail **and** the planner link. Since 2026-11-03 it is a summary bar plus a role matrix instead of the Venn (§10.4).

> [!question] Master's plans and the Genially
> MIELE/MIELC are loaded as drafts: publish them? And can you send the Genially link?

> [!question] Semester credit cap (18 / 21)
> Not built yet. Should we warn when a cart goes over? CLE credits complicate it.

- [ ] Answer: IELE-2110 projection
- [ ] Answer: Taller IEE 1 restriction (15 or 30 cr)
- [ ] Confirm: PROXIMO semantics
- [x] ~~Send: pensum PDF~~ (received 2026-11-03)
- [ ] Fill: the PDF category in PLANES' TIPO column
- [ ] Send: Genially link
- [ ] Confirm: EXMA1 / EXDO1
- [ ] Decide: proposals listed above, master's drafts, credit cap

## Deploy (DSIT 2026-11-04)

> [!warning] Steps
> 1. `npm run db:deploy`: new migrations `official_load` and `catalog_course_category` (2026-11-03, one nullable column), plus the two from the previous round if they are not applied yet. The MySQL branch (`mysql-migration`) needs its own version of `catalog_course_category`.
> 2. Either load the three files from **/administrador/carga** (choose 2027-1), or run `npm run seed` with them in `datos/`. Run it again on a server that already had the 2027-1 load, so the map groups come from TIPO; until then they are derived from the course type.
> 3. Create Mauricio's account on that server: the first-time setup, or the super-panel.
> 4. Optional: set `NEXT_PUBLIC_GENIALLY_URL` and `NEXT_PUBLIC_SITE_URL`.

## Not verified here

> [!note]
> The sandbox can't reach the course API. The paths where the API **answers** were not exercised: the API offering winning over the file's, and live sections in the cart. The fallback paths were.
