"use client";

import type { Course, AvailabilityStatus } from "@/lib/types";
import { toSentenceCase, nextTermCode, nextTermShort } from "./format";
import { ArrowRightIcon, PlusIcon, ShareIcon } from "./icons";
import styles from "./explorer.module.css";

interface Props {
  courses: Course[];
  approved: Set<string>;
  planned: Map<string, string>; // courseId -> term
  statusById: Map<string, AvailabilityStatus>;
  term: string;
  creditsDone: number;
  creditsTotal: number;
  unlockedNextTerm: Course[];
  mihorarioUrl: string;
  onTogglePlanned: (id: string, term: string | null) => void;
  onSelectCourse: (id: string) => void;
  onShare: () => void;
}

export default function PlannerPanel({
  courses,
  approved,
  planned,
  statusById,
  term,
  creditsDone,
  creditsTotal,
  unlockedNextTerm,
  mihorarioUrl,
  onTogglePlanned,
  onSelectCourse,
  onShare,
}: Props) {
  const plannedCourses = courses.filter((c) => planned.has(c.id));
  const plannedCredits = plannedCourses.reduce((s, c) => s + c.credits, 0);
  const pct = creditsTotal > 0 ? Math.round((creditsDone / creditsTotal) * 100) : 0;
  const nextTerm = nextTermShort(term);

  const suggestions = courses
    .filter((c) => !c.isPlaceholder && !approved.has(c.id) && !planned.has(c.id) && statusById.get(c.id) === "available")
    .slice(0, 4);

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.lbl}>Mi avance</span>
        <div className={styles.plannerHeaderBig}>
          <span className={styles.plannerBig}>{creditsDone}</span>
          <span className={styles.plannerBigLabel}>de {creditsTotal} créditos aprobados</span>
          <span className={styles.plannerPct}>{pct}%</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressSegApproved} style={{ width: `${pct}%` }} />
          <div className={styles.progressSegPlanned} style={{ width: `${creditsTotal > 0 ? (plannedCredits / creditsTotal) * 100 : 0}%` }} />
        </div>
        <div className={styles.progressLegend}>
          <span><i className={styles.legendDot} style={{ background: "var(--t-iele)" }} />Aprobados</span>
          <span><i className={styles.legendDot} style={{ background: "var(--accent)" }} />En tu plan {nextTerm}</span>
        </div>
      </div>

      <div className={styles.panelBody}>
        <div className={styles.plannerSection}>
          <div className={styles.plannerSectionHead}>
            <span className={styles.lbl}>Plan para</span>
            <span className={styles.termPicker}>{nextTerm}</span>
            <span className={styles.plannerTotal}>{plannedCredits} cr</span>
          </div>
          {plannedCourses.length === 0 ? (
            <p className={styles.chainNone} style={{ marginTop: 10 }}>
              Aún no has agregado cursos a tu plan.
            </p>
          ) : (
            plannedCourses.map((c) => (
              <div className={styles.plannedRow} key={c.id}>
                <span className={styles.plannedRowCode}>{c.code}</span>
                <button type="button" onClick={() => onSelectCourse(c.id)} className={styles.plannedRowTitle} style={{ border: "none", background: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                  {toSentenceCase(c.name)}
                </button>
                <span className={styles.plannedRowCredits}>{c.credits} cr</span>
                <button className={styles.plannedRemove} onClick={() => onTogglePlanned(c.id, null)} aria-label="Quitar del plan">
                  ×
                </button>
              </div>
            ))
          )}

          {unlockedNextTerm.length > 0 && (
            <div className={styles.unlockInsight}>
              <span>
                Con este plan se desbloquean <strong>{unlockedNextTerm.length} curso(s)</strong> para más
                adelante: {unlockedNextTerm.map((c) => c.code).join(", ")}.
              </span>
            </div>
          )}
        </div>

        <div className={styles.plannerSection}>
          <span className={styles.lbl}>Disponibles para agregar · {suggestions.length}</span>
          {suggestions.map((c) => (
            <div className={styles.suggestRow} key={c.id}>
              <button type="button" onClick={() => onSelectCourse(c.id)} className={styles.plannedRowTitle} style={{ border: "none", background: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                <span className={styles.plannedRowCode} style={{ width: "auto", marginRight: 8 }}>{c.code}</span>
                {toSentenceCase(c.name)}
              </button>
              <button className={styles.suggestAdd} onClick={() => onTogglePlanned(c.id, nextTermCode(term))} aria-label="Agregar al plan">
                <PlusIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.plannerFooter}>
        {mihorarioUrl && (
          <a href={mihorarioUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
            Armar horario en Mi Horario <ArrowRightIcon size={14} />
          </a>
        )}
        <button className={styles.iconBtn} onClick={onShare} aria-label="Compartir">
          <ShareIcon />
        </button>
      </div>
    </aside>
  );
}
