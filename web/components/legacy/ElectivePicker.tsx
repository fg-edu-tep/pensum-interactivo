"use client";

import { useMemo, useState } from "react";
import type {
  ElectiveAssignment,
  ElectiveDTO,
  RoleCell,
} from "@/lib/types";
import { foldAccents } from "@/lib/import/textMatch";

interface Props {
  electives: ElectiveDTO[];
  programCode: string; // "IELE" | "IELC" | "DOBLE"
  slotLabel: string; // the placeholder's label/name, narrows the pool
  term: string;
  mihorarioUrl: string;
  /** "Mi avance" enables picking a real elective for this slot */
  mode: "explore" | "progress";
  assignment?: ElectiveAssignment;
  slotCredits: number;
  /** Curso Integrador slot — filter to the flagged subset, ignore role narrowing */
  integradorOnly?: boolean;
  onAssign: (a: ElectiveAssignment | null) => void;
}

type Era = "from2024" | "until2023";

const ROLE_LABEL: Record<string, string> = {
  obligatoria: "Obligatoria",
  electiva: "Electiva",
  area_mayor: "Área mayor",
  curso_integrador: "Curso integrador",
  proy_grado: "Proyecto de grado",
  cle: "Libre elección",
  practica: "Práctica",
  pasantia: "Pasantía",
  maestria: "Electiva de maestría",
};

function termShort(term: string): string {
  const year = term.slice(0, 4);
  const period = term.slice(4);
  return `${year}-${period === "10" ? "1" : period === "30" ? "V" : "2"}`;
}

function narrowFromSlot(slotLabel: string): string | null {
  const s = foldAccents(slotLabel);
  if (s.includes("AREA MAYOR")) return "area_mayor";
  if (s.includes("INTEGRADOR")) return "curso_integrador";
  if (s.includes("LIBRE") || s.includes("CLE")) return "cle";
  return null;
}

