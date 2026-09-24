# Pensum Uniandes — Design Language & Element Requirements

**Direction:** C · Mixta (poster-legible map + chain in the panel + centered mode toggle)
**Scope:** Student explorer `/p/[slug]` — top bar, toolbar, map canvas, course cards, edges, side panel, Mi avance, onboarding.
**Out of scope:** Landing `/` and admin `/administrador` (they keep their current specs; see §13).
**Language:** The UI copy is in Spanish; this document is in English. Every UI string quoted here is final copy unless marked `[TBD]`.

Requirement keywords: **MUST** = required to ship; **SHOULD** = expected unless there is a documented reason not to; **MAY** = optional.
Requirement IDs (`CARD-03`, `PNL-07`, …) are stable so they can be referenced from tickets and PRs.

---

## 0. Principles

1. **One meaning per channel.** Fill color means *type of course*. The ring (halo) around a card means *status or relation*. The icon or label confirms the ring. No single visual channel carries two meanings in the same mode.
2. **Progressive disclosure.** The map shows courses first. Relations appear on selection. The full chain appears only on request. Help appears when it is needed and then stays out of the way.
3. **Context never disappears.** Dimmed elements stay legible. The student always knows where they are on the map.
4. **Words over codes.** Prerequisite logic is shown as a structure (numbered groups, "Uno de estos", "Y"), never as a raw boolean string.
5. **The poster heritage stays.** Roman-numeral semester columns, alternating bands and solid cards keep the look of the printed pensum. It is refined, not replaced.
6. **Accessible as drawn.** Real buttons and inputs. Status is never conveyed by color alone. Text contrast is ≥ 4.5:1.

---

## 1. Design tokens

Implement these as CSS custom properties on `:root`. The per-catalog accent overrides `--accent*` only.

### 1.1 Neutrals

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1f2430` | Primary text, selected ring, primary button fill |
| `--ink-2` | `#39404f` | Secondary body text |
| `--muted` | `#5b6272` | Tertiary text, meta lines (6.2:1 on white) |
| `--muted-2` | `#6b7280` | Labels, captions (4.8:1 on white, the minimum allowed) |
| `--line` | `#e3e6eb` | Borders of bars, panels, boxes |
| `--line-soft` | `#eef0f3` | Inner dividers |
| `--line-control` | `#dfe3e8` | Borders of chips, inputs, ghost buttons |
| `--surface` | `#ffffff` | Bars, panel, cards in the panel |
| `--surface-sunken` | `#f4f5f7` | Chain miniature, color key, inactive chip fill |
| `--canvas` | `#f7f8fa` | Map background, search field fill |
| `--canvas-dot` | `#e2e5ea` | Dotted grid: 1px dots every 16px |
| `--band-a` | `#eceef2` | Odd semester bands (I, III, V, …) |
| `--band-b` | `#f2f3f6` | Even semester bands |
| `--seg-track` | `#eceef2` | Track of the large mode toggle |
| `--seg-track-sm` | `#eef0f3` | Track of small segmented controls |

### 1.2 Accent (per catalog)

| Token | Default (IELE / Doble) | Use |
|---|---|---|
| `--accent` | `#1f6fc4` | Top rule, links, prerequisite edges and rings, requirement numbers, planned tag (5.1:1 on white) |
| `--accent-hover` | `#16528f` | Link hover |
| `--accent-tint` | `#e8f1fb` | Selected OR option, counter badge fill |
| `--accent-border` | `#b9d3f0` | Checklist button border |
| `--accent-soft` | `#8fb1dd` | Chain (indirect) edges and rings, hover preview edges |

Each catalog MAY override `--accent`, `--accent-hover`, `--accent-tint`, `--accent-border` and `--accent-soft`. It MUST keep ≥ 4.5:1 for `--accent` on white. The course-type colors (§1.3) do **not** change per catalog.

### 1.3 Course-type colors (fill channel)

Solid fills carry white text. Contrast is measured with white text.

| Type | Token | Fill | Contrast | Who belongs |
|---|---|---|---|---|
| IELE (department) | `--t-iele` | `#0e6b70` | 6.3:1 | Núcleo courses with prefix `IELE` |
| Ciencias básicas | `--t-cb` | `#7a5212` | 6.9:1 | Núcleo courses with prefix `MATE`, `FISI` |
| Otras facultades | `--t-otr` | `#4a4f5a` | 8.2:1 | Other núcleo courses (`IIND`, `ISIS`, `DERE`, `ESCR`, …) |
| Proyecto | `--t-pro` | `#2356c4` | 6.6:1 | Área = proyecto |
| Electiva (slot) | `--t-ele` | `#a01d5d` | 7.2:1 as text | Elective slots (outline only) |
| CBU (slot) | `--t-cbu` | `#3d33a0` | 9.2:1 as text | CBU slots (outline only) |
| Requisito de grado | `--t-req` | `#4a5568` | — | Non-course requirements (outline only) |

> **Data requirement (DATA-01):** the grouping into IELE / Ciencias básicas / Otras facultades MUST come from a `grupo` field on the course, editable in admin. The prefix rule above is only the default when the field is empty. `[TBD: confirm the official component names with the department.]`

### 1.4 Status colors (ring channel, Mi avance)

