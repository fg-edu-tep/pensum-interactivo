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

---

## Questions for Mauricio

> [!question] IELE-2110 Transición energética
> In BOLSAS its PROXIMO is **SEM**, but your email says it is annual, in second semesters. It has no requisites, so it is not in the export. Today the app says "sin dato" for 2027-1 rather than guessing. Should PROXIMO be **202720**?

> [!question] Taller IEE 1
> The file says "EXCLUYE INGRESA A PRIMER SEMESTRE", which means 15 credits. In the meeting we said "excludes 1st **and 2nd** semester", which would be 30. Which one is right?

> [!question] PROXIMO for courses taught in 2027-1
> Robótica has a row in 2027-1 and PROXIMO = 202810. Taller de sistemas de potencia has a row in 2027-1 and PROXIMO = **202710**. We read PROXIMO as "the next projected offering" and show it as is. Should it always be the one **after** the planning period?

> [!question] Colours of the pensum PDF
> The Excels carry no colour, and we don't have the department's current pensum PDF. Can you send it so the classification colours and the legend match it exactly?

> [!question] EXMA1 / EXDO1
> We show them as "ser estudiante de maestría / doctorado". Is that the right meaning?

> [!question] Things built as the spec's *proposals* — keep them?
> - When the API is down, fall back to your data instead of blocking.
> - An amber warning (not red).
> - An explicit "Electivas" filter.
> - In the elective box, both "Agregar electiva sin especificar" and "the cart holds the course".
> - The Venn keeps inline detail **and** the planner link.

> [!question] Master's plans and the Genially
> MIELE/MIELC are loaded as drafts: publish them? And can you send the Genially link?

> [!question] Semester credit cap (18 / 21)
> Not built yet. Should we warn when a cart goes over? CLE credits complicate it.

- [ ] Answer: IELE-2110 projection
- [ ] Answer: Taller IEE 1 restriction (15 or 30 cr)
- [ ] Confirm: PROXIMO semantics
- [ ] Send: pensum PDF (colours) and Genially link
- [ ] Confirm: EXMA1 / EXDO1
- [ ] Decide: proposals listed above, master's drafts, credit cap

## Deploy (DSIT 2026-11-04)

> [!warning] Steps
> 1. `npm run db:deploy`: new migration `official_load`, plus the two from the previous round if they are not applied yet.
> 2. Either load the three files from **/administrador/carga** (choose 2027-1), or run `npm run seed` with them in `datos/`.
> 3. Create Mauricio's account on that server: the first-time setup, or the super-panel.
> 4. Optional: set `NEXT_PUBLIC_GENIALLY_URL` and `NEXT_PUBLIC_SITE_URL`.

## Not verified here

> [!note]
> The sandbox can't reach the course API. The paths where the API **answers** were not exercised: the API offering winning over the file's, and live sections in the cart. The fallback paths were.
