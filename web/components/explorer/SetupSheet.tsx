"use client";

import { useEffect, useMemo, useState } from "react";
import type { Course } from "@/lib/types";
import { toSentenceCase } from "./format";
import styles from "./explorer.module.css";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];

interface Props {
  courses: Course[];
  approved: Set<string>;
  onConfirm: (idsToApprove: string[]) => void;
  onSkip: () => void; // "Ahora no"
  onBlank: () => void; // "Empezar en blanco"
  onPreviewChange: (ids: string[]) => void;
  /** first visit to Mi avance (offers "Empezar en blanco") vs. opened from Selección rápida */
  firstTime?: boolean;
  /** switch to the click-each-course selection tool */
  onUseTool?: () => void;
  /** semester chosen in the welcome modal; otherwise NOTHING is preselected */
  initialSemester?: number | null;
}

export default function SetupSheet({ courses, approved, onConfirm, onSkip, onBlank, onPreviewChange, firstTime = true, onUseTool, initialSemester = null }: Props) {
  const maxSemester = useMemo(
    () => Math.max(1, ...courses.filter((c) => !c.isPlaceholder).map((c) => c.semester)),
    [courses]
  );
  // "which semester are you about to take". No default: a preselected II would
  // silently mark all of semester I as approved for someone who hasn't finished it.
  const [semester, setSemester] = useState<number | null>(initialSemester);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const lastCompleted = semester === null ? 0 : semester - 1;
  const priorCourses = useMemo(
    () => (semester === null ? [] : courses.filter((c) => !c.requirementAttestationId && c.semester < semester && c.semester >= 1)),
    [courses, semester]
  );
  const exceptionCandidates = useMemo(
    () => courses.filter((c) => !c.requirementAttestationId && c.semester === lastCompleted),
    [courses, lastCompleted]
  );

  const toApprove = useMemo(
    () => priorCourses.filter((c) => !excluded.has(c.id) && !approved.has(c.id)),
    [priorCourses, excluded, approved]
  );
  const totalCredits = toApprove.reduce((s, c) => s + c.credits, 0);

  useEffect(() => {
    onPreviewChange(toApprove.map((c) => c.id));
    return () => onPreviewChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toApprove]);

  function toggleException(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <aside className={styles.panel} style={{ boxShadow: "-12px 0 32px rgba(16, 24, 40, 0.08)" }}>
      <div className={styles.panelHeader}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className={styles.lbl}>{firstTime ? "Primera vez en Mi avance" : "Selección rápida · por semestre"}</span>
          <button type="button" className={styles.descToggle} onClick={onSkip}>
            Ahora no
          </button>
        </div>
        <h2 className={styles.panelTitle} style={{ fontSize: 18 }}>
          Arma tu avance en 30 segundos
        </h2>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.onboardLead}>
          Dinos qué semestre vas a cursar. Marcamos lo anterior como aprobado y tú corriges lo que no. Si aún estás en primer semestre, elige I: no marcamos nada.
        </p>

        <span className={styles.sectionHeading}>¿Qué semestre vas a cursar?</span>
        <div
          role="group"
          aria-label="Semestre"
          style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 4, marginTop: 6 }}
        >
          {Array.from({ length: maxSemester }, (_, i) => i + 1).map((n) => {
            const isPast = semester !== null && n < semester;
            const isChosen = n === semester;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={isChosen}
                onClick={() => setSemester(n)}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: "1px solid var(--line-control)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: isChosen ? "var(--ink)" : isPast ? "#d9ecec" : "#fff",
                  color: isChosen ? "#fff" : isPast ? "#0b4f53" : "var(--ink)",
                }}
              >
                {ROMAN[n]}
              </button>
            );
          })}
        </div>

        <div className={styles.box} style={{ marginTop: 14, background: "#eef7f7", border: "1px solid #cfe5e6" }}>
          <span style={{ fontSize: 12.5, color: "#0b4f53" }}>
            {semester === null ? (
              <>Elige tu semestre: hasta entonces <strong>no marcamos nada</strong>.</>
            ) : semester === 1 ? (
              <>Empiezas desde cero: <strong>no hay nada que marcar</strong>.</>
            ) : (
              <>
                Se marcarán <strong>{toApprove.length} curso(s)</strong> ({totalCredits} créditos) de los semestres I–
                {ROMAN[lastCompleted] || "—"}.
              </>
            )}
          </span>
        </div>

        {semester !== null && semester > 1 && exceptionCandidates.length > 0 && (
          <div className={styles.plannerSection}>
            <span className={styles.sectionHeading}>
              ¿Alguno del semestre {ROMAN[lastCompleted]} aún no lo apruebas?
            </span>
            {exceptionCandidates.map((c) => (
              <label
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 8, height: 32, fontSize: 12.5, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={!excluded.has(c.id)}
                  onChange={() => toggleException(c.id)}
                  style={{ accentColor: "var(--t-iele)" }}
                />
                {c.code} — {toSentenceCase(c.name)}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className={styles.panelFooter} style={{ flexDirection: "column", gap: 8, alignItems: "stretch" }}>
        {semester === 1 ? (
          <button className={styles.btnPrimary} onClick={onBlank}>
            Empezar desde cero
          </button>
        ) : (
          <button className={styles.btnPrimary} onClick={() => onConfirm(toApprove.map((c) => c.id))} disabled={toApprove.length === 0}>
            {semester === null ? "Elige un semestre" : `Marcar I–${ROMAN[lastCompleted] || "—"} como aprobados`}
          </button>
        )}
        <p style={{ fontSize: 11, color: "var(--muted-2)", textAlign: "center", margin: 0 }}>
          Después cambias cualquier curso con un clic.
        </p>
        {onUseTool && (
          <button type="button" className={styles.descToggle} style={{ alignSelf: "center" }} onClick={onUseTool}>
            Prefiero elegir curso por curso (si voy distinto al plan)
          </button>
        )}
        <button type="button" className={styles.descToggle} style={{ alignSelf: "center" }} onClick={onBlank}>
          {firstTime ? "Empezar en blanco" : "Cancelar"}
        </button>
      </div>
    </aside>
  );
}