| Status | Token | Value | Paired with |
|---|---|---|---|
| Disponible | `--st-available` | `#16a34a` | Ring only |
| Le falta 1 | `--st-one` | `#d97706` | Ring + tag "falta 1" (`#b45309`, 5.0:1 with white) |
| Regla administrativa | `--st-admin` | `#d97706` | Ring + lock icon + hatch |
| Bloqueada | `--st-blocked-a` / `-b` | `#eef0f3` / `#e3e6ea` | 135° hatch, 6px stripes, text `#5b6272`, border `#c9ced6` |
| En tu plan | `--st-planned` | `--accent` | Tag with the term ("2027-1") |

**Approved tints** (fill replaces the solid color; a check icon is required):

| Type | Background | Text |
|---|---|---|
| IELE | `#d9ecec` | `#0b4f53` |
| Ciencias básicas | `#f1e6d4` | `#5e3f0d` |
| Otras facultades | `#e7e9ef` | `#353a44` |
| Proyecto | `#dde6f7` | `#1d4596` |
| CBU slot | `#e7e5f6` | `#342c8a` |

### 1.5 Semantic surfaces

| Use | Background | Border | Text / dot |
|---|---|---|---|
| Offered this term | `#f3faf5` | `#d4ebdc` | dot `#16a34a` |
| Not offered | `--surface` | `--line` | dot `#9aa1ad` |
| Stale offering data | `#fdf8ef` | `#f1e0c2` | dot `#d97706` |
| Corequisite label | — | — | `#a45f06` |
| Unlock insight | `#f0fdf4` | `#cdebd6` | text `#1f5134` |
| Setup summary | `#eef7f7` | `#cfe5e6` | text `#0b4f53` |

### 1.6 Typography

- **Sans:** `"IBM Plex Sans", system-ui, sans-serif` with weights 400 / 500 / 600 / 700.
- **Mono:** `"IBM Plex Mono", ui-monospace, monospace` with weights 500 / 600. Use it for course codes, credits, counters, terms and keyboard hints only.
- Load both from Google Fonts with `display=swap`.
- **Case:** sentence case everywhere. Uppercase is allowed only for *labels* (`.lbl`, ≤ 3 words, with letter-spacing). Course titles MUST be converted from the uppercase source to sentence case, keeping accents and acronyms (IEE, SD, IELC) — see DATA-02.

| Role | Size / line-height | Weight | Family | Notes |
|---|---|---|---|---|
| Panel title (h2) | 22 / 1.2 | 700 | Sans | `text-wrap: pretty` |
| Top-bar plan name | 16 / 1.2 | 700 | Sans | |
| Section heading (h3) | 13 / 1.3 | 700 | Sans | Hint beside it: 11.5 / 500 / `--muted-2` |
| Body | 13.5 / 1.5 | 400–500 | Sans | |
| Small body | 12.5 / 1.4 | 400 | Sans | |
| Label | 11 / 1 | 600 | Sans | Uppercase, 0.06em tracking, `--muted-2` |
| Kicker | 10 / 1 | 600 | Mono | Uppercase, 0.08em tracking, `--accent` |
| Card title | 12 / 1.22 | 600 | Sans | Clamped to 2 lines |
| Card code line | 10 / 1 | 500 | Mono | 0.92 opacity |
| Band numeral | 18 / 1 | 700 | Sans | Roman numerals |
| Band credits | 10.5 / 1 | 500 | Mono | `--muted-2` |

### 1.7 Spacing, radius, elevation

- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24 px. Siblings are always laid out with flex/grid `gap`, never with margins.
- **Radius:** card 8 · button/input 8–9 · panel box 10–12 · tooltip 12 · large toggle track 12 (thumb 9) · small toggle track 9 (thumb 7) · chips and pills 999.
- **Elevation:**

| Level | Shadow | Use |
|---|---|---|
| e0 | none | Slots, approved/blocked cards |
| e1 | `0 1px 2px rgba(16,24,40,.14)` | Filled course cards |
| e2 | `0 2px 8px rgba(16,24,40,.08)` | Zoom controls, map chips |
| e3 | `0 6px 18px rgba(16,24,40,.25)` | Floating selection bar |
| e4 | `0 12px 32px rgba(16,24,40,.18)` | Tooltips, coach marks |
| Selected | `0 0 0 2px #fff, 0 0 0 4px var(--ink), 0 10px 24px rgba(16,24,40,.28)` | Selected card |

### 1.8 Iconography

- Inline SVG, 16×16 viewBox, `fill: none`, `stroke: currentColor`, stroke-width 1.75 (2–2.5 when rendered at ≤ 12px), round caps and joins.
- Required set: back, chevron-down, chevron-right, search, share, help (?), close, plus, minus, fit, check, lock, arrow-right, external, pointer.
- **Emoji MUST NOT be used as UI glyphs.** This includes the current 🔒, which becomes the lock icon.

---

## 2. Page layout

```
┌──────────────────────────── Top bar (64) ────────────────────────────┐
│ ← │ PENSUM · DOBLE PROGRAMA        [ Explorar | Mi avance ]   🔍 … ? ⇪ │
├──────────────────────────── Toolbar (48) ────────────────────────────┤
│ MOSTRAR  [IELE][C. básicas][Otras][Proyecto][Electivas][CBU] │ RELACIONES [Directas|Cadena] … legend │
├───────────────────────────────────────────────┬──────────────────────┤
│                 Map canvas (flex)             │  Side panel (400)    │
│  I   II   III  IV   V   VI   VII  → VIII–IX   │                      │
│                                               │                      │
│ [zoom]        (floating selection bar)        │  sticky footer       │
└───────────────────────────────────────────────┴──────────────────────┘
```

