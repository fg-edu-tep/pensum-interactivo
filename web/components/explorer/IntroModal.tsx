"use client";

// First visit to any pensum: a centred welcome that leads into the Mi avance
// guide. It replaces the old onboarding side panel and can't be dismissed
// with a backdrop click or Esc — the one way forward is the guide (which has
// its own "Salir de la guía", so nobody is trapped).

import { useEffect, useRef } from "react";
import styles from "./explorer.module.css";

const WHAT_WE_SHOW = [
  { title: "Dónde se marca lo que ya viste", body: "Por semestre o curso por curso, y siempre se puede corregir." },
  { title: "Cómo leer el mapa", body: "Qué significa cada color y qué necesita, desbloquea o depende de cada curso." },
  { title: "Cómo armar tu próximo semestre", body: "La canasta: qué ya puedes inscribir y qué te abre." },
];

export default function IntroModal({ programName, onStart }: { programName: string; onStart: () => void }) {
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    startRef.current?.focus();
  }, []);

  return (
    <div className={styles.awBackdrop}>
      <div
        className={styles.introDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onKeyDown={(e) => {
          // a single control: keep focus on it
          if (e.key === "Tab") {
            e.preventDefault();
            startRef.current?.focus();
          }
        }}
      >
        <span className={styles.kicker}>Primera vez aquí</span>
        <h2 id="intro-title" className={styles.awTitle}>
          Bienvenido a tu pensum interactivo
        </h2>
        <p className={styles.awLead}>
          Este es el plan de <strong>{programName}</strong>. Antes de empezar, te mostramos en un minuto cómo
          funciona <strong>Mi avance</strong>, el lugar donde llevas lo que ya viste y planeas lo que sigue.
        </p>

        <h3 className={styles.awQ}>En la guía te mostramos</h3>
        <ol className={styles.introList}>
          {WHAT_WE_SHOW.map((s, i) => (
            <li key={s.title}>
              <span className={styles.tourCheck} aria-hidden>
                {i + 1}
              </span>
              <span>
                <strong>{s.title}</strong>
                <em>{s.body}</em>
              </span>
            </li>
          ))}
        </ol>
        <p className={styles.introNote}>
          Es solo un recorrido: no tienes que hacer nada mientras lo ves. Al final eliges desde dónde empezar.
        </p>

        <button ref={startRef} type="button" className={`${styles.btnPrimary} ${styles.introCta}`} onClick={onStart}>
          Empezar la guía de Mi avance
        </button>
      </div>
    </div>
  );
}
