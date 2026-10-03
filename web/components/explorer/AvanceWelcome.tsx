"use client";

// First arrival at Mi avance. A student may land here straight from the link,
// without the Explorar tour, possibly anxious, and not at the same point in the
// degree as the default assumes (someone who hasn't finished semester I must not
// get it marked as approved). So: a clear welcome, an honest "where are you?"
// with a path for each situation, and the legend of the map right here.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Course } from "@/lib/types";
import { CheckIcon, CloseIcon } from "./icons";
import styles from "./explorer.module.css";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];

interface Props {
  courses: Course[];
  /** "Estoy empezando": nothing marked, start from zero */
  onStartFresh: () => void;
  /** "Ya terminé…": open the by-semester setup with this semester preselected */
  onPickSemester: (semester: number) => void;
  /** "Voy distinto al plan": mark course by course */
  onByCourse: () => void;
  /** "Solo quiero mirar" / close */
  onLookAround: () => void;
  /** the 1-minute guide */
  onTour: () => void;
}

export default function AvanceWelcome({ courses, onStartFresh, onPickSemester, onByCourse, onLookAround, onTour }: Props) {
  const maxSemester = useMemo(
    () => Math.max(1, ...courses.filter((c) => !c.isPlaceholder).map((c) => c.semester)),
    [courses]
  );
  const [picking, setPicking] = useState(false);
  const [semester, setSemester] = useState<number | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onLookAround();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.awBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onLookAround()}>
      <div className={styles.awDialog} role="dialog" aria-modal="true" aria-labelledby="aw-title" ref={dialogRef} onKeyDown={onKeyDown}>
        <button type="button" className={styles.awClose} onClick={onLookAround} aria-label="Cerrar y mirar el mapa">
          <CloseIcon size={18} />
        </button>

        <div className={styles.awMain}>
          <span className={styles.kicker}>Primera vez en Mi avance</span>
          <h2 id="aw-title" className={styles.awTitle}>Bienvenido a Mi avance</h2>
          <p className={styles.awLead}>
            Aquí marcas lo que ya viste y armas el plan de tu próximo semestre. Sin presión: puedes cambiar cualquier curso
            después, y todo queda guardado solo en este navegador.
          </p>

          <h3 className={styles.awQ}>¿En qué punto vas?</h3>
          <div className={styles.awOptions}>
            <button type="button" ref={firstRef} className={styles.awOption} onClick={onStartFresh}>
              <strong>Estoy empezando la carrera</strong>
              <span>Aún no termino mi primer semestre. Empezamos sin nada marcado y te mostramos qué puedes inscribir.</span>
            </button>

            <div className={`${styles.awOption} ${picking ? styles.awOptionOpen : ""}`}>
              <button type="button" className={styles.awOptionHead} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
                <strong>Ya terminé uno o más semestres</strong>
                <span>Dinos cuál vas a cursar ahora: marcamos lo anterior y tú corriges las excepciones.</span>
              </button>
              {picking && (
                <div className={styles.awPicker}>
                  <span className={styles.awPickerLabel}>El semestre que voy a cursar es</span>
                  <div className={styles.awChips} role="group" aria-label="Semestre que vas a cursar">
                    {Array.from({ length: maxSemester - 1 }, (_, i) => i + 2).map((n) => (
                      <button key={n} type="button" aria-pressed={semester === n} className={`${styles.awChip} ${semester === n ? styles.awChipOn : ""}`} onClick={() => setSemester(n)}>
                        {ROMAN[n]}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={styles.btnPrimary} disabled={semester === null} onClick={() => semester !== null && onPickSemester(semester)}>
                    {semester === null ? "Elige un semestre" : `Continuar: marcar I–${ROMAN[semester - 1]}`}
                  </button>
                </div>
              )}
            </div>

            <button type="button" className={styles.awOption} onClick={onByCourse}>
              <strong>Voy distinto al plan</strong>
              <span>Perdí o aplacé algunas materias, o tengo homologaciones. Marca curso por curso lo que sí aprobaste.</span>
            </button>
          </div>

          <div className={styles.awFoot}>
            <button type="button" className={styles.awLinkBtn} onClick={onLookAround}>Solo quiero mirar el mapa</button>
            <span aria-hidden>·</span>
            <button type="button" className={styles.awLinkBtn} onClick={onTour}>Ver la guía de 1 minuto</button>
          </div>
        </div>

        <aside className={styles.awKey} aria-label="Cómo leer el mapa">
          <h3 className={styles.awKeyTitle}>Cómo leer el mapa</h3>

          <div className={styles.awKeyRow}>
            <span className={`${styles.awMini} ${styles.awMiniOk}`}>
              <span className={styles.awMiniCheck}><CheckIcon size={9} /></span>
            </span>
            <span><strong>Aprobada</strong><em>Verde con ✓. La marcas tú: no se marca sola.</em></span>
          </div>
          <div className={styles.awKeyRow}>
            <span className={`${styles.awMini} ${styles.awMiniPlan}`}>
              <span className={styles.awMiniPill}>2027-1</span>
            </span>
            <span><strong>En tu canasta</strong><em>Pastilla azul con el semestre que planeas.</em></span>
          </div>
          <div className={styles.awKeyRow}>
            <span className={`${styles.awMini} ${styles.awMiniOpen}`} />
            <span><strong>Disponible</strong><em>Sin marca: ya cumples sus prerrequisitos.</em></span>
          </div>
          <div className={styles.awKeyRow}>
            <span className={`${styles.awMini} ${styles.awMiniBlocked}`} />
            <span><strong>Bloqueada</strong><em>Rayada: aún te faltan prerrequisitos.</em></span>
          </div>

          <div className={styles.awKeyDivider} />

          <div className={styles.awKeyRow}>
            <svg width="40" height="12" aria-hidden className={styles.awLine}>
              <line x1="1" y1="6" x2="31" y2="6" stroke="var(--edge-prereq)" strokeWidth="2" />
              <path d="M31 2 L38 6 L31 10 Z" fill="var(--edge-prereq)" />
            </svg>
            <span><strong>Prerrequisito</strong><em>Línea azul continua: debe estar aprobado antes.</em></span>
          </div>
          <div className={styles.awKeyRow}>
            <svg width="40" height="12" aria-hidden className={styles.awLine}>
              <line x1="1" y1="6" x2="38" y2="6" stroke="var(--edge-coreq)" strokeWidth="2" strokeDasharray="5 4" />
            </svg>
            <span><strong>Correquisito</strong><em>Línea punteada ámbar: se inscribe al tiempo, o puede cursarse el mismo semestre.</em></span>
          </div>
        </aside>
      </div>
    </div>
  );
}
