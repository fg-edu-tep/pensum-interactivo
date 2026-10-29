"use client";

import { useEffect, useMemo, useState } from "react";
import { termLabel as termShort } from "@/lib/term";
import type {
  Course,
  ElectiveAssignment,
  ElectiveDTO,
  ReqNode,
  RoleCell,
} from "@/lib/types";
import { foldAccents } from "@/lib/import/textMatch";
import { parseRequirement } from "@/lib/import/requirementParser";
import { missingCodes } from "@/lib/availability";
import { electiveState, graduateOnly, narrowFromSlot, requiredCourseCodes, slotCatalog } from "@/lib/electiveAvailability";
import { renderRequirement } from "@/lib/requirementText";
import { LockIcon } from "./icons";

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
  /** to say whether each elective can be taken now (Mi avance) */
  allCourses: Course[];
  approved: Set<string>;
  catalogCodes: Set<string>;
  onSelectCourse: (id: string) => void;
  /** the cart ("*" prerequisites in it count) and credits(A) — same rule as the slot */
  cart: Set<string>;
  approvedCredits: number;
  slot: Course;
}

const FREQUENCY_LABEL: Record<NonNullable<ElectiveDTO["frequency"]>, string> = {
  s1: "Suele dictarse en el semestre 1 (…-1)",
  s2: "Suele dictarse en el semestre 2 (…-2)",
  both: "Se dicta ambos semestres",
  biennial: "Se dicta cada dos años",
};

/** Prerequisites for an elective: this term's API when it's offered, else
 * Registro at the last period it was taught. */
function requirementOf(
  e: ElectiveDTO,
  live: Enriched | undefined
): { tree: ReqNode | null; source: "api" | "registro" | null } {
  if (live && live.prereqText !== undefined) return { tree: parseRequirement(live.prereqText), source: "api" };
  if (e.registroPrereqText) return { tree: parseRequirement(e.registroPrereqText), source: "registro" };
  return { tree: null, source: null };
}

/** Live-offering enrichment for one bag elective (/api/electives/enrich). */
interface Enriched {
  code: string;
  title: string;
  credits: number | null;
  sectionCount: number;
  /** this term's prerequisites: "" = none, absent = couldn't be read */
  prereqText?: string;
}
type Enrichment = { apiAvailable: boolean; matches: Record<number, Enriched> };

