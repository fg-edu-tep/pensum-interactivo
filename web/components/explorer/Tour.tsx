"use client";

// The guided tour, as a CHECKLIST rather than a coach mark glued to a button.
//
// Why: a spotlight on a button plus a card right next to it reads as "click
// this now", and students did — which broke the sequence. So:
//   - the checklist card always sits in the same corner (bottom-left, or
//     bottom-right when the target is there), so there is one place to read;
//   - the target gets a dashed "this is here" outline and a numbered marker
//     matching the checklist row, never a "press me" glow;
//   - the page is locked while the guide runs (it's a look-around, nothing
//     needs doing yet), so following along can't knock the flow over;
//   - every row is visible up front ("we'll show you this, this and this"),
//     done ones get a ✓, and any row can be revisited.

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import styles from "./explorer.module.css";

export interface TourStepDef {
  id: string;
  /** CSS selector of the element to point at. Omit (or if it isn't on screen)
   * and the step only shows in the checklist — a step never disappears. */
  target?: string;
  title: string;
  body: string;
  /** short name shown on the marker next to the target ("Selección rápida") */
  marker?: string;
}

const CARD_W = 380;
const CARD_H_EST = 460; // only used to avoid covering the target
const GAP = 16;

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

function intersects(a: { l: number; t: number; r: number; b: number }, rect: DOMRect) {
  return a.l < rect.right && a.r > rect.left && a.t < rect.bottom && a.b > rect.top;
}

interface Props {
  steps: TourStepDef[];
  step: number;
  label: string; // e.g. "Recorrido del mapa"
  /** one line under the title that frames the whole guide */
  intro: string;
  onNext: () => void;
  onBack: () => void;
  onJump: (step: number) => void;
  onSkip: () => void;
}

export default function Tour({ steps, step, label, intro, onNext, onBack, onJump, onSkip }: Props) {
  const def = steps[step];
  const rect = useTargetRect(def?.target);
  const nextRef = useRef<HTMLButtonElement>(null);
  const currentRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip, onNext, onBack]);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
    currentRowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [step]);

  if (!def) return null;

  const last = step === steps.length - 1;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const narrow = vw < 700;

  // one of two fixed corners — whichever doesn't cover the target
  let side: "left" | "right" = "left";
  if (rect && !narrow) {
    const w = Math.min(CARD_W, vw - 2 * GAP);
    const h = Math.min(CARD_H_EST, vh - 2 * GAP);
    const leftBox = { l: GAP, t: vh - GAP - h, r: GAP + w, b: vh - GAP };
    const rightBox = { l: vw - GAP - w, t: vh - GAP - h, r: vw - GAP, b: vh - GAP };
    if (intersects(leftBox, rect) && !intersects(rightBox, rect)) side = "right";
  }

  const pad = 6;
  const markerNumber = step + 1;

  return (
    <>
      {/* the page is not interactive during the guide; clicks land here */}
      <div className={styles.tourBlocker} aria-hidden onMouseDown={(e) => e.preventDefault()} />
      {rect ? (
        <>
          <div
            className={styles.tourSpot}
            style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          />
          <div
            className={styles.tourMarker}
            style={{
              left: Math.min(Math.max(8, rect.left - pad), vw - 220),
              top: rect.top - pad - 34 < 8 ? rect.bottom + pad + 6 : rect.top - pad - 34,
            }}
            aria-hidden
          >
            <span className={styles.tourMarkerNum}>{markerNumber}</span>
            {def.marker ?? def.title}
          </div>
        </>
      ) : (
        <div className={styles.tourDim} aria-hidden />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label}, paso ${step + 1} de ${steps.length}`}
        className={`${styles.tourCard} ${side === "right" ? styles.tourCardRight : ""}`}
      >
        <div className={styles.tourHead}>
          <span className={styles.kicker}>{label}</span>
          <span className={styles.coachCount}>
            {step + 1} de {steps.length}
          </span>
        </div>
        <p className={styles.tourIntro}>{intro}</p>

        <ol className={styles.tourList}>
          {steps.map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li
                key={s.id}
                ref={i === step ? currentRowRef : undefined}
                className={`${styles.tourItem} ${state === "done" ? styles.tourItemDone : ""} ${state === "current" ? styles.tourItemCurrent : ""}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <button type="button" className={styles.tourItemHead} onClick={() => onJump(i)} tabIndex={state === "current" ? -1 : 0}>
                  <span className={styles.tourCheck} aria-hidden>
                    {state === "done" ? <CheckIcon size={11} /> : i + 1}
                  </span>
                  <span className={styles.tourItemTitle}>{s.title}</span>
                  {state === "done" && <span className={styles.srOnly}>(visto)</span>}
                </button>
                {state === "current" && <p className={styles.tourItemBody}>{s.body}</p>}
              </li>
            );
          })}
        </ol>

        <div className={styles.coachFooter}>
          <button type="button" className={styles.descToggle} onClick={onSkip}>
            Salir de la guía
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button type="button" className={styles.btnGhostFooter} style={{ flex: "none", height: 32, padding: "0 12px" }} onClick={onBack}>
                Atrás
              </button>
            )}
            <button ref={nextRef} type="button" className={styles.btnPrimary} style={{ flex: "none", height: 32, padding: "0 14px" }} onClick={onNext}>
              {last ? "Terminar la guía" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
