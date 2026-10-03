"use client";

// What the map shows around the SELECTED course, as three independent checks:
//   Qué necesito     — what it needs before (prerequisites)       [on by default]
//   Qué desbloquea   — what it opens BY ITSELF (it is the only prerequisite)
//   Qué depende de él — everything that leans on it, directly or down the chain
// Forward directions are opt-in: a student deciding what to take cares about
// what they NEED first; what a course unlocks is a second, noisier question
// (partial unlocks especially).

import styles from "./explorer.module.css";

export type RelView = { needs: boolean; unlocks: boolean; depends: boolean };
/** the derived forward level the map works with */
export type UnlockView = "off" | "sole" | "all";

export const DEFAULT_REL_VIEW: RelView = { needs: true, unlocks: false, depends: false };

/** "Qué depende de él" is the superset, so it wins over "Qué desbloquea". */
export function deriveUnlockView(v: RelView): UnlockView {
  return v.depends ? "all" : v.unlocks ? "sole" : "off";
}

export const REL_STORAGE_KEY = "pensum:rel-view";
const LEGACY_UNLOCK_KEY = "pensum:unlock-view"; // earlier single-choice version

export function readStoredRelView(): RelView {
  try {
    const raw = localStorage.getItem(REL_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { needs: p.needs !== false, unlocks: !!p.unlocks, depends: !!p.depends };
    }
    const legacy = localStorage.getItem(LEGACY_UNLOCK_KEY);
    if (legacy === "sole") return { ...DEFAULT_REL_VIEW, unlocks: true };
    if (legacy === "all") return { ...DEFAULT_REL_VIEW, depends: true };
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

const OPTIONS: { key: keyof RelView; label: string; kind: string; hint: string }[] = [
  {
    key: "needs",
    label: "Qué necesito",
    kind: "needs",
    hint: "Los prerrequisitos de este curso: lo que debes aprobar antes de poder inscribirlo.",
  },
  {
    key: "unlocks",
    label: "Qué desbloquea",
    kind: "unlocks",
    hint: "Los cursos que este curso abre por sí solo: con aprobarlo ya puedes verlos (es su único requisito).",
  },
  {
    key: "depends",
    label: "Qué depende de él",
    kind: "depends",
    hint: "Todo lo que se apoya en este curso, directa o indirectamente a lo largo del pensum, incluidos los que solo abre en parte. Útil para medir qué tan importante es.",
  },
];

export default function RelationToggles({
  view,
  onChange,
  counts,
}: {
  view: RelView;
  onChange: (v: RelView) => void;
  counts: Record<keyof RelView, number>;
}) {
  return (
    <div className={styles.relToggles} role="group" aria-label="Qué mostrar en el mapa">
      {OPTIONS.map((o) => (
        <label key={o.key} className={`${styles.relToggle} ${view[o.key] ? styles.relToggleOn : ""}`} title={o.hint} data-kind={o.kind}>
          <input
            type="checkbox"
            checked={view[o.key]}
            onChange={(e) => onChange({ ...view, [o.key]: e.target.checked })}
          />
          <span className={styles.relSwatch} aria-hidden />
          <span className={styles.relLabel}>{o.label}</span>
          <span className={styles.relCount}>{counts[o.key]}</span>
        </label>
      ))}
    </div>
  );
}