- **LAY-01** The page MUST fill the viewport with no page scroll. Only the canvas (pan/zoom) and the panel body (vertical) scroll.
- **LAY-02** Target width is 1280–1920 px. Below 1100 px the panel MUST become an overlay drawer (see §12).
- **LAY-03** The canvas MUST keep the dotted grid background (`--canvas-dot`, 1px every 16px) and have no minimap.

---

## 3. Top bar

Height 64px including a 3px `--accent` top rule. White background, 1px `--line` bottom border, 20px horizontal padding, 12px gap.

| ID | Element | Requirements |
|---|---|---|
| NAV-01 | Back to plans | 36×36 icon button with `aria-label="Volver a planes"`. It navigates to `/`. |
| NAV-02 | Plan switcher | One button with two lines: kicker `PENSUM · <VARIANTE>` (mono, 10px, `--accent`) and the plan name (16px/700) plus a chevron. It opens the grouped plan popover. It replaces the separate right-side dropdown, which MUST be removed. |
| NAV-03 | Mode toggle | See §3.1. It MUST be centered on the viewport (absolute, `left: 50%`), not on the leftover space. |
| NAV-04 | Search | 270×38 field on `--canvas` with a search icon, placeholder "Buscar curso o código" and a `/` keyboard hint. Pressing `/` MUST focus it from anywhere. Results filter and highlight on the map (§6.6). It is always visible; the magnifier-to-expand pattern MUST be removed. |
| NAV-05 | Checklist de grado | Ghost button in accent (`--accent` text, `--accent-border` border) with a mono counter pill "n/3". It opens the existing graduation checklist modal. The counter MUST reflect checked attestations. |
| NAV-06 | Help | 36×36 icon button with a "?" and `aria-label="Ver guía de uso"`. It restarts the guided tour (§10.2). |
| NAV-07 | Share | 36×36 icon button with `aria-label="Compartir"`. It opens the existing share flow. |

### 3.1 Mode toggle (Explorar / Mi avance)

- Track `--seg-track`, 4px padding, radius 12, 2px gap between options.
- Options are 36px tall, 22px horizontal padding, 14.5px/600. Inactive options use `--muted`. The active option has a white thumb, `--ink` text and `0 1px 3px rgba(16,24,40,.16)`.
- **NAV-08** Build it as `role="group"` with `aria-label="Modo"` and two `<button aria-pressed>`.
- **NAV-09** Switching mode MUST keep the current selection, zoom and pan.
- **NAV-10** Switching MUST animate the thumb over 160ms ease-out (none under reduced motion). The map transitions card styles over 200ms.
- **NAV-11** The first switch to Mi avance with no saved progress MUST open the setup sheet (§10.3).
- **NAV-12** The mode MUST live in the URL (`?modo=avance`) so it can be shared and survives a reload.

---

## 4. Toolbar

Height 48px, white, 1px `--line` bottom border, 20px padding, 8px gap. Its content depends on the mode.

### 4.1 Explorar toolbar

| ID | Element | Requirements |
|---|---|---|
| TB-01 | "MOSTRAR" label | `.lbl` style. |
| TB-02 | Type filter chips | One chip per type: IELE, Ciencias básicas, Otras facultades, Proyecto, Electivas, CBU. Each is 30px tall with radius 999, a 10×10 swatch (solid for filled types, 1.5px dashed for slot types) and 12.5px/500 text. Each is a toggle button with `aria-pressed`. **Off state:** `--surface-sunken` fill and `#8a909c` text, and the matching cards drop to 15% opacity (they are not removed, so the layout stays stable). This chip row *is* the color legend; no separate legend panel may exist. |
| TB-03 | Divider | 1×24px `--line`, 8px horizontal margin. |
| TB-04 | "RELACIONES" + segmented | Small segmented control: track `--seg-track-sm`, 30px options, 13px/600, `--ink` thumb with white text when active. Options are "Directas" (default) and "Toda la cadena". The setting MUST be remembered per viewer in localStorage (wrapped in try/catch). |
| TB-05 | Edge legend | Right-aligned inline samples: "Prerrequisito" (solid accent line with an arrow) and "Correquisito" (amber dashed line). 12px text in `--ink-2`. |

### 4.2 Mi avance toolbar

| ID | Element | Requirements |
|---|---|---|
| TB-10 | "ESTADO" label | `.lbl`. |
| TB-11 | Status filter chips | Aprobadas · Disponibles · Les falta 1 · Bloqueadas · Regla administrativa. Each chip has a 14×14 marker that repeats the card treatment (tint + check, green ring, amber ring, hatch, lock) and a mono count. They toggle like TB-02. Counts MUST update live. |
| TB-12 | Selección rápida | Ghost button, 32px, with a checkbox icon. It enters the existing multi-select flow. In that flow the toolbar becomes a green action bar with a "Terminar (N)" CTA (behavior unchanged). |

---

## 5. Map canvas

### 5.1 Grid geometry

These are the canvas coordinates at 100% zoom. Edge routing depends on them (§7).

| Constant | Value |
|---|---|
| Canvas inset | left 20, top 16 |
| Column (band) width | 164 |
| Column gap | 4 → column pitch 168 |
| Band header height | 52 (+ 8 padding above the first card) |
| Card size | 148 × 60 |
| Card inset in band | 8 left and right |
| Row gap | 10 → row pitch 70 |
| Card origin | `x = 28 + 168·i`, `y = 76 + 70·j` |

- **MAP-01** Rows MUST be packed with no empty cells. The current empty cell in semester V is removed.
- **MAP-02** Card positions come from `(semestre, orden)` in the data. Row order within a semester SHOULD place courses that share a chain in nearby rows (admin-editable `orden`).

