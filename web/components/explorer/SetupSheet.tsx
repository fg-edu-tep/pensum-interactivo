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
  // "¿Qué semestres ya terminaste?" (2026-10-29): toggles per semester —
  // non-contiguous allowed (double program, irregular students) — plus a
  // "del I al N" shortcut. Nothing is preselected unless the welcome screen
  // passed "I'm about to take semester n" (= finished I … n-1).
  const [done, setDone] = useState<Set<number>>(
    () => new Set(initialSemester && initialSemester > 1 ? Array.from({ length: initialSemester - 1 }, (_, i) => i + 1) : [])
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const semesters = useMemo(() => [...done].sort((a, b) => a - b), [done]);

  const chosenCourses = useMemo(
    () => courses.filter((c) => !c.requirementAttestationId && done.has(c.semester)),
    [courses, done]
  );

  // the FULL selection (already-approved ones included): confirming replaces
  // the previous quick selection instead of only adding to it
  const toApprove = useMemo(() => chosenCourses.filter((c) => !excluded.has(c.id)), [chosenCourses, excluded]);
  const newlyMarked = toApprove.filter((c) => !approved.has(c.id)).length;
  const totalCredits = toApprove.reduce((s, c) => s + c.credits, 0);

  useEffect(() => {
    onPreviewChange(toApprove.map((c) => c.id));
    return () => onPreviewChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toApprove]);

  function toggleSemester(n: number) {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }
  function upTo(n: number) {
    setDone(new Set(Array.from({ length: n }, (_, i) => i + 1)));
  }
  function toggleException(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const contiguous = semesters.length > 0 && semesters[0] === 1 && semesters.every((n, i) => n === i + 1);
  const rangeLabel = semesters.length === 0 ? "" : contiguous ? (semesters.length === 1 ? "I" : `I–${ROMAN[semesters[semesters.length - 1]]}`) : semesters.map((n) => ROMAN[n]).join(", ");

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
          Marca los semestres que ya terminaste: marcamos todos sus cursos como vistos y tú quitas las excepciones. Si vas a empezar primer semestre, no
          marques ninguno.
        </p>

        <span className={styles.sectionHeading}>¿Qué semestres ya terminaste?</span>
        <div role="group" aria-label="Semestres terminados" style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 4, marginTop: 6 }}>
          {Array.from({ length: maxSemester }, (_, i) => i + 1).map((n) => {
            const on = done.has(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                aria-label={`Semestre ${ROMAN[n]}${on ? " (terminado)" : ""}`}
                onClick={() => toggleSemester(n)}
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: on ? "1px solid #0b4f53" : "1px solid var(--line-control)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: on ? "#0b4f53" : "#fff",
                  color: on ? "#fff" : "var(--ink)",
                }}
              >
                {on ? "✓ " : ""}
                {ROMAN[n]}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 8, fontSize: 12 }}>
          <span style={{ color: "var(--muted)" }}>Atajo: del I al</span>
          {Array.from({ length: maxSemester }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={styles.descToggle} onClick={() => upTo(n)} aria-label={`Marcar del semestre I al ${ROMAN[n]}`}>
              {ROMAN[n]}
            </button>
          ))}
          {done.size > 0 && (
            <button type="button" className={styles.descToggle} onClick={() => setDone(new Set())}>
              ninguno
            </button>
          )}
        </div>

        <div className={styles.box} style={{ marginTop: 14, background: "#eef7f7", border: "1px solid #cfe5e6" }}>
          <span style={{ fontSize: 12.5, color: "#0b4f53" }}>
            {done.size === 0 ? (
              <>Ningún semestre marcado: <strong>no marcamos nada</strong>.</>
            ) : (
              <>
                Quedarán marcados <strong>{toApprove.length} curso(s)</strong> ({totalCredits} créditos) de {semesters.length === 1 ? "el semestre" : "los semestres"}{" "}
                {rangeLabel}
                {newlyMarked < toApprove.length ? ` (${newlyMarked} nuevos)` : ""}. Reemplaza tu selección rápida anterior.
              </>
            )}
          </span>
        </div>

        {semesters.length > 0 && (
          <div className={styles.plannerSection}>
            <span className={styles.sectionHeading}>¿Alguno de estos aún no lo apruebas? Quítale la marca</span>
            {[...semesters].reverse().map((n, idx) => {
              const list = chosenCourses.filter((c) => c.semester === n);
              if (list.length === 0) return null;
              const off = list.filter((c) => excluded.has(c.id)).length;
              return (
                <details key={n} open={idx === 0} style={{ marginBottom: 4 }}>
                  <summary style={{ fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    Semestre {ROMAN[n]} · {list.length - off} de {list.length} marcados
                  </summary>
                  {list.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, height: 30, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={!excluded.has(c.id)} onChange={() => toggleException(c.id)} style={{ accentColor: "var(--t-iele)" }} />
                      {c.code} — {toSentenceCase(c.name)}
                    </label>
                  ))}
                </details>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.panelFooter} style={{ flexDirection: "column", gap: 8, alignItems: "stretch" }}>
        {done.size === 0 ? (
          <button className={styles.btnPrimary} onClick={() => (firstTime ? onBlank() : onConfirm([]))}>
            {firstTime ? "Empezar desde cero" : "Aplicar: sin cursos marcados"}
          </button>
        ) : (
          <button className={styles.btnPrimary} onClick={() => onConfirm(toApprove.map((c) => c.id))}>
            Aplicar: marcar {semesters.length === 1 ? "el semestre" : "los semestres"} {rangeLabel} como vistos
          </button>
        )}
        <p style={{ fontSize: 11, color: "var(--muted-2)", textAlign: "center", margin: 0 }}>Después cambias cualquier curso con un clic.</p>
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
