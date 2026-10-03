"use client";

import type { Course, AvailabilityStatus } from "@/lib/types";
import { toSentenceCase, nextTermCode, nextTermShort } from "./format";
import { ArrowRightIcon, BasketIcon, ShareIcon } from "./icons";
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
  onOpenBasket: () => void;
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
  onOpenBasket,
  onSelectCourse,
  onShare,
}: Props) {
  const plannedCourses = courses.filter((c) => planned.has(c.id));
  const plannedCredits = plannedCourses.reduce((s, c) => s + c.credits, 0);
  const pct = creditsTotal > 0 ? Math.round((creditsDone / creditsTotal) * 100) : 0;
  const nextTerm = nextTermShort();

  const suggestions = courses
    .filter((c) => !c.isPlaceholder && !approved.has(c.id) && !planned.has(c.id) && statusById.get(c.id) === "available")
    .slice(0, 4);

  return (
    <aside className={styles.panel} data-tour="planner">
      <div className={styles.panelHeader} data-tour="progress">
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
        <div className={styles.plannerSection} data-tour="cart">
          <div className={styles.basketHead}>
            <span className={styles.basketBadge}>
              <BasketIcon size={20} />
              {plannedCourses.length > 0 && (
                <span key={plannedCourses.length} className={styles.basketCount}>
                  {plannedCourses.length}
                </span>
              )}
            </span>
            <div className={styles.basketHeadText}>
              <span className={styles.basketTitle}>Tu canasta</span>
              <span className={styles.basketSub}>cursos para {nextTerm}</span>
            </div>
            <span className={styles.basketCredits}>{plannedCredits} cr</span>
          </div>
          {plannedCourses.length === 0 ? (
            <div className={styles.basketEmpty}>
              <BasketIcon size={34} />
              <strong>Tu canasta está vacía</strong>
              <span>Agrega los cursos que quieres ver el próximo semestre con el botón de abajo, o desde el mapa.</span>
            </div>
          ) : (
            plannedCourses.map((c) => (
              <div className={styles.plannedRow} key={c.id}>
                <span className={styles.plannedRowCode}>{c.code}</span>
                <button type="button" onClick={() => onSelectCourse(c.id)} className={styles.plannedRowTitle} style={{ border: "none", background: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                  {toSentenceCase(c.name)}
                </button>
                <span className={styles.plannedRowCredits}>{c.credits} cr</span>
                <button className={styles.plannedRemove} onClick={() => onTogglePlanned(c.id, null)} aria-label="Quitar de la canasta">
                  ×
                </button>
              </div>
            ))
          )}

          {unlockedNextTerm.length > 0 && (
            <div className={styles.unlockInsight}>
              <span>
                Con esta canasta se desbloquean <strong>{unlockedNextTerm.length} curso(s)</strong> para más
                adelante: {unlockedNextTerm.map((c) => c.code).join(", ")}.
              </span>
            </div>
          )}
        </div>

        <div className={styles.plannerSection} data-tour="suggest">
          <span className={styles.lbl}>Disponibles para agregar · {suggestions.length}</span>
          {suggestions.map((c) => (
            <div className={styles.suggestRow} key={c.id}>
              <button type="button" onClick={() => onSelectCourse(c.id)} className={styles.plannedRowTitle} style={{ border: "none", background: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}>
                <span className={styles.plannedRowCode} style={{ width: "auto", marginRight: 8 }}>{c.code}</span>
                {toSentenceCase(c.name)}
              </button>
              <button className={styles.suggestAddPill} onClick={() => onTogglePlanned(c.id, nextTermCode())} aria-label="Agregar a la canasta">
                <BasketIcon size={13} /> Agregar
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.plannerFooter}>
        {plannedCourses.length > 0 ? (
          // once there's something in the basket, the next step is to review
          // and confirm it (sections, teachers, week) — the checkout modal
          <button type="button" className={styles.btnPrimary} onClick={onOpenBasket}>
            Revisar mi canasta · {plannedCredits} cr <ArrowRightIcon size={14} />
          </button>
        ) : (
          mihorarioUrl && (
            <a href={mihorarioUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
              Armar horario en Mi Horario <ArrowRightIcon size={14} />
            </a>
          )
        )}
        <button className={styles.iconBtn} onClick={onShare} aria-label="Compartir">
          <ShareIcon />
        </button>
      </div>
    </aside>
  );
}