### 5.2 Semester bands

- Radius 12. They alternate `--band-a` / `--band-b` starting with `--band-a` for I. Band height = header + rows + 16px bottom padding, with all bands equal to the tallest.
- Header: Roman numeral (18/700), then a credits line (mono 10.5, `--muted-2`): Explorar shows "`N` créditos"; Mi avance shows "`aprobados` / `total` cr" plus a 64×4 progress bar (track `#d8dce2`, fill `--t-iele`).
- **MAP-03** Headers SHOULD stick to the top of the canvas viewport while the map pans vertically.

### 5.3 Viewport and navigation

- **MAP-04** Initial view: 100% zoom, scrolled so semester I is at the left edge. If a course is deep-linked (`?curso=IELE3102`), center on it instead.
- **MAP-05** Columns cut off at the right edge MUST fade into a 88px gradient to `--canvas`. A chip ("VIII–IX →") pans to the hidden semesters. The same applies at the left edge ("← I–II").
- **MAP-06** Zoom controls sit bottom-left, 16px from the edges: a vertical stack of three 40×40 buttons (Acercar, Alejar, Ajustar a la pantalla), white, radius 10, e2. Zoom range 40–200%.
- **MAP-07** Keyboard: arrow keys move the focus between cards (grid navigation). Enter selects. Esc clears the selection. `+`/`−` zoom. `0` fits.
- **MAP-08** Clicking empty canvas clears the selection.

### 5.4 Floating selection bar

- Pinned bottom-center, 20px from the bottom. 40px tall, radius 999, `--ink` background, white 13px text, e3.
- Content: mono code (bold) · a summary · a "Limpiar  Esc" button (30px pill, `rgba(255,255,255,.14)`).
- Summary copy:
  - Directas: "`n` requisitos directos · desbloquea `m`". When `m = 0`: "nada depende de ella".
  - Toda la cadena: "`n` requisitos en la cadena · `d` directos".
- **MAP-09** It is shown only while a course is selected, and hidden during the tour.

---

## 6. Course card

### 6.1 Anatomy

```
┌───────────────────────────────┐  148 × 60, radius 8, padding 7/9/8, gap 4
│ IELE 3102              3 cr   │  ← code line: mono 10/500, 0.92 opacity; status icon before credits
│ Análisis de sistemas de       │  ← title: sans 12/600, sentence case, max 2 lines
│ potencia                      │
└───────────────────────────────┘
   ●  number badge (top-right, -9/-9) or tag (top, right 6)
```

- **CARD-01** The card MUST be a `<button type="button">`. Its accessible name is "`<código>` `<título>`, `<créditos>` créditos, `<estado/relación>`".
- **CARD-02** The title MUST be clamped to 2 lines with an ellipsis. The full title goes in the hover tooltip and the panel.
- **CARD-03** Credits read "`n` cr". For 0 credits show "—".
- **CARD-04** The bottom "NÚCLEO / ELECTIVA / CBU" strip MUST be removed; the type is carried by color.

### 6.2 Variants by type (Explorar)

| Variant | Background | Border | Text | Code line |
|---|---|---|---|---|
| IELE / C. básicas / Otras / Proyecto | Type fill (§1.3) | none | white | course code |
| Electiva slot | white | 1.5px dashed `--t-ele` | `--t-ele` | "Cupo `k` de `N`" (numbered across the plan) |
| CBU slot | white | 1.5px dashed `--t-cbu` | `--t-cbu` | "CBU" |
| Other slots (ESCR, MATE ED, Curso integrador) | white | 1.5px dashed in their type color | type color | the slot's code |
| Requisito de grado | white | 1.5px dashed `--t-req` | `--t-req` | "Req. de grado" |

- **CARD-05** Requirement cards (e.g., English reading) MUST NOT draw edges. They appear as a numbered requirement in the panel of each course that needs them (§8.4).
- **CARD-06** Slot titles are the slot's name ("Electiva IELE"). When the student has picked an elective in Mi avance, the slot shows that course's code and title with a solid border in the slot color.

### 6.3 Relation states (Explorar, a course selected)

| State | Treatment | When |
|---|---|---|
| Selected | Selected elevation (white 2px + `--ink` 4px ring + drop shadow) | The clicked course |
| Direct prerequisite | `0 0 0 2px #fff, 0 0 0 4px var(--accent)` + number badge | It is in one of the course's requirement groups |
| In the chain (Directas) | Opacity 0.82, no ring | An indirect ancestor |
| In the chain (Toda la cadena) | Full opacity + `0 0 0 2px #fff, 0 0 0 3.5px var(--accent-soft)` | An indirect ancestor |
| Unlocks (dependent) | 4px ring in `--st-available` (sole prerequisite) or `--st-one` (one of several) | Direct dependents (current behavior, kept) |
| Unrelated | Opacity 0.34 + `saturate(.3)` | Everything else |
| Hovered (no selection) | Selected-style ring without the drop shadow | Pointer over a card |

- **CARD-07** Number badge: 20px circle, `--accent` fill, white 11px/700, 2px white outline, positioned at top −9 / right −9. The number MUST match the requirement number in the panel.
- **CARD-08** For an OR group, only the alternative that exists in this pensum gets a badge on the map. The others are listed in the panel as "fuera de este pensum".
- **CARD-09** Dimmed cards MUST stay readable (text contrast ≥ 3:1 after the opacity is applied).

### 6.4 Status states (Mi avance)

