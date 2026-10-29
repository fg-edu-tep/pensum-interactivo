---
title: Revisión con Mauricio Guerrero — changelog
date: 2026-10-29
tags:
  - pensum-iele
  - changelog
  - revision-mauricio
branch: claude/loving-edison-ftxjls
commit: 2dea8d4
status: en-revision
aliases:
  - Changelog 2026-10-29
---

# Revisión con Mauricio Guerrero — 2026-10-29

> [!summary]
> Everything agreed or proposed in the review is built. It covers future planning with checkout step 0, elective slots enabled by requirement, half-box electives, Registro restrictions converted to credits, offering dates, an API outage check, a Venn rework and a portal proposal.
> Full engineering write-up: [[2026-10-29-review]] · Previous round: [[2026-10-feedback-round]]

## Decisions taken

> [!info] Confirmed with the product owner
> - **CLE and CI** are enabled *by requirement*, like the other electives. CLE has no closed catalog, so it's always open.
> - The admin **credit-threshold table** stays, empty by default.
> - The outage guide links to Registro's *"¿Cómo hacer mi horario?"* for now.

## Changes

### 1. Future planning + checkout step 0
- [x] The available courses update live with the cart: a correquisite in the cart makes its course available (e.g. *Variable compleja* → *Elementos*, *TEM*).
- [x] **Step 0** of "Revisar mi canasta": *Puedes agregarlas este mismo semestre* / *Podrás verlas el próximo semestre* (with "se habilita con …").
- [x] **"La vas a poder ver"**: a blue outline on the map, never a fill. It's cleared when the cart changes.
- [x] Buying without requirements is allowed, with the warning *"Ojo: no has aprobado X"*.

### 2. Elective slots by requirement
- [x] **EFI** and **CLE** are always enabled, with "Verifica sus prerrequisitos".
- [x] **Electiva / CI** are enabled when ≥ 1 course of the slot's catalog can be taken now.
- [x] A catalog with no data stays enabled. Electives with no data say *"Verifica prerrequisitos"*.
- [x] Master's-only electives are blocked for pregrado plans.
- [x] The credit-threshold defaults are retired.

### 3. Half-box elective subdivision
- [x] Each elective box = two 1-credit halves. *k* credits fill *k* halves forward.
- [x] "(cont.)" on the next box, "Libre · 1 cr" for a free half, tooltip *"Esta materia vale 4 créditos y ocupa 2 casillas"*.
- [x] Boxes always read "2 cr". No reflow. Overflow shows *"+N cr por encima"*.

### 4. Data
- [x] **4a** "Excluye semestres 1–n" → `minCredits = 15 × n`. Requirement tree: *"60 créditos aprobados (equivale a 4 semestres)"*.
- [x] **4b** The latest term wins, plus a coverage report in the seed.
- [x] **4c** Last offered (Registro) and next planned offering (department, editable in admin).

### 5. Copy and fixes
- [x] **5a** "Qué desbloquea" → **"Qué se me habilita"**, split into now / next semester.
- [x] **5b** CBU legend: *1 CBU Colombia · 2 CBU de áreas diferentes · 2 CBU libres*.
- [x] **5c** Quick select by semester **replaces** the previous selection.
- [x] **5d** API preflight: if the API fails, planning is disabled, with a banner and a guide link. Marking approved courses still works.

### 6. Electives Venn
- [x] Two sets (Eléctrica / Electrónica). The master's set was removed.
- [x] Filters: *Curso integrador* and *Se dicta este semestre*.
- [x] Inline detail (requirements by name, credits, restriction, last/next offering) with *"Planear con esta materia"*.

### 7. Portal
- [x] `/portal` proposal page, not linked yet.

## Questions for Mauricio

> [!question] Elective credits above the boxes
> If a student's electives add up to more credits than the boxes hold (> 8), right now we only show *"+N cr por encima"*. Is that enough, or should it count toward another slot (e.g. CLE)?

> [!question] Planning file for the next offering
> The "next offering" field exists and is editable in admin, but it starts empty. Can the department send its planning file so we can load it?

> [!question] Codes missing from Registro since 2023-10
> **IELE2150, IELE3118, IELE3218, IELE3502, MATE1201** don't appear in recent Registro data. Are they courses that are no longer offered, or are they missing from the export?

> [!question] Elective classification file
> Should the classification file (which electives count as *integrador* / *área mayor*) replace the current role columns from the 2024-I pensum?

> [!question] Portal
> Is the `/portal` proposal the right direction before we link it from the app?

- [ ] Answer: credits above the boxes
- [ ] Send: next-offering planning file
- [ ] Confirm: codes with no Registro coverage
- [ ] Decide: classification file
- [ ] Review: portal proposal

## Deploy

> [!warning] Before deploying
> 1. `npm run db:deploy`: two new migrations (`20261029135639_course_restrictions_offering_dates`, `20261029141101_elective_level_restriction`).
> 2. `npm run seed`: non-destructive; fills restrictions → credits, last offered term and elective level.
> 3. Don't set `OFERTA_PREFLIGHT` in production (it's only for local dev without network).

## Verification
- `npm run test`: 197 ✅, 0 ❌. `npm run build` ✅.
- Browser: cart → live availability, step 0, marker and its reset, half-boxes, Venn, portal and the outage banner ✅.
- Not verified: the branches that need the live API (the sandbox has no access).
