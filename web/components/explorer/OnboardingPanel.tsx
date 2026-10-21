"use client";

// The first-visit onboarding side panel was replaced by a centred welcome
// (IntroModal) that leads into the Mi avance guide; only the hint pill stays.

import { PointerIcon } from "./icons";
import styles from "./explorer.module.css";

export function HintPill({ onStartTour }: { onStartTour: () => void }) {
  return (
    <div className={styles.hintPill}>
      <PointerIcon />
      Toca un curso para ver qué necesitas y qué te abre
      <button className={styles.hintPillCta} onClick={onStartTour}>
        Recorrido de 1 min
      </button>
    </div>
  );
}
