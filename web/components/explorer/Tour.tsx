"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./explorer.module.css";

export interface TourStepDef {
  id: string;
  /** CSS selector of the element to spotlight. Omit (or if it isn't on screen)
   * and the step renders as a centred card — a step never disappears. */
  target?: string;
  title: string;
  body: string;
}

const COACH_W = 340;
const COACH_H = 210; // generous estimate, only used for placement

function sameRect(a: DOMRect | null, b: DOMRect | null) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** Tracks the target's rect. Re-measures every frame (panels animate, the map
 * pans) but only re-renders when the rect actually moved. */
function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const last = useRef<DOMRect | null>(null);
  useEffect(() => {
    last.current = null;
    setRect(null);
    if (!selector) return;
    let raf = 0;
    let scrolled = false;
    function measure() {
      const el = document.querySelector(selector!);
      let next: DOMRect | null = null;
      if (el) {
        if (!scrolled) {
          scrolled = true;
          (el as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" });
        }
        const r = el.getBoundingClientRect();
        next = r.width > 0 && r.height > 0 ? r : null;
      }
      if (!sameRect(last.current, next)) {
        last.current = next;
        setRect(next);
      }
      raf = requestAnimationFrame(measure);
    }
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

interface Props {
  steps: TourStepDef[];
  step: number;
  label: string; // e.g. "Recorrido del mapa"
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function Tour({ steps, step, label, onNext, onBack, onSkip }: Props) {
  const def = steps[step];
  const rect = useTargetRect(def?.target);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip, onNext, onBack]);

  if (!def) return null;

  const last = step === steps.length - 1;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  let coachPos: React.CSSProperties;
  let spot: React.ReactNode;
  if (rect) {
    const pad = 6;
    spot = (
      <div
        style={{
          position: "fixed",
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 14,
          boxShadow: "0 0 0 2px #fff, 0 0 0 4000px rgba(17,22,32,.55)",
          zIndex: 90,
          pointerEvents: "none",
          transition: "left .18s, top .18s, width .18s, height .18s",
        }}
      />
    );
    const tall = rect.height > vh * 0.5;
    if (tall) {
      // a big target (the side panel): put the card beside it
      const roomLeft = rect.left - 16 - COACH_W >= 8;
      const left = roomLeft ? rect.left - 16 - COACH_W : Math.min(rect.right + 16, vw - COACH_W - 8);
      coachPos = { left, top: Math.max(16, Math.min(rect.top + 24, vh - COACH_H - 16)) };
    } else {
      const below = rect.bottom + 16 + COACH_H < vh;
      coachPos = {
        left: Math.min(Math.max(16, rect.left), vw - COACH_W - 16),
        top: below ? rect.bottom + 16 : Math.max(16, rect.top - 16 - COACH_H),
      };
    }
  } else {
    // target not on screen (yet, or this view doesn't have it) — never vanish
    spot = <div style={{ position: "fixed", inset: 0, background: "rgba(17,22,32,.45)", zIndex: 90, pointerEvents: "none" }} />;
    coachPos = { left: Math.max(16, (vw - COACH_W) / 2), top: Math.max(16, vh / 2 - COACH_H / 2) };
  }

  return (
    <>
      {spot}
      <div
        role="dialog"
        aria-label={`${label}, paso ${step + 1} de ${steps.length}`}
        className={styles.coachMark}
        style={{ position: "fixed", ...coachPos, zIndex: 91 }}
      >
        <div className={styles.coachDots}>
          {steps.map((s, i) => (
            <span key={s.id} className={`${styles.coachDot} ${i === step ? styles.coachDotActive : ""}`} />
          ))}
          <span className={styles.coachCount}>
            {step + 1} de {steps.length}
          </span>
        </div>
        <div className={styles.coachTitle}>{def.title}</div>
        <div className={styles.coachBody}>{def.body}</div>
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
              {last ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