| State | Fill | Ring | Icon / tag | Notes |
|---|---|---|---|---|
| Aprobada | Approved tint (§1.4) | none | check (11px, stroke 2.5) before credits | Elevation e0 |
| Disponible | Type fill | 4px `--st-available` | — | |
| En tu plan | Type fill | 4px `--st-available` | Tag with the term, e.g. "2027-1" | Accent tag |
| Le falta 1 | Type fill | 4px `--st-one` | Tag "falta 1" | Tag `#b45309` |
| Bloqueada | Hatch (§1.4) | none | — | Text `#5b6272` |
| Regla administrativa | Hatch | 4px `--st-admin` | lock icon before credits | Tooltip explains the rule |
| Recién desbloqueada | Type fill | green ring that pulses | Glare sweep | §6.5 |

- **CARD-10** Every status MUST be distinguishable without color: the check, tag text, lock and hatch give each state a distinct shape. Test this with a grayscale filter.
- **CARD-11** Tag: 17px tall, radius 999, 9.5px/600 white text, 2px white outline, positioned at top −9 / right 6. At most one tag per card; priority is planned > falta 1.
- **CARD-12** In Mi avance, selecting a course still applies the relation states of §6.3 on top of the status. The ring shows relation while selected and status otherwise.

### 6.5 Unlock animation

- Trigger: the "Terminar" action in quick selection, or marking a course approved, newly makes other courses available.
- 1.9s ease-out, played once. The ring grows from transparent to `--st-available` with a 22px outer glow at 35%, then settles. At the same time a diagonal white glare (115°, 50% alpha) sweeps from −120% to +120% across the card.
- **CARD-13** It MUST NOT play under `prefers-reduced-motion: reduce`; the final state is shown immediately instead.
- **CARD-14** A polite `aria-live` message MUST announce it: "Se desbloquearon `n` cursos: …".

### 6.6 Search highlighting

- **CARD-15** While the search field has a query, matching cards get the hovered ring and non-matching cards dim as "unrelated". Enter selects the first match and centers it. The result count shows in the field ("3 resultados").

---

## 7. Edges

### 7.1 Styles

| Edge | Stroke | Pattern | End |
|---|---|---|---|
| Direct prerequisite | 2px `--accent` | solid | 7px filled arrowhead |
| Chain (indirect) | 1.75px `--accent-soft` | solid | 7px arrowhead in `--accent-soft` |
| Corequisite | 2px `#d97706` | dashed 4/3 | none |
| Hover preview | 1.75px `--accent-soft` | dashed 5/4 | arrowhead |
| Bus junction | 3px-radius dot in the edge color | — | — |

### 7.2 Routing

- **EDGE-01** Edges MUST be orthogonal and run only through the gaps: the 20px column gutter and the 10px row gutter. They MUST never cross a card.
- **EDGE-02** Route for source `(i1, j1)` to target `(i2, j2)` with `i2 > i1`:
  - Start at the source's right edge, mid-height: `x = 176 + 168·i1`, `y = 106 + 70·j1`.
  - Move right into the column gutter (lane offset +10 for direct edges, +5 for chain edges).
  - If the target is in the next column, go vertically to the target row. Otherwise go vertically to the row gutter above the target row (`y = 71 + 70·j2`), run horizontally to the gutter before the target column, then go vertically to the target row.
  - End at the target's left edge minus 3px, where the arrowhead goes.
- **EDGE-03** Edges that meet the same target MUST merge into one bus. A junction dot marks each merge point, and there is a single arrowhead into the target.
- **EDGE-04** Paint order: chain edges, then direct edges, then cards.
- **EDGE-05** Default state (nothing selected): no edges. Hover: preview edges for the hovered course only. Selected with Directas: direct edges only. Selected with Toda la cadena: direct edges plus chain edges.
- **EDGE-06** Same-column requirements (e.g., the English requirement in V pointing to IELE 3102 in V) MUST NOT be drawn (see CARD-05).

---

## 8. Side panel — course detail

400px wide, white, 1px `--line` left border. It has three regions: a header, a scrolling body and a sticky footer. A chevron tab on its left edge collapses it to 0 (existing behavior, kept).

### 8.1 Header (padding 18/24/16, `--line-soft` bottom border)

| ID | Element | Requirements |
|---|---|---|
| PNL-01 | Context line | 9×9 type swatch + "`Tipo` · `Área` · Semestre `N`" (12.5px, `--muted`). A 32×32 close button sits on the right. |
| PNL-02 | Title | h2, 22/1.2/700, sentence case, no clamping. |
| PNL-03 | Meta row | Mono code (600, `--ink`) · "`n` créditos" · restrictions (e.g., "Solo pregrado"), 13px `--muted`. |

### 8.2 Chain miniature (the first element of the body)

- A box on `--surface-sunken`, radius 12, 12/14 padding.
- Grid `1fr 16px auto 16px 1fr`: **Necesitas** → **Esta** → **Desbloquea**.
- Column labels use `.rl` (9.5px uppercase).
- "Necesitas": one mini chip per requirement (24px tall, mono 11px, white, `--line-control` border) led by a 14px number circle. Show at most 4; beyond that show "+ `n` más".
- "Esta": a chip filled in the course's type color, 30px tall.
- "Desbloquea": dependent chips in the same style. When there are none: "Nada, es fin de cadena" (12px `--muted-2`).
- In Toda la cadena mode, a line "+ `n` antes en la cadena" in `#4b6fa0` is added under Necesitas.
- **PNL-04** Every mini chip is a button. Clicking it selects that course and pans the map to it.
- **PNL-05** Mi avance adds a status dot to each chip (check / green ring / hatch).

