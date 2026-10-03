"use client";

import type { CourseGroup } from "./format";
import { GROUP_LABEL, groupColor } from "./format";
import styles from "./explorer.module.css";
import type { RelacionesMode } from "./MapCanvas";
import type { UnlockView } from "./UnlockViewControl";

const EXPLORE_GROUPS: { group: CourseGroup; dashed: boolean }[] = [
  { group: "iele", dashed: false },
  { group: "cb", dashed: false },
  { group: "otr", dashed: false },
  { group: "pro", dashed: false },
  { group: "ele", dashed: true },
  { group: "cbu", dashed: true },
];

export type StatusFilter = "approved" | "available" | "one-away" | "blocked" | "admin";
const SWATCH_CLASS: Record<StatusFilter, string> = {
  approved: "swApproved",
  available: "swAvailable",
  "one-away": "swAvailable",
  blocked: "swBlocked",
  admin: "swAdmin",
};
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "approved", label: "Aprobadas" },
  { key: "available", label: "Disponibles" },
  { key: "blocked", label: "Bloqueadas" },
  { key: "admin", label: "Regla administrativa" },
];

interface Props {
  mode: "explore" | "progress";
  hiddenGroups: Set<CourseGroup>;
  onToggleGroup: (g: CourseGroup) => void;
  relaciones: RelacionesMode;
  onRelacionesChange: (r: RelacionesMode) => void;
  unlockView: UnlockView;
  statusCounts: Record<StatusFilter, number>;
  hiddenStatuses: Set<StatusFilter>;
  onToggleStatus: (s: StatusFilter) => void;
  quickMode: boolean;
  onQuickToggle: () => void;
  onReset: () => void;
}

export default function Toolbar({
  mode,
  hiddenGroups,
  onToggleGroup,
  relaciones,
  onRelacionesChange,
  unlockView,
  statusCounts,
  hiddenStatuses,
  onToggleStatus,
  quickMode,
  onQuickToggle,
  onReset,
}: Props) {
  if (mode === "explore") {
    return (
      <div className={styles.toolbar}>
        <span className={styles.lbl}>Mostrar</span>
        <div className={styles.chipRow} data-tour="groups">
          {EXPLORE_GROUPS.map(({ group, dashed }) => {
            const off = hiddenGroups.has(group);
            return (
              <button
                key={group}
                type="button"
                className={`${styles.chip} ${off ? styles.off : ""}`}
                aria-pressed={!off}
                onClick={() => onToggleGroup(group)}
                style={!off ? { color: groupColor(group) } : undefined}
              >
                <span
                  className={dashed ? styles.chipSwatchDashed : styles.chipSwatch}
                  style={{ background: dashed ? undefined : groupColor(group), color: groupColor(group) }}
                />
                {GROUP_LABEL[group]}
              </button>
            );
          })}
        </div>
        <div className={styles.vDivider} />
        <span className={styles.lbl}>Relaciones</span>
        <div
          className={styles.segSm}
          role="group"
          aria-label="Relaciones"
          data-tour="relaciones"
        >
          <button
            type="button"
            className={`${styles.segSmBtn} ${relaciones === "directas" ? styles.active : ""}`}
            aria-pressed={relaciones === "directas"}
            onClick={() => onRelacionesChange("directas")}
          >
            Directas
          </button>
          <button
            type="button"
            className={`${styles.segSmBtn} ${relaciones === "cadena" ? styles.active : ""}`}
            aria-pressed={relaciones === "cadena"}
            onClick={() => onRelacionesChange("cadena")}
          >
            Toda la cadena
          </button>
        </div>
        <div className={styles.edgeLegend} data-tour="legend">
          <span className={styles.legendSample}>
            <svg width="20" height="8" aria-hidden>
              <line x1="1" y1="4" x2="14" y2="4" stroke="var(--edge-prereq)" strokeWidth="2" />
              <path d="M14 1 L19 4 L14 7 Z" fill="var(--edge-prereq)" />
            </svg>
            Prerrequisito
          </span>
          <span className={styles.legendSample}>
            <svg width="20" height="8" aria-hidden>
              <line x1="1" y1="4" x2="19" y2="4" stroke="var(--edge-coreq)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Correquisito
          </span>
          {unlockView !== "off" && (
            <span className={styles.legendSample} title="Aprobar el curso seleccionado basta para poder ver este.">
              <svg width="20" height="8" aria-hidden>
                <line x1="1" y1="4" x2="14" y2="4" stroke="var(--st-ok)" strokeWidth="2" />
                <path d="M14 1 L19 4 L14 7 Z" fill="var(--st-ok)" />
              </svg>
              Único requisito
            </span>
          )}
          {unlockView === "all" && (
            <span className={styles.legendSample} title="El curso seleccionado es uno de varios requisitos: ayuda, pero no basta.">
              <svg width="20" height="8" aria-hidden>
                <line x1="1" y1="4" x2="14" y2="4" stroke="var(--st-warn)" strokeWidth="2" />
                <path d="M14 1 L19 4 L14 7 Z" fill="var(--st-warn)" />
              </svg>
              Uno de varios
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.toolbar}>
      <span className={styles.lbl}>Estado</span>
      <div className={styles.chipRow} data-tour="status">
        {STATUS_FILTERS.map(({ key, label }) => {
          const off = hiddenStatuses.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${off ? styles.off : ""}`}
              aria-pressed={!off}
              onClick={() => onToggleStatus(key)}
            >
              <span className={`${styles.stSw} ${styles[SWATCH_CLASS[key]]}`} aria-hidden />
              {label}
              <span className={styles.chipCount}>{statusCounts[key]}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.spacer} />
      {/* the same line legend as Explorar: it matters here too, as soon as a
          course is selected and its prerequisite / corequisite lines appear */}
      <div className={styles.edgeLegend} data-tour="legend">
        <span className={styles.legendSample} title="Línea azul continua: debe estar aprobado antes de inscribir el curso.">
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="14" y2="4" stroke="var(--edge-prereq)" strokeWidth="2" />
            <path d="M14 1 L19 4 L14 7 Z" fill="var(--edge-prereq)" />
          </svg>
          Prerrequisito
        </span>
        <span className={styles.legendSample} title="Línea ámbar punteada: se inscribe al tiempo, o puede cursarse el mismo semestre.">
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="19" y2="4" stroke="var(--edge-coreq)" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Correquisito
        </span>
      </div>
      <button
        type="button"
        className={`${styles.ghostBtn} ${quickMode ? styles.active : ""}`}
        onClick={onQuickToggle}
        data-tour="quick"
        aria-pressed={quickMode}
      >
        Selección rápida
      </button>
      <button type="button" className={styles.ghostBtn} onClick={onReset}>
        Reiniciar avance
      </button>
    </div>
  );
}
