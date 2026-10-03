"use client";

import { useEffect } from "react";
import styles from "./explorer.module.css";

interface Props {
  onBySemester: () => void;
  onByTool: () => void;
  onClose: () => void;
}

/** "Selección rápida" entry point: two ways to mark what you've already seen. */
export default function QuickChooser({ onBySemester, onByTool, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.chooserBackdrop} onMouseDown={onClose}>
      <div className={styles.chooser} role="dialog" aria-label="Selección rápida" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className={styles.chooserTitle}>¿Cómo quieres marcar lo que ya viste?</h2>
        <div className={styles.chooserGrid}>
          <button type="button" className={styles.chooserCard} onClick={onBySemester}>
            <span className={styles.chooserKicker}>Más rápido</span>
            <strong>Por semestre</strong>
            <span>Dinos qué semestre vas a cursar y marcamos todo lo anterior. Luego quitas las excepciones.</span>
          </button>
          <button type="button" className={styles.chooserCard} onClick={onByTool}>
            <span className={styles.chooserKicker}>Más preciso</span>
            <strong>Herramienta de selección</strong>
            <span>Toca en el mapa los cursos que ya aprobaste, uno por uno, y confirma al final.</span>
          </button>
        </div>
        <button type="button" className={styles.descToggle} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