### 8.3 Offering

- A row box, radius 12, using the semantic surfaces of §1.5. It holds an 8px dot and "**`term`** · `n` sección(es) · `n` cupos · `n` sem · `ATTR`".
- States: offered (green) · not offered this term ("No se dicta en `term`", grey) · stale data ("Oferta `term` aún no publicada", amber).
- **PNL-06** The data source line ("Según la oferta 202620") MUST appear in the footer note or as the offering box's `title`.

### 8.4 Requirements ("Para inscribirla necesitas")

- h3 with the hint "aprobar antes".
- One row per AND term: a 22px number circle (accent) + a box (white, `--line` border, radius 10, 8/12 padding).
- **Single course:** mono code in accent, a space, then the title (13.5/500).
- **OR group:** label "UNO DE ESTOS" (`.rl`), then a wrap of pill options (26px, radius 7, mono 11.5). The option in this pensum is `--accent-tint` fill with a 1.5px inset accent ring and text "`CÓDIGO` · `Título`". Others are `#f1f3f6` / `--muted-2` with the code only; their tooltip says "fuera de este pensum".
- **Non-course requirement:** title + "· requisito de grado" in `--muted-2`.
- Between rows: a "Y" connector (11px/700, `--accent`, 0.08em tracking).
- **PNL-07** The requirement text MUST be parsed from the API's boolean expression into this tree. The raw string MUST NOT be shown. If parsing fails, fall back to the raw string with a "Formato no reconocido" note and log the error.
- **PNL-08** Numbers MUST match the map badges (CARD-07).
- **PNL-09** Requirements that are outside the pensum graph (language, placement exams) are listed as their own numbered rows. The existing note "También exige requisitos fuera de este pensum…" is replaced by these rows.
- **PNL-10** Mi avance: each row gets a status icon on the right (check = met, empty ring = pending). The h3 hint becomes "`n` de `m` pendientes".

### 8.5 Secondary facts

- One line: "CORREQUISITOS  `lista | Ninguno`" (label in `#a45f06`) and "DESCRIPCIÓN  Ver".
- **PNL-11** Each corequisite is a link that selects that course. The note "Debes inscribir estos componentes en el mismo periodo" appears only when there is at least one corequisite.
- **PNL-12** "Ver" expands the description inline (clamped to 6 lines, with "Ver más").

### 8.6 Footer (sticky, 14/24 padding, `--line-soft` top border)

| Mode | Primary | Secondary |
|---|---|---|
| Explorar | "Marcar aprobada" (ink button, check icon) | "Ver secciones" (ghost, external icon) → Mi Horario deep link |
| Mi avance, available | "Agregar a 2027-1" | "Ver secciones" |
| Mi avance, approved | "Desmarcar" (outline, the inverted style of the current toggle) | "Ver secciones" |
| Mi avance, blocked or one away | "Planear para `term+1`" | "Ver secciones" |

- **PNL-13** Buttons are 38px tall (MAY be 44px on touch), radius 8, 13.5/600, and split the width equally.

### 8.7 Elective / CBU slot panel

- **PNL-14** For a slot, the requirements section is replaced by the existing ElectivePicker. Keep its function: era toggle (Pensum 2024-I+ / Hasta 2023-II), term filter, search, and pick/remove rows. Restyle it with these tokens: rows are white boxes, radius 10, the course name at 13.5/600, program chips at 11px, and the depth ("profundización") line in `--muted`.
- **PNL-15** The count badge ("Electivas válidas 19") uses a mono ink pill.

---

## 9. Mi avance — planner panel

This is shown when Mi avance is active and no course is selected.

| ID | Element | Requirements |
|---|---|---|
| PLN-01 | Progress header | Label "MI AVANCE", then "**63** de 146 créditos aprobados" (34px/700 + 14px `--muted`) with the percentage in mono on the right. |
| PLN-02 | Progress bar | 10px tall, radius 5, track `#e8ebef`. Segments: approved (`--t-iele`), then planned (`--accent`, 1px white separator). Legend below it: "Aprobados", "En tu plan `term`". |
| PLN-03 | Plan header | "Plan para" + a term picker button ("2027-1 ▾") + total credits in mono on the right. |
| PLN-04 | Planned rows | 46px rows, white, `--line` border, radius 10: mono code (70px) · title (ellipsis) · "`n` cr" · a 32×32 remove button (`aria-label="Quitar del plan"`). |
| PLN-05 | Unlock insight | A green box with an unlock icon: "Con este plan se desbloquean **`n` cursos** para `term+1`: …". It MUST be computed from the graph and hidden when `n = 0`. |
| PLN-06 | Suggestions | "DISPONIBLES PARA AGREGAR · `n`". The first 4 available, unplanned courses in dashed-border rows with a "+" button. A "Ver todos" link follows. |
| PLN-07 | Credit load | SHOULD warn when the plan goes over the allowed load (amber text beside the total). `[TBD: the limit comes from the university's rules; do not hardcode it]`. |
| PLN-08 | Footer | Primary "Armar horario en Mi Horario →" (passes the planned codes) + a share icon button. |
| PLN-09 | Drag to plan | Available cards MAY be dragged onto the panel to plan them. The panel shows a dashed accent drop zone while a drag is in progress. |

- **PLN-10** Planned courses show the term tag on the map (§6.4).
- **PLN-11** The plan persists per student (the same storage as the current progress data), not only in localStorage.

---

