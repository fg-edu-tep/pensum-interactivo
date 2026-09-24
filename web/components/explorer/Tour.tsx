"use client";

import { useEffect, useState } from "react";
import styles from "./explorer.module.css";

const STEPS = [
  { title: "Empieza por un curso", body: "Tócalo: se ilumina lo que necesitas antes y lo que te abre después." },
  {
    title: "¿Solo lo inmediato o todo el camino?",
    body:
      "Directas muestra lo que necesitas para inscribir el curso. Toda la cadena suma todo lo que viene antes. Pruébalo ahora: el mapa cambia en vivo.",
  },
  {
    title: "Tu ruta, resumida",
    body: "Necesitas → esta → desbloquea. Toca cualquier código para saltar a ese curso.",
  },
  { title: "Ahora, tu avance", body: "Marca lo que ya aprobaste y te diremos qué puedes inscribir." },
];

function useTargetRect(step: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    let raf = 0;
    function measure() {
      const el = document.querySelector('[data-tour-target="true"]');
      setRect(el ? el.getBoundingClientRect() : null);
      raf = requestAnimationFrame(measure);
    }
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  return rect;
}

interface Props {
  step: number; // 0..3
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function Tour({ step, onNext, onBack, onSkip }: Props) {
  const rect = useTargetRect(step);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip]);

  if (!rect) return null;

  const pad = 6;
  const spotStyle: React.CSSProperties = {
    position: "fixed",
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 14,
    boxShadow: "0 0 0 2px #fff, 0 0 0 4000px rgba(17,22,32,.55)",
    zIndex: 90,
    pointerEvents: "none",
  };

  // place the coach mark below the target if there's room, else above
  const coachTop = rect.bottom + 16 + 180 < window.innerHeight ? rect.bottom + 16 : Math.max(16, rect.top - 16 - 180);
  const coachLeft = Math.min(Math.max(16, rect.left), window.innerWidth - 356);

  return (
    <>
      <div style={spotStyle} />
      <div
        role="dialog"
        aria-label={`Recorrido, paso ${step + 1} de 4`}
        className={styles.coachMark}
        style={{ position: "fixed", left: coachLeft, top: coachTop, zIndex: 91 }}
      >
        <div className={styles.coachDots}>
          {STEPS.map((_, i) => (
            <span key={i} className={`${styles.coachDot} ${i === step ? styles.coachDotActive : ""}`} />
          ))}
          <span className={styles.coachCount}>{step + 1} de 4</span>
        </div>
        <div className={styles.coachTitle}>{STEPS[step].title}</div>
        <div className={styles.coachBody}>{STEPS[step].body}</div>
        <div className={styles.coachFooter}>
          <button type="button" className={styles.descToggle} onClick={onSkip}>
            Saltar guía
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button type="button" className={styles.btnGhostFooter} style={{ flex: "none", height: 32, padding: "0 12px" }} onClick={onBack}>
                Atrás
              </button>
            )}
            <button type="button" className={styles.btnPrimary} style={{ flex: "none", height: 32, padding: "0 14px" }} onClick={onNext}>
              {step === 3 ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
