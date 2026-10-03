# Explorer — CSS & design choices

Short rationale for how the explorer (`/p/[slug]`) is styled. (The earlier
design and its `/v1` route have been removed.)

**Files**

| File | Role |
|---|---|
| `tokens.css` | Global `:root` design tokens + font import. Plain CSS, not a module (a bare `:root` rule isn't a valid CSS Module selector). Imported only by `PensumExplorer.tsx`. |
| `explorer.module.css` | Everything else, scoped per class (~1800 lines, numbered sections: shell, top bar, card, side panel, planner, tour…). |

## Principles

1. **Color means one thing.** Course *type* is the card fill. Relationship and
   progress state are drawn *around* the card (rings, dimming), never by
   recoloring it. So a card can always be read as "what is it" and "how does it
   relate" independently.
2. **Quiet by default, loud on intent.** Hover is a light touch (a ring + dashed
   preview edges). Full highlighting and map-wide dimming only happen on a real
   *selection* (a click). This was a reviewer ask (less visual noise) and it
   keeps the map readable at 60 cards.
3. **Tokens over literals.** Colors, lines and surfaces are CSS variables so a
   re-theme is a one-file change. There is one green (`--st-ok`) and one amber
   (`--st-warn`); edge colors are read from `--edge-prereq` / `--edge-coreq` at
   runtime (`useEdgeColors` in `MapCanvas.tsx`).
4. **What a course unlocks is opt-in.** A student deciding what to take cares
   about what they NEED first; the forward direction (and partial unlocks
   especially) is a second, noisier question. The selection card at the bottom
   of the map has three plain-language checkboxes, each with a count:
   **Qué necesito** (prerequisites — on by default), **Qué desbloquea** (the
   courses this one opens *by itself*, i.e. it is their only prerequisite —
   solid green) and **Qué depende de él** (the niche "how relevant is this
   course?" view: every dependent, partial ones in amber, the rest of the chain
   in a neutral ring). The forward two are **off by default** and persisted per
   browser. Unchecking "Qué necesito" hides the prerequisite rings/edges too.
   The card docks 256 px in from each side so it never covers the lower-left
   zoom + basket controls. (This supersedes the meeting's forward-chain-always-on
   contrast, D-5, as the default.)
5. **Quiet by default in Mi avance.** An available course is the default, so it
   gets no mark — no green ring on every available card. State is carried by
   the card itself: approved = green fill + check, in the basket = a term pill
   (e.g. "2027-1"), blocked = hatching, administrative rule = amber lock.

## Tokens (`tokens.css`)

- **Neutrals:** `--ink` / `--ink-2` / `--muted` for text; `--line*` hairlines;
  `--surface`, `--canvas`, `--band-a/b` for the layered backgrounds
  (white panel → off-white canvas → slightly darker semester bands).
- **Accent:** a single blue (`--accent` `#1f6fc4`) with hover/tint/border/soft
  variants. It marks selection, direct prerequisites and focus.
- **Course types (`--t-*`):** one deep, saturated hue per group — Eléctrica
  teal, Ciencias básicas brown, Otras slate, Proyecto blue, Electiva magenta,
  CBU indigo, Requisito grey. White text on each is 6.3–9.6:1 (measured).
  Type is also encoded by a **glyph** before the code (circle, square, diamond,
  triangle, ring, half-circle, bar), so it doesn't rely on hue alone.
- **Text on cards:** code and credits use a *solid* secondary color per type
  (`--on-type-2-*`, ≥ 4.5:1 on that fill), never `opacity`.
- **Status (`--st-*`):** green = available/planned, amber = one course away /
  admin-locked, hatched grey = blocked.
- **Type:** IBM Plex Sans for UI, IBM Plex Mono for codes, credits, kickers and
  numbers — codes like `IELE 2100` align and read as identifiers, not prose.
  Uppercase + letter-spacing is reserved for tiny labels (`.lbl`, `.kicker`).

## Map layout

- **Fixed grid geometry** (constants in `MapCanvas.tsx`): 148×60 cards on a
  168 px column pitch and 70 px row pitch. Each semester is a column; the
  alternating `--band-a/b` rounded bands make columns scannable without grid
  lines.
- **Canvas** is a dotted background (`radial-gradient` on `.canvasWrap`) —
  gives a sense of pan/zoom without competing with the cards.
- **Side panel** is a fixed 400 px column on the right that can collapse;
  the map refits (`fitView`) when it opens/closes.
- Bands and headers are React Flow nodes with `pointer-events: none`, so they
  never intercept clicks meant for cards.

## Course card states

State is composed from independent classes on the same button:

| Layer | Classes | Look |
|---|---|---|
| Type | `.typeIele`, `.typeCb`, … `.slot*` | Sets `--card-color` (the fill). Placeholder/slot cards use the same solid card — only the color differs — so every node clicks and reads the same. |
| Selection relation | `.selected`, `.directPrereq`, `.chainIndirectFull`, `.unlockSole`, `.unlockAmong` | Rings via `box-shadow` (`--ring-gap` + colored ring). Selected is the only card with a 5 px accent ring, drop shadow and 2 px lift (F-3). Green ring = this is the only thing missing for a course; amber = one of several. |
| Dimming | `.dimmed`, `.unrelated` | Unrelated cards fade (opacity ≈ 0.15–0.34) while a course is selected. |
| Mi avance | `.stApproved`, `.stBlocked`, `.stAdmin`, `.tag`, `.staged` | Approved = green fill + 20 px check. In the basket = term pill on the top edge. Blocked = hatched grey with muted text (readable without hue). Admin-locked = hatched + amber lock marker. Available = no mark. |

Rings use `box-shadow` instead of `border`/`outline` so they never change the
card's box size — nothing shifts or reflows when a state changes.

Edges: prerequisites are solid blue arrows; corequisites and "can be taken the
same term" (`*`) are dashed amber with no arrowhead; hover previews are dashed
light blue.

## Motion and hover

- Cards transition `opacity`, `box-shadow` and `filter` over 0.12 s — enough to
  feel responsive, short enough not to trail the cursor.
- **The hover ring is pure CSS** (`:where(.card):hover`), not React state.
  Earlier, hover committed `hoveredId`, which rebuilt every card's data and
  re-rendered all ~60 cards at the instant the ring appeared — that was the
  flicker. Now hover only drives the preview edges and tooltip (debounced
  70 ms / 250 ms) and never touches the nodes.
  It applies to every card (approved and blocked too) but a `:not()` list keeps
  it from replacing a relation ring. Relation rings are `.card.selected` etc.
  (specificity 0,2,0) so a status rule that sets `box-shadow` can never erase
  the selected card's ring.
- The unlock animation (`.justUnlocked`: a pulsing green ring + a light sweep)
  repeats 3× so a newly unlocked course registers (review item F-7).
  `prefers-reduced-motion` turns it off.

## First arrival at Mi avance

A student can land on Mi avance without ever seeing the Explorar tour (a shared
`?modo=avance` link, or just clicking the tab), possibly anxious, and not where
the setup assumed. So the first visit with nothing saved opens a **welcome
modal** (`AvanceWelcome`), not the sidebar sheet:

- reassuring lead ("sin presión: puedes cambiar cualquier curso después"),
- **¿En qué punto vas?** with a path per situation — *Estoy empezando la
  carrera* (nothing marked), *Ya terminé uno o más semestres* (semester picker →
  by-semester setup), *Voy distinto al plan* (lost/deferred courses or
  homologations → mark course by course); plus *Solo quiero mirar* and a
  1-minute guide,
- **Cómo leer el mapa**: real card miniatures (approved, in basket, available,
  blocked) and both line styles (solid blue = prerequisite, dashed amber =
  corequisite).

**No default semester.** The by-semester setup used to preselect II, silently
marking all of semester I as approved for someone who hasn't finished it. Now
nothing is preselected and nothing is marked until a semester is chosen;
choosing I means "start from zero". Any dismissal counts as seen (no nagging);
the same setup stays reachable from *Selección rápida*.

The Mi avance toolbar also carries the prerequisite/corequisite line legend and
a swatch on each status chip (green dot, hollow dot, hatched square, amber dot).

## Basket checkout ("Tu canasta")

A two-step dialog, the "commitment" moment after planning:

1. **Revisar** — your week at full width (summary tiles: class hours, earliest
   and latest class, free weekdays; blocks carry course, section, time, room,
   NRC; clashes are listed with the exact slot), a collapsible *¿Cómo
   funcionan los NRC?* explainer, then each course with its catalog
   description, requisite status and live sections (teachers, days, rooms,
   seats). A course also shows how many *other* sections would fit around the
   rest of the plan.
2. **Qué sigue** — copy your NRCs → tune the schedule in Mi Horario → enrol in
   MiBanner at your turn, plus a short "before enrolment day" checklist
   (turn, backup NRCs, prerequisites/restrictions, corequisites, SCH) and links
   to the official Registro guides. Copy is written as a professional note, not
   marketing.

Sections come from `/api/sections` (server-side; the Uniandes API has no CORS).
An unpublished plan term falls back to the term being offered and is labelled
*referencia* everywhere it appears.

## Accessibility

- Cards are real `<button>`s with an `aria-label` carrying code, name, credits
  and state — color is never the only signal for status.
- Keyboard focus: `.card:focus-visible` shows a white + accent double ring.
- `.srOnly` utility for screen-reader-only text.
- Blocked cards use pattern (hatching) plus muted text, not just color.

## Known gaps

- **Responsive:** only the chooser grid has a breakpoint (`max-width: 520px`).
  The map + 400 px panel layout is desktop-first.
- **Reduced motion** is honored for the unlock animation and one other block;
  the 0.12 s transitions and `fitView` animations are not gated.
- **Count mismatch:** the "Disponibles" chip (all available, incl. slots) and
  the panel's "Disponibles para agregar" (addable, excl. basket/slots) show
  different numbers for similar labels — needs a naming/definition decision.
- **Contrast** of the type fills and status colors is measured; the remaining
  to-measure items are listed in `CHANGES.md` §4.5 (`--accent` on its tint is
  4.46:1, just under 4.5).
- Fonts load from Google Fonts at runtime (`@import` in `tokens.css`); a
  self-hosted copy would remove the external dependency.