## 10. Guidance and onboarding

Goal: a student should understand the map within 60 seconds, without reading documentation. There are three layers, and each appears only once it is relevant.

### 10.1 Layer 1 — empty-state panel and hover preview (always on)

- **ONB-01** With no course selected in Explorar, the panel shows "Cómo leer este mapa":
  - Label "EMPIEZA AQUÍ".
  - Title "Cómo leer este mapa".
  - One sentence: "Cada columna es un semestre sugerido y cada tarjeta, un curso. Todo lo demás aparece cuando lo necesitas."
  - Three step boxes, each with an ink number circle, a title and one line:
    1. "Toca un curso" — "Aquí verás qué necesitas aprobar antes y qué te desbloquea."
    2. "Directas o toda la cadena" — "Directas para saber si puedes inscribirla; la cadena completa para planear desde lejos."
    3. "Pasa a Mi avance" — "Marca lo que ya aprobaste y el mapa te muestra qué puedes ver el próximo semestre."
  - A color key ("El color es el tipo de curso") on `--surface-sunken` with the type swatches and the dashed-slot explanation.
  - Footer buttons: "Hacer el recorrido" (primary) and "Ir a Mi avance" (ghost).
- **ONB-02** Hover tooltip on any card (after a 250ms delay, instant on keyboard focus): white, e4, radius 12, 260px wide. It shows the full title (13.5/700); "`n` requisito(s) · Desbloquea `m` · `n` cr"; and a divider line with "Clic para ver su ruta completa" in accent with a pointer icon. The dashed preview edges appear at the same time (EDGE-05).
- **ONB-03** Bottom hint pill (while nothing is selected and the tour has never been completed): white, radius 999, 44px, e3, pointer icon, "Toca un curso para ver qué necesitas y qué te abre", plus an ink "Recorrido de 1 min" button. It disappears permanently after the first course selection.

### 10.2 Layer 2 — guided tour (4 steps)

It is offered on the first visit (from ONB-01 / ONB-03) and can be replayed from NAV-06.

| Step | Spotlight target | Title | Body |
|---|---|---|---|
| 1 | A course card (the first núcleo card in V) | "Empieza por un curso" | "Tócalo: se ilumina lo que necesitas antes y lo que te abre después." |
| 2 | The Relaciones segmented control | "¿Solo lo inmediato o todo el camino?" | "**Directas** muestra lo que necesitas para inscribir el curso. **Toda la cadena** suma todo lo que viene antes. Pruébalo ahora: el mapa cambia en vivo." |
| 3 | The chain miniature in the panel | "Tu ruta, resumida" | "Necesitas → esta → desbloquea. Toca cualquier código para saltar a ese curso." |
| 4 | The Explorar / Mi avance toggle | "Ahora, tu avance" | "Marca lo que ya aprobaste y te diremos qué puedes inscribir." |

- **ONB-04** Spotlight: a 6px-padded rounded ring (radius = target radius + 5) with `0 0 0 2px #fff, 0 0 0 4000px rgba(17,22,32,.55)`. The target stays interactive; everything else is inert.
- **ONB-05** Coach mark: white, e4, radius 12, 340px wide, 16/18 padding, with a 12px rotated-square arrow pointing to the target. Content:
  - Progress dots: 6px dots, with the active one as an 18×6 accent pill.
  - "`n` de 4" in mono.
  - Title (16/700) and body (13/1.5).
  - "Saltar guía" as a text button on the left; "Atrás" (ghost) and "Siguiente" (primary) on the right. The last step says "Listo".
- **ONB-06** The tour is interactive: at steps 1, 2 and 4 the student performs the action, which advances the tour automatically. "Siguiente" also works.
- **ONB-07** Build it as `role="dialog"` with a label "Recorrido, paso n de 4". Focus is trapped in the coach mark and the target. Esc skips the tour.
- **ONB-08** Completion or skipping is stored per viewer. The tour never auto-opens again.

### 10.3 Layer 3 — Mi avance setup sheet (first switch to Mi avance)

- **ONB-09** It replaces the panel (400px, with a stronger left shadow `-12px 0 32px rgba(16,24,40,.08)`). The canvas stays visible as a live preview, with a floating ink pill at the top: "Vista previa: así quedaría tu mapa".
- Content:
  - Label "PRIMERA VEZ EN MI AVANCE" and a text button "Ahora no".
  - Title "Arma tu avance en 30 segundos".
  - One line: "Dinos qué semestre vas a cursar. Marcamos lo anterior como aprobado y tú corriges lo que no."
  - "¿Qué semestre vas a cursar?" with a 9-column grid of 40px buttons (I–IX). Earlier semesters are tinted (approved tint), the chosen one is ink, the rest are white. Build it as `role="group"` with `aria-pressed`.
  - A summary box: "Se marcarán **`n` cursos** (`c` créditos) de los semestres I–`k`." This number MUST be computed.
  - Exceptions: "¿Alguno del semestre `k` aún no lo apruebas?" with checkbox rows (40px, native `<input type="checkbox">` with a `<label>`, `accent-color: --t-iele`) for the courses of the last completed semester. A link "Revisar los `n` uno por uno" follows.
  - Footer: primary "Marcar I–`k` como aprobados", then a note "Después cambias cualquier curso con un clic." and a text button "Empezar en blanco".
- **ONB-10** The map preview updates live as the semester or exceptions change. Nothing is saved until the primary action. "Ahora no" keeps Mi avance empty and shows the planner.
- **ONB-11** After confirming, play the unlock animation (§6.5) on the newly available courses and show the planner.