export default function ElectivePicker({
  electives,
  programCode,
  slotLabel,
  term,
  mihorarioUrl,
  mode,
  assignment,
  slotCredits,
  integradorOnly = false,
  onAssign,
}: Props) {
  const [era, setEra] = useState<Era>("from2024");
  const [onlyThisTerm, setOnlyThisTerm] = useState(true);
  const [q, setQ] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const canPick = mode === "progress";
  const wantRole = useMemo(
    () => (integradorOnly ? null : narrowFromSlot(slotLabel)),
    [slotLabel, integradorOnly]
  );
  const tShort = termShort(term);

  async function pick(e: ElectiveDTO) {
    setResolveError(null);
    setResolvingId(e.id);
    try {
      const res = await fetch(
        `/api/electives/resolve?q=${encodeURIComponent(e.name)}&term=${encodeURIComponent(
          term
        )}&program=${encodeURIComponent(programCode)}`
      );
      if (res.ok) {
        const d = (await res.json()) as {
          code: string;
          title: string;
          credits: number | null;
          sectionCount: number;
        };
        onAssign({
          code: d.code,
          title: d.title || e.name,
          credits: d.credits ?? slotCredits,
          sectionCount: d.sectionCount,
          electiveId: e.id,
        });
      } else {
        // couldn't confirm against the API — assign anyway with the slot's credits
        setResolveError(
          res.status === 502
            ? "No se pudo consultar la oferta; se usaron los créditos del espacio."
            : "Sin match exacto en la oferta; se usaron los créditos del espacio."
        );
        onAssign({ code: null, title: e.name, credits: slotCredits, electiveId: e.id });
      }
    } catch {
      setResolveError("No se pudo consultar la oferta; se usaron los créditos del espacio.");
      onAssign({ code: null, title: e.name, credits: slotCredits, electiveId: e.id });
    } finally {
      setResolvingId(null);
    }
  }


  const rolesFor = (e: ElectiveDTO): RoleCell[] => {
    const suffix = era === "from2024" ? "From2024" : "Until2023";
    const ele = e.roles[("ele" + suffix) as keyof ElectiveDTO["roles"]];
    const elc = e.roles[("elc" + suffix) as keyof ElectiveDTO["roles"]];
    if (programCode === "IELC") return [elc];
    if (programCode === "DOBLE") return [ele, elc];
    return [ele];
  };

  const filtered = useMemo(() => {
    const needle = foldAccents(q).trim();
    return electives.filter((e) => {
      if (integradorOnly) {
        if (!e.isCursoIntegrador) return false;
      } else {
        const cells = rolesFor(e).filter((c) => c && c.norm);
        if (cells.length === 0) return false;
        if (wantRole && !cells.some((c) => c.norm === wantRole)) return false;
      }
      if (onlyThisTerm && !e.offeredTerms.includes(term)) return false;
      if (needle) {
        const hay = foldAccents(`${e.name} ${e.ciclo ?? ""}`);
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electives, era, onlyThisTerm, q, wantRole, term, programCode, integradorOnly]);

  const roleChips = (e: ElectiveDTO) => {
    const suffix = era === "from2024" ? "From2024" : "Until2023";
    const ele = e.roles[("ele" + suffix) as keyof ElectiveDTO["roles"]];
    const elc = e.roles[("elc" + suffix) as keyof ElectiveDTO["roles"]];
    const chips: { key: string; text: string; title: string }[] = [];
    if ((programCode === "IELE" || programCode === "DOBLE") && ele?.norm)
      chips.push({
        key: "ele",
        text: programCode === "DOBLE" ? `EE · ${ROLE_LABEL[ele.norm] ?? ele.norm}` : ROLE_LABEL[ele.norm] ?? ele.norm,
        title: ele.raw || ele.norm,
      });
    if ((programCode === "IELC" || programCode === "DOBLE") && elc?.norm)
      chips.push({
        key: "elc",
        text: programCode === "DOBLE" ? `EC · ${ROLE_LABEL[elc.norm] ?? elc.norm}` : ROLE_LABEL[elc.norm] ?? elc.norm,
        title: elc.raw || elc.norm,
      });
    return chips;
  };

  return (
    <section className="elective-picker">
      <h3>
        {integradorOnly
          ? "Cursos válidos como Integrador"
          : `Electivas válidas${wantRole ? ` · ${ROLE_LABEL[wantRole]}` : ""}`}{" "}
        <span className="elective-count">{filtered.length}</span>
      </h3>
      {integradorOnly && (
        <p className="elective-hint">
          Solo estos cursos de la bolsa cuentan para el espacio de Curso
          Integrador.
        </p>
      )}

      {canPick && assignment && (
        <div className="elective-assigned">
          <div className="elective-assigned-main">
            <strong>Elegida:</strong> {assignment.title}
          </div>
          <div className="elective-assigned-meta">
            {assignment.code ? `${assignment.code} · ` : ""}
            {assignment.credits ?? slotCredits} créditos
            {assignment.sectionCount ? ` · ${assignment.sectionCount} secc.` : ""}
            {!assignment.code ? " · créditos por confirmar" : ""}
          </div>
          <button
            type="button"
            className="elective-remove"
            onClick={() => onAssign(null)}
          >
            Quitar
          </button>
        </div>
      )}
      {canPick && resolveError && (
        <p className="elective-resolve-error">{resolveError}</p>
      )}
      {!canPick && (
        <p className="elective-hint">
          En <strong>Mi avance</strong> puedes elegir aquí la electiva real que
          cursarás en este espacio.
        </p>
      )}

      <div className="elective-filters">
        {!integradorOnly && (
          <div className="elective-era" role="tablist" aria-label="Era del pensum">
            <button
              type="button"
              className={era === "from2024" ? "active" : ""}
              onClick={() => setEra("from2024")}
            >
              Pensum 2024-I+
            </button>
            <button
              type="button"
              className={era === "until2023" ? "active" : ""}
              onClick={() => setEra("until2023")}
            >
              Hasta 2023-II
            </button>
          </div>
        )}
        <label className="elective-term-toggle">
          <input
            type="checkbox"
            checked={onlyThisTerm}
            onChange={(e) => setOnlyThisTerm(e.target.checked)}
          />
          Solo las de {tShort}
        </label>
      </div>

      <input
        type="text"
        className="elective-search"
        placeholder="Filtrar por nombre o ciclo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="elective-empty">
          Ninguna electiva de la bolsa coincide con estos filtros.
        </p>
      ) : (
        <ul className="elective-list">
          {filtered.map((e) => {
            const link = mihorarioUrl
              ? `${mihorarioUrl}${mihorarioUrl.includes("?") ? "&" : "?"}nameInput=${encodeURIComponent(e.name)}`
              : null;
            const isChosen = assignment?.electiveId === e.id;
            return (
              <li
                className={`elective-row${isChosen ? " is-chosen" : ""}`}
                key={e.id}
              >
                <div className="elective-row-head">
                  <span className="elective-name">{e.name}</span>
                  {e.offeredTerms.includes(term) && (
                    <span className="chip ptrm">{tShort}</span>
                  )}
                </div>
                <div className="chip-row">
                  {roleChips(e).map((c) => (
                    <span className="chip" key={c.key} title={c.title}>
                      {c.text}
                    </span>
                  ))}
                  {e.level === "maestria" && e.ciclo && (
                    <span className="chip maestria" title={e.ciclo}>
                      {e.ciclo}
                    </span>
                  )}
                </div>
                <div className="elective-row-actions">
                  {canPick &&
                    (isChosen ? (
                      <button
                        type="button"
                        className="elective-pick is-chosen"
                        onClick={() => onAssign(null)}
                      >
                        ✓ Elegida — quitar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="elective-pick"
                        disabled={resolvingId === e.id}
                        onClick={() => pick(e)}
                      >
                        {resolvingId === e.id ? "Buscando…" : "Elegir para este espacio"}
                      </button>
                    ))}
                  {link && (
                    <a
                      className="mihorario-link"
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Mi Horario →
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
