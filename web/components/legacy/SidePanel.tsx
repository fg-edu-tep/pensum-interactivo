"use client";

import { useState } from "react";
import type {
  Course,
  AvailabilityStatus,
  ElectiveAssignment,
  ElectiveDTO,
  OfferingBadge,
} from "@/lib/types";
import { renderRequirement } from "@/lib/requirementText";
import ElectivePicker from "./ElectivePicker";

/** Course description, clamped to a few lines with a "Ver más" toggle. */
function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 260;
  return (
    <section className="course-description">
      <h3>Descripción</h3>
      <p className={!expanded && long ? "clamped" : undefined}>{text}</p>
      {long && (
        <button
          type="button"
          className="desc-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Ver menos ▲" : "Ver más ▼"}
        </button>
      )}
      <p className="requirement-source">Fuente: catálogo Uniandes.</p>
    </section>
  );
}

const CBU_OFERTA_URL = "https://educaciongeneral.uniandes.edu.co/cbu/";
const OFERTA_CURSOS_URL = "https://ofertadecursos.uniandes.edu.co/";

const TYPE_LABEL: Record<Course["type"], string> = {
  nucleo: "Núcleo",
  electiva: "Electiva",
  cbu: "Ciclo Básico Uniandino",
  complementaria: "Curso de libre elección",
  proyecto: "Proyecto",
};

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  approved: "Aprobada",
  available: "Disponible ahora",
  "one-away": "A un curso de distancia",
  blocked: "Bloqueada",
};

interface Props {
  course: Course | null;
  allCourses: Course[];
  mode: "explore" | "progress";
  status: AvailabilityStatus | null;
  missing: string[];
  coreqBlockers: string[];
  gateReasons: string[];
  dependentsCount: number;
  approved: Set<string>;
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
  onCollapse: () => void;
  onClose: () => void;
}

const ELECTIVE_SLOT_KINDS = new Set(["ELECTIVA", "EFI", "CI"]);

function spaceCode(code: string): string {
  return code.replace(/^([A-ZÑ]{2,6})(\d.*)$/, "$1 $2");
}

function restrictionText(r: { type: string; ind: string; desc: string[] }): string {
  const list = r.desc.join(", ");
  const ind = r.ind.toUpperCase();
  if (ind.includes("EXCLU")) return `No aplica para ${list}`;
  if (ind.includes("SOLO") || ind.includes("INCLU")) return `Solo para ${list}`;
  return `${r.type}: ${list}`;
}

function seatsText(seats: [number, number] | undefined): string {
  if (!seats) return "";
  const [min, max] = seats;
  if (max <= 0) return " · sin cupos libres";
  const lo = Math.max(0, min);
  return lo === max ? ` · ${max} cupos libres` : ` · ${lo}–${max} cupos libres`;
}