---

## 11. Components catalog (shared)

| Component | Spec |
|---|---|
| Icon button | 36×36 (32×32 in the panel), white, `--line` 1px, radius 8, 16px icon, `aria-label` required |
| Primary button | 38px, 0/14 padding, radius 8, `--ink` fill, white 13.5/600, 8px icon gap |
| Ghost button | Same size, white fill, `--line-control` border, `--ink` text |
| Accent ghost | Ghost with `--accent` text and `--accent-border` |
| Chip (filter) | 30px, radius 999, 0/10 padding, 6px gap, swatch 10×10 radius 3, 12.5/500 |
| Pill (meta) | 26px, radius 999, `#f1f3f6`, 12.5/500 `--ink-2` |
| Mini chip | 24px, radius 7, mono 11/500, white, `--line-control` border |
| Segmented, large | §3.1 |
| Segmented, small | Track `--seg-track-sm`, 3px padding, radius 9; options 30px, radius 7, 13/600; active `--ink`/white |
| Label | 11/600 uppercase 0.06em `--muted-2` |
| Box | White, `--line` border, radius 10–12 |
| Tooltip / coach mark | White, `--line` border, radius 12, e4 |
| Floating bar | `--ink`, radius 999, e3, white text |
| Number circle | 22px (panel) / 20px (map) / 14px (mini), accent fill, white bold numerals |

States for every interactive element:
- Hover: background shifts one step darker (`#f7f8fa` on white, `#2b3140` on ink).
- Focus-visible: `0 0 0 2px #fff, 0 0 0 4px var(--accent)`.
- Pressed: `transform: translateY(1px)`.
- Disabled: 40% opacity and `cursor: not-allowed`, with a tooltip saying why.

---

## 12. Accessibility and responsive behavior

- **A11Y-01** All text is ≥ 4.5:1, or ≥ 3:1 at 24px+ or on dimmed context cards. Verify the approved tints and hatch text at release.
- **A11Y-02** Status and relation are never color-only (CARD-10). Colors that must be told apart also differ in lightness.
- **A11Y-03** The whole map is operable with the keyboard (MAP-07). Focus order: top bar → toolbar → map (grid) → panel.
- **A11Y-04** The map has `role="application"` with `aria-roledescription="mapa del pensum"`. Each band is a `group` labeled "Semestre `N`, `c` créditos".
- **A11Y-05** Selection changes are announced politely: "`Título` seleccionado. `n` requisitos, desbloquea `m`."
- **A11Y-06** Hit targets are ≥ 44px on touch devices. On pointer devices the cards may stay 60px tall.
- **A11Y-07** `prefers-reduced-motion` disables the thumb slide, the unlock pulse, the glare and the pan easing.
- **RESP-01** From 1100 px down to 768 px the panel becomes a right drawer over the canvas (400px, e4) and opens on selection.
- **RESP-02** Below 768 px: the top bar collapses (the plan switcher becomes an icon; search becomes an icon that opens a full-width field), the toolbar becomes a horizontally scrolling chip row, and the panel becomes a bottom sheet with 3 snap points (peek 120px showing title and chain miniature, half, full). The map starts in fit-to-width at the semester of the current selection.

---

## 13. Out of scope / unchanged

- The landing catalog picker and the admin panel keep their current specs. Admin gains two fields: `grupo` (DATA-01) and ordering (`orden`, MAP-02).
- The graduation checklist modal keeps its content; only its trigger changes (NAV-05).

## 14. Data requirements

- **DATA-01** A `grupo` field per course (`iele | ciencias_basicas | otras`), editable in admin, with the prefix default.
- **DATA-02** Titles are stored as returned by the API. The UI converts them to sentence case with an exception list for acronyms (IEE, IELC, IELE, SD, CBU, EFI) and accents preserved.
- **DATA-03** Prerequisites are parsed into a tree: `AND[ course | OR[course…] | external_requirement ]`. Each OR option is flagged `inPensum: boolean`.
- **DATA-04** The dependents index (who requires this course) is precomputed per catalog. It drives "Desbloquea", impact counts and PLN-05.
- **DATA-05** Offering data carries `term`, `sections`, `seats`, `weeks`, `attributes` and `fetchedAt`. The data is stale when `fetchedAt` is older than `[TBD]` hours.

## 15. Acceptance checklist (per release)

- [ ] No emoji glyphs anywhere in the explorer.
- [ ] Grayscale screenshot of Mi avance: all six states are identifiable.
- [ ] Raw prerequisite strings never appear (PNL-07), except in the logged fallback.
- [ ] No edge crosses a card at any zoom level (EDGE-01).
- [ ] The tour completes with the keyboard only.
- [ ] The setup sheet counts match the graph for every catalog.
- [ ] Reduced-motion run: no animation plays.
- [ ] Every catalog accent passes 4.5:1 on white.

---

### Reference artboards (Design canvas "Pensum Uniandes · Rediseño UI")

| Artboard | Covers |
|---|---|
| C · Explorar — relaciones directas | §3, §4.1, §5, §6.3, §7, §8 |
| C · Explorar — toda la cadena | TB-04, §6.3 chain states, §7 chain edges |
| C · Mi avance — plan del semestre | §4.2, §6.4, §9 |
| C · Estados de tarjeta | §6 (all variants and states) |
| Guía 1 · Primer vistazo | §10.1 |
| Guía 2 · Recorrido, paso 2 de 4 | §10.2 |
| Guía 3 · Arranque de Mi avance | §10.3 |
