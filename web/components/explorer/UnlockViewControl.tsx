"use client";

// What the map shows around the SELECTED course — ONE view at a time (a
// segmented toggle, not checkboxes), each phrased as the question it answers:
//   Qué necesito      — ¿qué debo aprobar antes de inscribirlo?      [default]
//   Qué desbloquea    — ¿qué se me abre con solo aprobarlo?  (it is the ONLY
//                       prerequisite left of those courses)
//   Qué depende de él — ¿qué cursos lo piden, aunque pidan otros más?
// "Desbloquea" ⊂ "Depende": every course it unlocks depends on it, but a course
// that also asks for something else only depends on it.

import styles from "./explorer.module.css";

export type RelView = { needs: boolean; unlocks: boolean; depends: boolean };
export type RelKey = keyof RelView;
/** the derived forward level the map works with */
export type UnlockView = "off" | "sole" | "all";

export const DEFAULT_REL_VIEW: RelView = { needs: true, unlocks: false, depends: false };

export function relViewOf(key: RelKey): RelView {
  return { needs: key === "needs", unlocks: key === "unlocks", depends: key === "depends" };
}

/** the single active view (older stored values could have several on) */
export function activeRelKey(v: RelView): RelKey {
  return v.depends ? "depends" : v.unlocks ? "unlocks" : "needs";
}

export function deriveUnlockView(v: RelView): UnlockView {
  const k = activeRelKey(v);
  return k === "depends" ? "all" : k === "unlocks" ? "sole" : "off";
}

export const REL_STORAGE_KEY = "pensum:rel-view";
const LEGACY_UNLOCK_KEY = "pensum:unlock-view"; // earlier single-choice version

export function readStoredRelView(): RelView {
  try {
    const raw = localStorage.getItem(REL_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return relViewOf(activeRelKey({ needs: p.needs !== false, unlocks: !!p.unlocks, depends: !!p.depends }));
    }
    const legacy = localStorage.getItem(LEGACY_UNLOCK_KEY);
    if (legacy === "sole") return relViewOf("unlocks");
    if (legacy === "all") return relViewOf("depends");
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_REL_VIEW;
}

export function writeStoredRelView(v: RelView) {
  try {
    localStorage.setItem(REL_STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export const REL_OPTIONS: { key: RelKey; label: string; question: string; hint: string }[] = [
  {
    key: "needs",
    label: "Qué necesito",
    question: "¿Qué debo aprobar antes de inscribir este curso?",
    hint: "Sus prerrequisitos: lo que tiene que estar aprobado antes de poder inscribirlo.",
  },
  {
    key: "unlocks",
    label: "Qué desbloquea",
    question: "¿Qué se me abre con solo aprobar este curso (o tenerlo en mi canasta)?",
    hint: "Los cursos para los que este es el único requisito que falta: al aprobarlo quedan disponibles.",
  },
  {
    key: "depends",
    label: "Qué depende de él",
    question: "¿Qué cursos lo piden, aunque también pidan otros?",
    hint: "Todo lo que se apoya en este curso, directa o indirectamente, aunque necesite más cosas. Sirve para medir qué tan importante es.",
  },
];

export default function RelationToggles({
  view,
  onChange,
  counts,
}: {
  view: RelView;
  onChange: (v: RelView) => void;
  counts: Record<RelKey, number>;
}) {
  const active = activeRelKey(view);
  const current = REL_OPTIONS.find((o) => o.key === active)!;
  return (
    <div className={styles.relBlock}>
      <div className={styles.relSegment} role="radiogroup" aria-label="Qué mostrar en el mapa">
        {REL_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active === o.key}
            className={`${styles.relOption} ${active === o.key ? styles.relOptionOn : ""}`}
            data-kind={o.key}
            title={o.hint}
            onClick={() => onChange(relViewOf(o.key))}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = REL_OPTIONS.findIndex((x) => x.key === active);
              const next = REL_OPTIONS[(i + (e.key === "ArrowRight" ? 1 : REL_OPTIONS.length - 1)) % REL_OPTIONS.length];
              onChange(relViewOf(next.key));
              (e.currentTarget.parentElement?.querySelector(`[data-kind="${next.key}"]`) as HTMLElement | null)?.focus();
            }}
            tabIndex={active === o.key ? 0 : -1}
          >
            <span className={styles.relSwatch} aria-hidden />
            <span className={styles.relLabel}>{o.label}</span>
            <span className={styles.relCount}>{counts[o.key]}</span>
          </button>
        ))}
      </div>
      <p className={styles.relQuestion}>{current.question}</p>
    </div>
  );
}