function OfferingSection({
  offering,
  term,
  code,
  mihorarioUrl,
}: {
  offering: OfferingBadge | undefined;
  term: string;
  code: string;
  mihorarioUrl: string;
}) {
  const link = mihorarioUrl
    ? `${mihorarioUrl}${mihorarioUrl.includes("?") ? "&" : "?"}nameInput=${encodeURIComponent(code)}`
    : null;

  let dotClass = "off";
  let line = "No se ofrece este periodo";
  if (offering?.syncFailed) {
    dotClass = "stale";
    line = "Sin datos de oferta (revisar sincronización)";
  } else if (offering?.offered) {
    dotClass = "on";
    line = "Se dicta este periodo";
  }

  return (
    <section className="offering-block">
      <div className="offering-line">
        <span className={`offering-dot ${dotClass}`} />
        {line} <span style={{ color: "#9ca3af", fontWeight: 400 }}>· {term}</span>
      </div>

      {offering?.offered && (
        <>
          <div className="offering-detail">
            {offering.sectionCount} sección(es)
            {seatsText(offering.seatsAvailable)}
          </div>
          {(offering.attrs.length > 0 || offering.ptrm.length > 0) && (
            <div className="chip-row">
              {offering.ptrm.map((p) => (
                <span className="chip ptrm" key={`p-${p}`}>
                  {p === "16" ? "16 sem" : p}
                </span>
              ))}
              {offering.attrs.map((a) => (
                <span className="chip" key={`a-${a}`}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {link && (
        <a className="mihorario-link" href={link} target="_blank" rel="noopener noreferrer">
          Ver secciones y armar horario en Mi Horario →
        </a>
      )}
    </section>
  );
}

export default function SidePanel({
  course,
  allCourses,
  mode,
  status,
  missing,
  coreqBlockers,
  gateReasons,
  dependentsCount,
  approved,
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
  onCollapse,
  onClose,
}: Props) {
  if (!course) {
    return (
      <aside className="side-panel side-panel-empty">
        <p>Selecciona un curso en el mapa para ver sus detalles.</p>
      </aside>
    );
  }

  const kind = course.placeholderKind ?? "";
  const isEnglishReq = kind === "REQING";
  const isCbuSlot = kind === "CBU";
  const isCleSlot = kind === "CLE";
  const isElectiveSlot =
    course.isPlaceholder &&
    (course.type === "electiva" || ELECTIVE_SLOT_KINDS.has(kind));

  // --- RequirementNode-backed slot (e.g. lectura en inglés): its own panel,
  //     all copy/link/attestation come from the DB row via the payload ---
  if (isEnglishReq) {
    const attId = course.requirementAttestationId ?? "";
    const met = attId ? attestationsMet.has(attId) : false;
    return (
      <aside className="side-panel">
        <button className="side-panel-collapse" onClick={onCollapse} aria-label="Ocultar panel" title="Ocultar panel">›</button>
        <button className="side-panel-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className="side-panel-code">Requisito de grado</div>
        <h2>{course.name}</h2>
        <div className="side-panel-meta">
          <span>{course.credits} créditos</span>
          <span>No es un curso de la oferta</span>
        </div>

        {mode === "progress" && attId && (
          <div className={`status-banner status-banner-${met ? "approved" : "one-away"}`}>
            {met ? "Cumplido" : "Pendiente"}
          </div>
        )}

        <section>
          {course.requirementDescription && <p>{course.requirementDescription}</p>}
          <p className="requirement-note">
            Los cursos que lo exigen lo muestran como prerrequisito en el mapa.
          </p>
          {course.requirementInfoUrl && (
            <a
              className="mihorario-link"
              href={course.requirementInfoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              En qué consiste el requisito y cómo cumplirlo →
            </a>
          )}
        </section>

        <section>
          <h3>Impacto</h3>
          <p>
            {dependentsCount === 0
              ? "Ningún curso de este plan lo exige como prerrequisito."
              : `${dependentsCount} curso(s) de este plan lo exigen como prerrequisito.`}
          </p>
        </section>

        {mode === "progress" && attId && (
          <button
            className={`approve-toggle ${met ? "is-approved" : ""}`}
            onClick={() => onToggleAttestation(attId)}
          >
            {met ? "Marcar como pendiente" : "Marcar como cumplido"}
          </button>
        )}
      </aside>
    );
  }

  const byNormalized = new Map(allCourses.map((c) => [c.codeNormalized, c]));
  const label = (code: string) => {
    const c = byNormalized.get(code);
    return c ? `${c.code} — ${c.name}` : `${code} (fuera de este pensum)`;
  };
  const missingLabels = missing.map(label);
  const coreqBlockerLabels = coreqBlockers.map(label);

  return (
    <aside className="side-panel">
      <button
        className="side-panel-collapse"
        onClick={onCollapse}
        aria-label="Ocultar panel"
        title="Ocultar panel"
      >
        ›
      </button>
      <button className="side-panel-close" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
      <div className="side-panel-code">{course.code}</div>
      <h2>{course.name}</h2>
      <div className="side-panel-meta">
        <span>{course.credits} créditos</span>
        <span>Semestre sugerido: {course.semester}</span>
        <span>{TYPE_LABEL[course.type]}</span>
      </div>

      {mode === "progress" && status && (
        <div className={`status-banner status-banner-${status}`}>
          {gateReasons.length > 0 ? "🔒 Bloqueada por una regla del plan" : STATUS_LABEL[status]}
        </div>
      )}

      {mode === "progress" && gateReasons.length > 0 && (
        <section className="gate-section">
          <h3>Reglas del plan por cumplir</h3>
          <ul className="gate-list">
            {gateReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="gate-note">
            Marca los requisitos cumplidos en <strong>Requisitos</strong> (barra
            superior) o aprueba los cursos indicados.
          </p>
        </section>
      )}

      {course.description && (
        <DescriptionBlock key={course.id} text={course.description} />
      )}

      <section className="req-section req-prereq">
        <h3>
          Prerrequisitos <span className="req-hint">deben estar aprobados antes</span>
        </h3>
        <p className="requirement-text">
          {course.prereqTree
            ? renderRequirement(course.prereqTree, allCourses)
            : "Sin prerrequisitos."}
        </p>
        {course.prereqExternal.length > 0 && (
          <p className="requirement-note">
            También exige requisitos fuera de este pensum (idiomas, exámenes de
            clasificación, etc.) no representados en el grafo.
          </p>
        )}
        {course.prereqSource && (
          <p className="requirement-source">
            {course.prereqSource === "api"
              ? `Según la oferta de ${term}.`
              : "Según el documento de prerrequisitos."}
          </p>
        )}
      </section>

      <section className="req-section req-coreq">
        <h3>
          Correquisitos <span className="req-hint">se ven al tiempo (o antes)</span>
        </h3>
        {course.coreqExternal.length > 0 ? (
          <ul className="coreq-list">
            {course.coreqExternal.map((c) => {
              const title = course.coreqTitles?.[c];
              return (
                <li key={c}>
                  <strong>{spaceCode(c)}</strong>
                  {title ? ` — ${title}` : ""}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="requirement-text">
            {course.coreqTree
              ? renderRequirement(course.coreqTree, allCourses)
              : "Sin correquisitos."}
          </p>
        )}
        {course.coreqExternal.length > 0 && (
          <p className="requirement-note">
            Debes inscribir estos componentes (laboratorio, práctica o trabajo
            asistido) en el mismo periodo.
          </p>
        )}
      </section>

      {course.restrictions && course.restrictions.length > 0 && (
        <section className="req-section req-restr">
          <h3>
            Restricciones <span className="req-hint">informativas</span>
          </h3>
          <div className="chip-row">
            {course.restrictions.map((r, i) => (
              <span className="chip" key={i}>
                {restrictionText(r)}
              </span>
            ))}
          </div>
        </section>
      )}

      {mode === "progress" &&
        status !== "approved" &&
        (missingLabels.length > 0 || coreqBlockerLabels.length > 0) && (
          <section>
            <h3>Te falta</h3>
            {missingLabels.length > 0 && (
              <>
                <p className="missing-kind">Aprobar antes:</p>
                <ul className="missing-list">
                  {missingLabels.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
            {coreqBlockerLabels.length > 0 && (
              <>
                <p className="missing-kind">
                  Poder inscribir al tiempo (correquisito bloqueado):
                </p>
                <ul className="missing-list missing-list-coreq">
                  {coreqBlockerLabels.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

      <section>
        <h3>Impacto</h3>
        <p>
          {dependentsCount === 0
            ? "Ningún otro curso del pensum lo requiere directa o indirectamente."
            : `${dependentsCount} curso(s) del pensum dependen de este, directa o indirectamente.`}
        </p>
      </section>

      {!course.isPlaceholder && (
        <OfferingSection
          offering={offering}
          term={term}
          code={course.codeNormalized}
          mihorarioUrl={mihorarioUrl}
        />
      )}

      {isElectiveSlot && (
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
      )}

      {isCbuSlot && (
        <section className="ext-link-block">
          <h3>Oferta de CBU</h3>
          <p>
            Elige cualquier Ciclo Básico Uniandino de la oferta vigente que aún
            no hayas cursado.
          </p>
          <a
            className="mihorario-link"
            href={CBU_OFERTA_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver la oferta de CBU →
          </a>
        </section>
      )}

      {isCleSlot && (
        <section className="ext-link-block">
          <h3>Curso de libre elección</h3>
          <p>
            <strong>Cualquier curso con código Uniandes</strong> que no hayas
            tomado cuenta como homologable para este espacio (según las reglas de
            tu programa).
          </p>
          <a
            className="mihorario-link"
            href={OFERTA_CURSOS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Explorar la oferta de cursos →
          </a>
        </section>
      )}

      {mode === "progress" && !course.isPlaceholder && (
        <button
          className={`approve-toggle ${approved.has(course.id) ? "is-approved" : ""}`}
          onClick={() => onToggleApproved(course.id)}
          disabled={gateReasons.length > 0 && !approved.has(course.id)}
          title={
            gateReasons.length > 0 && !approved.has(course.id)
              ? "No puedes marcarla mientras una regla del plan la bloquee"
              : undefined
          }
        >
          {approved.has(course.id) ? "Desmarcar como vista" : "Marcar como vista"}
        </button>
      )}
    </aside>
  );
}
