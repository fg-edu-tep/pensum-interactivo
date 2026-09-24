"use client";

import { useState } from "react";
import type {
  Course,
  AvailabilityStatus,
  ElectiveAssignment,
  ElectiveDTO,
  OfferingBadge,
} from "@/lib/types";
import ElectivePicker from "@/components/legacy/ElectivePicker";
import ChainMiniature from "./ChainMiniature";
import RequirementTree from "./RequirementTree";
import { groupClass, groupColor, groupOf, spaceCode, toSentenceCase, nextTermCode, nextTermShort } from "./format";
import { ChevronRightIcon, CloseIcon, CheckIcon, ExternalIcon } from "./icons";
import styles from "./explorer.module.css";

const CBU_OFERTA_URL = "https://educaciongeneral.uniandes.edu.co/cbu/";
const OFERTA_CURSOS_URL = "https://ofertadecursos.uniandes.edu.co/";
const ELECTIVE_SLOT_KINDS = new Set(["ELECTIVA", "EFI", "CI"]);

const TYPE_LABEL: Record<Course["type"], string> = {
  nucleo: "Núcleo",
  electiva: "Electiva",
  cbu: "Ciclo Básico Uniandino",
  complementaria: "Curso de libre elección",
  proyecto: "Proyecto",
};

function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 260;
  return (
    <div className={styles.descBox}>
      <span className={styles.sectionHeading}>Descripción</span>
      <p
        style={
          !expanded && long
            ? { display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }
            : undefined
        }
      >
        {text}
      </p>
      {long && (
        <button type="button" className={styles.descToggle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

function seatsText(seats: [number, number] | undefined): string {
  if (!seats) return "";
  const [min, max] = seats;
  if (max <= 0) return " · sin cupos libres";
  const lo = Math.max(0, min);
  return lo === max ? ` · ${max} cupos libres` : ` · ${lo}–${max} cupos libres`;
}

interface Props {
  course: Course | null;
  allCourses: Course[];
  catalogCodes: Set<string>;
  mode: "explore" | "progress";
  status: AvailabilityStatus | null;
  gateReasons: string[];
  directDependentIds: string[];
  chainExtraCount: number;
  approved: Set<string>;
  isPlanned: boolean;
  offering: OfferingBadge | undefined;
  term: string;
  mihorarioUrl: string;
  electives: ElectiveDTO[];
  programCode: string;
  assignment: ElectiveAssignment | undefined;
  attestationsMet: Set<string>;
  onToggleAttestation: (id: string) => void;
  onAssignElective: (slotId: string, a: ElectiveAssignment | null) => void;
  onToggleApproved: (id: string) => void;
  onTogglePlanned: (id: string, term: string | null) => void;
  onSelectCourse: (id: string) => void;
  onCollapse: () => void;
  onClose: () => void;
  tourTargetChain?: boolean;
}

export default function SidePanel({
  course,
  allCourses,
  catalogCodes,
  mode,
  status,
  gateReasons,
  directDependentIds,
  chainExtraCount,
  approved,
  isPlanned,
  offering,
  term,
  mihorarioUrl,
  electives,
  programCode,
  assignment,
  attestationsMet,
  onToggleAttestation,
  onAssignElective,
  onToggleApproved,
  onTogglePlanned,
  onSelectCourse,
  onCollapse,
  onClose,
  tourTargetChain,
}: Props) {
  if (!course) {
    return (
      <aside className={`${styles.panel} ${styles.panelEmpty}`}>
        <p>Selecciona un curso en el mapa para ver sus detalles.</p>
      </aside>
    );
  }

  const kind = course.placeholderKind ?? "";
  const isEnglishReq = kind === "REQING";
  const isCbuSlot = kind === "CBU";
  const isCleSlot = kind === "CLE";
  const isElectiveSlot = course.isPlaceholder && (course.type === "electiva" || ELECTIVE_SLOT_KINDS.has(kind));
  const group = groupOf(course);
  const title = toSentenceCase(course.name);

  const link = mihorarioUrl
    ? `${mihorarioUrl}${mihorarioUrl.includes("?") ? "&" : "?"}nameInput=${encodeURIComponent(course.codeNormalized)}`
    : null;

  if (isEnglishReq) {
    const attId = course.requirementAttestationId ?? "";
    const met = attId ? attestationsMet.has(attId) : false;
    return (
      <aside className={styles.panel}>
        <div className={styles.panelHeader}>
          <button className={styles.panelCollapse} onClick={onCollapse} aria-label="Ocultar panel"><ChevronRightIcon /></button>
          <button className={styles.panelClose} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
          <div className={styles.panelContext}>
            <span className={styles.panelSwatch} style={{ background: "var(--t-req)" }} />
            Requisito de grado
          </div>
          <h2 className={styles.panelTitle}>{title}</h2>
        </div>
        <div className={styles.panelBody}>
          {mode === "progress" && attId && (
            <div className={styles.statusBanner} style={met ? { background: "#dcfce7", color: "#166534" } : { background: "#fef3c7", color: "#92400e" }}>
              {met ? "Cumplido" : "Pendiente"}
            </div>
          )}
          {course.requirementDescription && <p style={{ fontSize: 13, marginTop: 12 }}>{course.requirementDescription}</p>}
          {course.requirementInfoUrl && (
            <a href={course.requirementInfoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              En qué consiste y cómo cumplirlo <ExternalIcon size={12} />
            </a>
          )}
        </div>
        {mode === "progress" && attId && (
          <div className={styles.panelFooter}>
            <button className={styles.btnPrimary} onClick={() => onToggleAttestation(attId)}>
              {met ? "Marcar como pendiente" : "Marcar como cumplido"}
            </button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <button className={styles.panelCollapse} onClick={onCollapse} aria-label="Ocultar panel"><ChevronRightIcon /></button>
        <button className={styles.panelClose} onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        <div className={styles.panelContext}>
          <span className={styles.panelSwatch} style={{ background: groupColor(group) }} />
          {TYPE_LABEL[course.type]} · Semestre {course.semester}
        </div>
        <h2 className={styles.panelTitle}>{title}</h2>
        <div className={styles.panelMeta}>
          <span className={styles.panelMetaCode}>{course.code}</span>
          <span>{course.credits} créditos</span>
        </div>
      </div>

      <div className={styles.panelBody}>
        {mode === "progress" && gateReasons.length > 0 && (
          <div className={styles.gateBox}>
            <h3>Reglas del plan por cumplir</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {gateReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {!course.isPlaceholder && (
          <ChainMiniature
            course={course}
            allCourses={allCourses}
            directDependentIds={directDependentIds}
            chainExtraCount={chainExtraCount}
            mode={mode}
            approved={approved}
            onSelect={onSelectCourse}
            tourTarget={tourTargetChain}
          />
        )}

        {!course.isPlaceholder && (
          <div className={styles.offerBox + " " + (offering?.syncFailed ? styles.stale : offering?.offered ? styles.on : styles.off)}>
            <div className={styles.offerLine}>
              <span className={`${styles.offerDot} ${offering?.syncFailed ? styles.stale : offering?.offered ? styles.on : styles.off}`} />
              {offering?.syncFailed
                ? "Sin datos de oferta"
                : offering?.offered
                  ? `Se dicta este periodo · ${term}`
                  : `No se dicta en ${term}`}
            </div>
            {offering?.offered && (
              <div className={styles.offerDetail}>
                {offering.sectionCount} sección(es)
                {seatsText(offering.seatsAvailable)}
              </div>
            )}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                Ver secciones en Mi Horario <ExternalIcon size={12} />
              </a>
            )}
          </div>
        )}

        {!course.isPlaceholder && (
          <div className={styles.sectionGap}>
            <RequirementTree
              course={course}
              allCourses={allCourses}
              catalogCodes={catalogCodes}
              mode={mode}
              approved={approved}
              onSelectCourse={onSelectCourse}
            />
          </div>
        )}

        {!course.isPlaceholder && (course.coreqExternal.length > 0 || course.coreqCourseIds.length > 0) && (
          <p className={styles.secondaryLine}>
            <strong>Correquisitos</strong>{" "}
            {course.coreqExternal.length > 0
              ? course.coreqExternal.map((c) => spaceCode(c)).join(", ")
              : course.coreqCourseIds.map((id) => allCourses.find((c) => c.id === id)?.code).filter(Boolean).join(", ")}
            {" · debes inscribirlos al tiempo"}
          </p>
        )}

        {course.restrictions && course.restrictions.length > 0 && (
          <div className={styles.sectionGap}>
            <span className={styles.sectionHeading}>Restricciones</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {course.restrictions.map((r, i) => (
                <span key={i} className={styles.chipMini}>
                  {r.ind.toUpperCase().includes("EXCLU") ? "No aplica: " : "Solo: "}
                  {r.desc.join(", ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {course.description && <DescriptionBlock text={course.description} />}

        {isElectiveSlot && (
          <div className={styles.slotPanelSection}>
            <ElectivePicker
              electives={electives}
              programCode={programCode}
              slotLabel={course.placeholderLabel || course.code}
              term={term}
              mihorarioUrl={mihorarioUrl}
              mode={mode}
              assignment={assignment}
              slotCredits={course.credits}
              integradorOnly={kind === "CI"}
              onAssign={(a) => onAssignElective(course.id, a)}
            />
          </div>
        )}

        {isCbuSlot && (
          <div className={styles.sectionGap} style={{ borderLeft: "3px solid var(--t-cbu)", paddingLeft: 10 }}>
            <h3>Oferta de CBU</h3>
            <p style={{ fontSize: 12.5, color: "var(--muted)" }}>Elige cualquier Ciclo Básico Uniandino vigente que aún no hayas cursado.</p>
            <a href={CBU_OFERTA_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>
              Ver la oferta de CBU →
            </a>
          </div>
        )}

        {isCleSlot && (
          <div className={styles.sectionGap} style={{ borderLeft: "3px solid var(--t-req)", paddingLeft: 10 }}>
            <h3>Curso de libre elección</h3>
            <p style={{ fontSize: 12.5, color: "var(--muted)" }}>Cualquier curso Uniandes que no hayas tomado homologa para este espacio.</p>
            <a href={OFERTA_CURSOS_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>
              Explorar la oferta de cursos →
            </a>
          </div>
        )}
      </div>

      {!course.isPlaceholder && (
        <div className={styles.panelFooter}>
          {mode === "explore" ? (
            <button className={styles.btnPrimary} onClick={() => onToggleApproved(course.id)}>
              <CheckIcon />
              {approved.has(course.id) ? "Desmarcar aprobada" : "Marcar aprobada"}
            </button>
          ) : approved.has(course.id) ? (
            <button className={styles.btnPrimary} onClick={() => onToggleApproved(course.id)}>
              Desmarcar
            </button>
          ) : status === "available" ? (
            <button className={styles.btnPrimary} onClick={() => onTogglePlanned(course.id, isPlanned ? null : nextTermCode(term))}>
              {isPlanned ? "Quitar del plan" : `Agregar a ${nextTermShort(term)}`}
            </button>
          ) : (
            <button
              className={styles.btnPrimary}
              disabled={gateReasons.length > 0}
              onClick={() => onTogglePlanned(course.id, isPlanned ? null : nextTermCode(term))}
            >
              {isPlanned ? "Quitar del plan" : `Planear para ${nextTermShort(term)}`}
            </button>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className={styles.btnGhostFooter}>
              Ver secciones <ExternalIcon size={13} />
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
