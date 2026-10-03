# User flows and design rationale

Who the explorer is designed for, and why each flow behaves the way it does.
Engineering detail is in [`2026-10-design-pass.md`](2026-10-design-pass.md).

## The people

- **The stressed student** — checking whether they can still graduate on time,
  possibly after failing or deferring courses. Needs quiet, trustworthy state and
  one clear next action. Anything that shouts ("do these now") adds anxiety.
- **The newcomer** — doesn't yet know what the colours mean or what the degree is
  about. Needs a second channel for course type (shape, not just hue), plain
  language, and a map they can read without a tutorial.
- **The planner** — deciding next semester. Needs to find the selected course
  instantly, see what's in the basket, and see what the semester actually looks
  like before enrolling.

## Explorar

- **Type is the card fill; shape repeats it.** Each course type has a glyph
  (circle, square, diamond, triangle, ring, half-circle, bar) so the map is
  readable in grayscale and for colour-blind users.
- **Hover is light, selection is loud.** Hover = a ring (pure CSS). Selecting
  dims everything unrelated and rings the course (5 px) and its prerequisites.
- **What a course needs is shown; what it unlocks is opt-in.** The selection card
  has three checkboxes with counts:
  - *Qué necesito* (on) — prerequisites.
  - *Qué desbloquea* — courses this one opens **by itself** (it is their only
    prerequisite). Solid green.
  - *Qué depende de él* — everything that leans on it, directly or down the
    chain; partial unlocks in amber. The niche "how relevant is this course?" view.
  Each chip carries a tooltip with the full definition, and a one-line note
  summarises it ("Por sí solo no desbloquea ninguno, pero 2 cursos dependen de él").
- **Line legend:** solid blue = prerequisite (must be passed first); dashed amber =
  corequisite / can be taken the same semester.

## Mi avance

1. **Welcome (first visit only).** Reassuring lead, then "¿En qué punto vas?":
   - *Estoy empezando la carrera* → nothing marked.
   - *Ya terminé uno o más semestres* → pick the semester you're about to take; a
     live preview marks the earlier ones and lists exceptions you can untick.
   - *Voy distinto al plan* → mark course by course (lost/deferred courses,
     homologations).
   - *Solo quiero mirar* / a 1-minute guide.
   A "cómo leer el mapa" key (real card miniatures + both line styles) sits beside
   the options. **Nothing is ever marked on the student's behalf** until they
   choose a semester.
2. **Quiet state.** Approved = green + ✓ (the only primary "seen" signal); in the
   basket = a blue pill with the term; blocked = hatched; admin rule = amber lock;
   available = no mark. Status chips carry matching swatches and counts.
3. **The basket.** Planning is one semester ahead (decision D-6). Only courses whose
   prerequisites are met by *seen + planned* can be added (F-10).

## Checkout — "Tu canasta"

The commitment moment, in two steps.

**1 · Revisar**
- *Tu semana* at full width: class hours per week, earliest class, latest class,
  free weekdays (the sleep-schedule view), blocks showing course/section/time/
  room/NRC. Clashes are listed with the exact slot and a "change section" link.
- *¿Cómo funcionan los NRC?* — an NRC identifies one section (course + group +
  teacher + schedule); the same course has several, each with its own NRC;
  registration is done by NRC; labs/complementary sections have their own.
- Each course: catalog description, requisite status, live sections (teacher,
  days, room, seats), and how many alternative sections still fit.
- Honesty: until Uniandes publishes the next semester, sections are from the
  current one and are labelled **referencia** everywhere.

**2 · Qué sigue** — copy the NRCs → adjust in Mi Horario → enrol in MiBanner at
your turn; a short checklist (turn, backup NRCs, prerequisites/restrictions,
corequisites, the Conflicto de Horario system) and links to the official Registro
guides. Copy is written as a professional note.

## Language and tone

Spanish throughout; sentence case for course names; no red anywhere (there is no
"danger" colour — amber is the only warning). Never mark a course approved on the
student's behalf. Any dismissal of a first-time modal counts as seen — no nagging.

## Accessibility

Cards are `<button>`s with labels carrying code, name, credits and state; dialogs
trap focus and close on Esc; colour is never the only signal (glyphs, hatching,
pills, text); reduced-motion removes animations (the basket seal's drawn check,
modal entrances, unlock pulse).

## Storage keys (browser only)

| Key | Content |
|---|---|
| `pensum:<slug>:approved`, `…:plan` (the basket), `…:electivas`, `…:requisitos` (degree attestations) | progress data |
| `pensum:<slug>:sections:<term>` | chosen section per course in the basket |
| `pensum:<slug>:setup-seen` | the welcome/setup was shown |
| `pensum:rel-view` | `{needs,unlocks,depends}` relation checkboxes |
| `pensum:unlock-view` | legacy single-choice key, migrated on read |
| `pensum:<slug>:relaciones` | Directas / Toda la cadena |
| `pensum:tour-completed`, `pensum:avance-tour-completed` | tours seen |