// one request per term per page load, shared by every picker instance
const enrichmentCache = new Map<string, Promise<Enrichment>>();
function loadEnrichment(term: string): Promise<Enrichment> {
  let p = enrichmentCache.get(term);
  if (!p) {
    p = fetch(`/api/electives/enrich?term=${encodeURIComponent(term)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Enrichment>) : { apiAvailable: false, matches: {} }))
      .catch(() => ({ apiAvailable: false, matches: {} }));
    enrichmentCache.set(term, p);
  }
  return p;
}

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

function toTitle(s: string): string {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
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
  allCourses,
  approved,
  catalogCodes,
  onSelectCourse,
  cart,
  approvedCredits,
  slot,
}: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const byCode = useMemo(() => new Map(allCourses.map((c) => [c.codeNormalized, c])), [allCourses]);
  // Only the 2024-I+ pensum is served: the bag's "until 2023" role columns
  // are ignored.
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [onlyThisTerm, setOnlyThisTerm] = useState(true);
  const [q, setQ] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const canPick = mode === "progress";
  const wantRole = useMemo(
    () => (integradorOnly ? null : narrowFromSlot(slotLabel)),
    [slotLabel, integradorOnly]
  );
  // the slot's catalog and each elective's state come from
  // lib/electiveAvailability.ts — the slot is enabled iff one of these is "now"
  const catalog = useMemo(() => slotCatalog(electives, programCode, slot), [electives, programCode, slot]);
  const pregrado = !/^M/i.test(programCode);
  const eCtx = useMemo(() => ({ approved, cart, catalogCodes, approvedCredits, pregrado }), [approved, cart, catalogCodes, approvedCredits, pregrado]);
  const tShort = termShort(term);

  useEffect(() => {
    let alive = true;
    loadEnrichment(term).then((d) => alive && setEnrichment(d));
    return () => {
      alive = false;
    };
  }, [term]);

  async function pick(e: ElectiveDTO) {
    setResolveError(null);
    // Priority: the Excel bag is the list; the live offering adds code and
    // credits when it matched. With the API reachable but no match, the Excel
    // data alone is assigned.
    const m = enrichment?.matches[e.id];
    if (m) {
      onAssign({ code: m.code, title: m.title || e.name, credits: m.credits ?? slotCredits, sectionCount: m.sectionCount, electiveId: e.id });
      return;
    }
    if (enrichment?.apiAvailable) {
      onAssign({ code: e.code, title: e.name, credits: e.registroCredits ?? slotCredits, electiveId: e.id });
      return;
    }
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
        onAssign({ code: e.code, title: e.name, credits: e.registroCredits ?? slotCredits, electiveId: e.id });
      }
    } catch {
      setResolveError("No se pudo consultar la oferta; se usaron los créditos del espacio.");
      onAssign({ code: e.code, title: e.name, credits: e.registroCredits ?? slotCredits, electiveId: e.id });
    } finally {
      setResolvingId(null);
    }
  }



  const filtered = useMemo(() => {
    const needle = foldAccents(q).trim();
    return catalog.filter((e) => {
      // "offered this term": the Excel's curated list, or a live-offering match
      if (onlyThisTerm && !e.offeredTerms.includes(term) && !enrichment?.matches[e.id]) return false;
      if (needle) {
        const hay = foldAccents(`${e.name} ${e.ciclo ?? ""}`);
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, onlyThisTerm, q, term, enrichment]);

  const roleChips = (e: ElectiveDTO) => {
    const ele = e.roles.eleFrom2024;
    const elc = e.roles.elcFrom2024;
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
          {assignment.halves && assignment.halves.length > 2 && (
            <div className="elective-assigned-meta">
              Vale {assignment.credits} créditos: ocupa {assignment.halves.length % 2 ? `${Math.floor(assignment.halves.length / 2)} casilla${assignment.halves.length > 3 ? "s" : ""} y media` : `${assignment.halves.length / 2} casillas`} de
              electivas (marcadas “cont.” en el mapa).
            </div>
          )}
          {!!assignment.overflow && (
            <div className="elective-overflow">
              +{assignment.overflow} cr por encima de los créditos de electivas del plan.
            </div>
          )}
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
            const live = enrichment?.matches[e.id];
            const offeredNow = e.offeredTerms.includes(term) || !!live;
            const req = requirementOf(e, live);
            // Mi avance: can it be taken now? (seen > available > locked)
            const st = electiveState(e, eCtx, live?.prereqText, live?.code);
            const seen = st === "seen";
            const locked = canPick && st === "blocked";
            const unknown = st === "unknown";
            const gradOnly = pregrado && graduateOnly(e.registroLevel);
            const together = new Set([...approved, ...cart]);
            const missing = locked ? [...missingCodes(req.tree, approved, requiredCourseCodes(req.tree), (c) => together.has(c))] : [];
            const creditsShort = typeof e.minCredits === "number" ? Math.max(0, e.minCredits - approvedCredits) : 0;
            const open = openId === e.id;
            const lastLabel = !offeredNow && e.lastOfferedTerm ? termShort(e.lastOfferedTerm) : null;
            return (
              <li
                className={`elective-row${isChosen ? " is-chosen" : ""}${locked ? " is-locked" : ""}${canPick && !locked ? " is-open" : ""}`}
                key={e.id}
              >
                <button
                  type="button"
                  className="elective-row-head"
                  aria-expanded={open}
                  aria-controls={`el-req-${e.id}`}
                  onClick={() => setOpenId(open ? null : e.id)}
                  title={locked ? "Ver qué necesitas antes de tomarla" : "Ver sus prerrequisitos"}
                >
                  {locked && (
                    <span className="elective-lock" aria-label="Aún no la puedes tomar">
                      <LockIcon size={11} />
                    </span>
                  )}
                  <span className="elective-name">{e.name}</span>
                  {canPick && (
                    <span className={`elective-state${locked ? " is-locked" : ""}${unknown ? " is-unknown" : ""}`}>
                      {seen ? "Vista" : locked ? "Aún no" : unknown ? "Verifica prerrequisitos" : "Puedes tomarla"}
                    </span>
                  )}
                  {offeredNow && <span className="chip ptrm">{tShort}</span>}
                </button>
                {(lastLabel || e.frequency || e.nextOfferingTerm) && (
                  <div className="elective-when">
                    {lastLabel && <span>Última vez dictado en: {lastLabel}</span>}
                    {e.nextOfferingTerm && <span>Próxima oferta planeada: {termShort(e.nextOfferingTerm)}</span>}
                    {e.frequency && <span>{FREQUENCY_LABEL[e.frequency]}</span>}
                  </div>
                )}
                {open && (
                  <div className="elective-req" id={`el-req-${e.id}`}>
                    <strong>¿Qué necesito antes de tomar {toTitle(e.name)}?</strong>
                    <p>{req.tree ? renderRequirement(req.tree, allCourses) : "No tiene prerrequisitos registrados."}</p>
                    {gradOnly && <p className="elective-credits">Según Registro, solo para estudiantes de posgrado (maestría / doctorado).</p>}
                    {unknown && (
                      <p className="elective-src">
                        Aún no tenemos su código ni sus requisitos en los datos del programa: verifica sus prerrequisitos en la oferta de cursos.
                      </p>
                    )}
                    {locked && creditsShort > 0 && (
                      <p className="elective-credits">
                        Te faltan {creditsShort} créditos aprobados: pide {e.minCredits} (equivale a {Math.round((e.minCredits ?? 0) / 15)} semestres).
                      </p>
                    )}
                    {missing.length > 0 && (
                      <div className="elective-missing">
                        <span>Te falta:</span>
                        {missing.map((m) => {
                          const c = byCode.get(m);
                          return c ? (
                            <button key={m} type="button" className="chip missing" onClick={() => onSelectCourse(c.id)} title="Ver en el mapa">
                              {c.code} · {toTitle(c.name)}
                            </button>
                          ) : (
                            <span key={m} className="chip missing">{m}</span>
                          );
                        })}
                      </div>
                    )}
                    {canPick && !locked && !seen && req.tree && <p className="elective-ok">Ya cumples sus prerrequisitos.</p>}
                    {req.source && (
                      <p className="elective-src">
                        {req.source === "api"
                          ? `Según la oferta oficial de ${tShort}.`
                          : `Según Registro${e.lastOfferedTerm ? ` (${termShort(e.lastOfferedTerm)})` : ""}${offeredNow ? "." : `: no se dicta en ${tShort}.`}`}
                      </p>
                    )}
                  </div>
                )}
                {live ? (
                  <div className="elective-live">
                    <span className="elective-live-code">{live.code}</span>
                    {live.credits != null && <span>{live.credits} cr</span>}
                    <span>
                      {live.sectionCount} secc. en {tShort}
                    </span>
                  </div>
                ) : (
                  enrichment && (
                    <div className="elective-live is-missing">
                      {enrichment.apiAvailable
                        ? `Sin coincidencia en la oferta de ${tShort}: datos de la bolsa de electivas`
                        : "Oferta en línea no disponible: datos de la bolsa de electivas"}
                    </div>
                  )
                )}
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
