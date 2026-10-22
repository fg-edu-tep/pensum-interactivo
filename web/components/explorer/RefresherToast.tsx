"use client";

// Returning students, once per browser session: a friendly "¿necesitas un
// repaso?" that offers the guide and then gets out of the way on its own.
// Hovering or focusing it pauses the countdown.

import { useEffect, useRef, useState } from "react";
import { CloseIcon, HelpIcon } from "./icons";
import styles from "./explorer.module.css";

const DURATION_MS = 9000;

export default function RefresherToast({ onTour, onClose }: { onTour: () => void; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION_MS);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const t = setTimeout(onClose, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, onClose]);

  return (
    <div
      className={styles.refresher}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.refresherIcon} aria-hidden>
        <HelpIcon />
      </span>
      <span className={styles.refresherText}>
        <strong>¡Hola de nuevo! ¿Necesitas un repaso?</strong>
        <span>La guía de 1 minuto te recuerda dónde está cada cosa.</span>
      </span>
      <button type="button" className={styles.refresherCta} onClick={onTour}>
        Ver la guía
      </button>
      <button type="button" className={styles.refresherClose} onClick={onClose} aria-label="Cerrar">
        <CloseIcon size={14} />
      </button>
      <span
        className={styles.refresherBar}
        style={{ animationDuration: `${DURATION_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
        aria-hidden
      />
    </div>
  );
}
