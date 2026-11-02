"use client";

import { useEffect, useMemo, useState } from "react";
import { termLabel as termShort } from "@/lib/term";
import type {
  Course,
  ElectiveAssignment,
  ElectiveDTO,
  ReqNode,
} from "@/lib/types";
import { foldAccents } from "@/lib/import/textMatch";
import { parseRequirement } from "@/lib/import/requirementParser";
import { electiveState, graduateOnly, missingGroups, narrowFromSlot, requiredCourseCodes, slotCatalog } from "@/lib/electiveAvailability";
import { restrictionFor } from "@/lib/planning";
import { renderRequirement } from "@/lib/requirementText";
import { spanText, splitText, type BagItem, type BagLayout } from "@/lib/electiveBag";
import { LockIcon } from "./icons";
import { tokenName } from "@/lib/requirementTokens";

/** The elective bag, for the ELECTIVA boxes (lib/electiveBag.ts). */
export interface BagProps {
  items: BagItem[];
  layout: BagLayout;
  /** bag items in the selected box */
  occupants: string[];
  state: (key: string) => "approved" | "planned" | "chosen";
  onAdd: (item: Omit<BagItem, "key"> & { key?: string }, as: "planned" | "approved") => void;
  onRemove: (key: string) => void;
  planningBlocked: boolean;
  planLabel: string;
}

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
  /** code → name for requirements outside the plan */
  codeNames?: Record<string, string>;
  /** ELECTIVA boxes: the bag instead of one assignment per box */
  bag?: BagProps;
}

const FREQUENCY_LABEL: Record<NonNullable<ElectiveDTO["frequency"]>, string> = {
  s1: "Suele dictarse en el semestre 1 (…-1)",
  s2: "Suele dictarse en el semestre 2 (…-2)",
  both: "Se dicta todos los semestres",
  biennial: "Se dicta cada dos años",
};

/** "Próxima oferta proyectada: 2028-1" from the bag's PROXIMO. */
export function projectionText(e: Pick<ElectiveDTO, "projection" | "nextOfferingTerm" | "frequency">): string | null {
  const p = (e.projection ?? "").toUpperCase();
  if (/^\d{6}$/.test(p)) return `Próxima oferta proyectada: ${termShort(p)}`;
  if (p.startsWith("SEM")) return "Se dicta todos los semestres";
  if (p.startsWith("NODEF")) return "Próxima oferta: por definir";
  if (e.nextOfferingTerm) return `Próxima oferta proyectada: ${termShort(e.nextOfferingTerm)}`;
  if (e.frequency) return FREQUENCY_LABEL[e.frequency];
  return null;
}

/** Prerequisites for an elective: this term's API when it's offered, else
 * the official data (requisitos at the planning period). */
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

/** "Electiva + Integrador" / "Solo integrador" / "Solo electiva" for one program. */
export function attrLabel(a: { electiva: boolean; integrador: boolean; obligatoria: boolean } | undefined): string | null {
  if (!a) return null;
  if (a.obligatoria) return "Obligatoria";
  if (a.electiva && a.integrador) return "Electiva + Integrador";
  if (a.integrador) return "Solo integrador";
  if (a.electiva) return "Solo electiva";
  return null;
}

const spaceCode = (c: string) => c.replace(/^([A-Z]{3,4})(\d)/, "$1 $2");

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
  codeNames = {},
  bag,
}: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const byCode = useMemo(() => new Map(allCourses.map((c) => [c.codeNormalized, c])), [allCourses]);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [onlyThisTerm, setOnlyThisTerm] = useState(true);
  const [q, setQ] = useState("");
  const [unnamedCredits, setUnnamedCredits] = useState(2);

  const canPick = mode === "progress";
  const wantRole = useMemo(
    () => (integradorOnly || electives.some((e) => e.attrs) ? null : narrowFromSlot(slotLabel)),
    [slotLabel, integradorOnly, electives]
  );
  // the slot's catalog and each elective's state come from
  // lib/electiveAvailability.ts — the slot is enabled iff one of these is "now"
  const catalog = useMemo(() => slotCatalog(electives, programCode, slot, catalogCodes), [electives, programCode, slot, catalogCodes]);
  const pregrado = !/^M/i.test(programCode);
  const eCtx = useMemo(
    () => ({ approved, cart, catalogCodes, approvedCredits, pregrado, programCode, pensumCodes: catalogCodes }),
    [approved, cart, catalogCodes, approvedCredits, pregrado, programCode]
  );
  const tShort = termShort(term);

  useEffect(() => {
    let alive = true;
    setEnrichment(null);
    loadEnrichment(term).then((d) => alive && setEnrichment(d));
    return () => {
      alive = false;
    };
  }, [term]);
  // the states depend on this term's offering: while it loads, a veil instead
  // of a list that looks all locked (2026-10-29 demo)
  const loading = canPick && enrichment === null;

  /** The course as the bag / slot will hold it. Codes are the identity
   * (official bag): never matched by name, which once turned "Diseño de
   * líneas" into ISIS 1226 (grievance of 2026-10-29). */
  function asAssignment(e: ElectiveDTO): ElectiveAssignment {
    const m = enrichment?.matches[e.id];
    return {
      code: m?.code ?? e.code,
      title: e.name,
      credits: m?.credits ?? e.registroCredits ?? slotCredits,
      sectionCount: m?.sectionCount,
      electiveId: e.id,
    };
  }

  const filtered = useMemo(() => {
    const needle = foldAccents(q).trim();
    return catalog.filter((e) => {
      // "offered this term": the official data, or a live-offering match
      if (onlyThisTerm && !e.offeredTerms.includes(term) && !enrichment?.matches[e.id]) return false;
      if (needle) {
        const hay = foldAccents(`${e.name} ${e.code ?? ""} ${e.ciclo ?? ""}`);
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [catalog, onlyThisTerm, q, term, enrichment]);

  const tags = (e: ElectiveDTO) => {
    const chips: { key: string; text: string; title: string; kind?: string }[] = [];
    if (e.attrs) {
      const keys = programCode === "DOBLE" ? (["IELE", "IELC"] as const) : programCode === "IELC" ? (["IELC"] as const) : (["IELE"] as const);
      for (const k of keys) {
        const l = attrLabel(e.attrs[k]);
        if (l) chips.push({ key: k, text: programCode === "DOBLE" ? `${k === "IELE" ? "Eléctrica" : "Electrónica"}: ${l}` : l, title: l, kind: e.attrs[k].integrador ? "integrador" : undefined });
      }
      return chips;
    }
    const ele = e.roles.eleFrom2024;
    const elc = e.roles.elcFrom2024;
    if ((programCode === "IELE" || programCode === "DOBLE") && ele?.norm)
      chips.push({ key: "ele", text: programCode === "DOBLE" ? `EE · ${ROLE_LABEL[ele.norm] ?? ele.norm}` : ROLE_LABEL[ele.norm] ?? ele.norm, title: ele.raw || ele.norm });
    if ((programCode === "IELC" || programCode === "DOBLE") && elc?.norm)
      chips.push({ key: "elc", text: programCode === "DOBLE" ? `EC · ${ROLE_LABEL[elc.norm] ?? elc.norm}` : ROLE_LABEL[elc.norm] ?? elc.norm, title: elc.raw || elc.norm });
    return chips;
  };

  const nameOf = (code: string) => {
    const c = byCode.get(code);
    return c ? toTitle(c.name) : tokenName(code) ?? (codeNames[code] ? toTitle(codeNames[code]) : spaceCode(code));
  };

  const bagCredits = bag ? bag.items.reduce((s, i) => s + i.credits, 0) : 0;

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
          Cuentan como Curso integrador. No todos son electivas: algunos (como la Práctica profesional) solo valen como integrador.
        </p>
      )}

      {bag && canPick && (
        <div className="elective-bag" aria-label="Tu bolsa de electivas">
          <div className="elective-bag-head">
            <strong>Tu bolsa de electivas</strong>
            <span>
              {Math.min(bag.layout.used, bag.layout.capacity)} de {bag.layout.capacity} créditos de casillas
              {bag.layout.overflow > 0 ? ` · +${bag.layout.overflow} cr excedente` : ""}
            </span>
          </div>
          <p className="elective-hint" style={{ margin: "4px 0 6px" }}>
            Todas las casillas de electivas son una sola bolsa: las materias se acomodan solas, en el orden en que las agregas.
          </p>
          {bag.items.length === 0 ? (
            <p className="elective-empty" style={{ margin: 0 }}>Aún no has elegido electivas.</p>
          ) : (
            <ul className="elective-bag-list">
              {bag.items.map((it) => {
                const st = bag.state(it.key);
                const p = bag.layout.items.get(it.key);
                const here = bag.occupants.includes(it.key);
                return (
                  <li key={it.key} className={here ? "is-here" : undefined}>
                    <div>
                      <span className="elective-bag-title">{it.unnamed ? "Electiva sin especificar" : toTitle(it.title)}</span>
                      <span className="elective-bag-meta">
                        {it.code ? `${spaceCode(it.code)} · ` : ""}
                        {it.credits} cr · {spanText(it.credits).replace(/^Esta materia vale \d+ créditos?: /, "")}
                        {here ? " · en esta casilla" : ""}
                      </span>
                      {splitText(p) && <span className="elective-overflow">{splitText(p)}</span>}
                    </div>
                    <span className={`elective-bag-state is-${st}`}>{st === "approved" ? "Vista" : st === "planned" ? `En tu canasta · ${bag.planLabel}` : "Elegida"}</span>
                    <button type="button" className="elective-remove" onClick={() => bag.onRemove(it.key)} aria-label={`Quitar ${it.title} de la bolsa`}>
                      Quitar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {bag.layout.overflow > 0 && (
            <p className="elective-overflow-note" role="note">
              <strong>Tienes {bag.layout.overflow} crédito{bag.layout.overflow === 1 ? "" : "s"} de electivas por encima de los del plan.</strong>{" "}
              Decide qué hacer con ellos: por ejemplo, pueden contar como curso de libre elección (CLE). Habla con tu coordinador si tienes dudas.
            </p>
          )}
          <div className="elective-unnamed">
            <span>¿No sabes cuál todavía?</span>
            <label>
              <select value={unnamedCredits} onChange={(ev) => setUnnamedCredits(Number(ev.target.value))} aria-label="Créditos de la electiva sin especificar">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} cr
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="elective-pick"
              disabled={bag.planningBlocked}
              onClick={() => bag.onAdd({ code: null, title: "Electiva sin especificar", credits: unnamedCredits, unnamed: true }, "planned")}
            >
              Agregar electiva sin especificar
            </button>
            <button
              type="button"
              className="elective-remove"
              onClick={() => bag.onAdd({ code: null, title: "Electiva sin especificar", credits: unnamedCredits, unnamed: true }, "approved")}
            >
              Ya la vi
            </button>
          </div>
        </div>
      )}

      {canPick && !bag && assignment && (
        <div className="elective-assigned">
          <div className="elective-assigned-main">
            <strong>Elegida:</strong> {assignment.title}
          </div>
          <div className="elective-assigned-meta">
            {assignment.code ? `${spaceCode(assignment.code)} · ` : ""}
            {assignment.credits ?? slotCredits} créditos
            {assignment.sectionCount ? ` · ${assignment.sectionCount} secc.` : ""}
            {!assignment.code ? " · créditos por confirmar" : ""}
          </div>
          <button type="button" className="elective-remove" onClick={() => onAssign(null)}>
            Quitar
          </button>
        </div>
      )}
      {!canPick && (
        <p className="elective-hint">
          En <strong>Mi avance</strong> puedes elegir aquí la electiva real que cursarás.
        </p>
      )}

      <div className="elective-filters">
        <label className="elective-term-toggle">
          <input type="checkbox" checked={onlyThisTerm} onChange={(e) => setOnlyThisTerm(e.target.checked)} />
          Solo las que se dictan en {tShort}
        </label>
      </div>

      <input
        type="text"
        className="elective-search"
        placeholder="Filtrar por nombre o código…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading ? (
        <div className="elective-loading" role="status" aria-live="polite">
          <span className="elective-spinner" aria-hidden />
          Cargando la oferta de {tShort}…
        </div>
      ) : filtered.length === 0 ? (
        <p className="elective-empty">Ninguna electiva de la bolsa coincide con estos filtros.</p>
      ) : (
        <ul className="elective-list">
          {filtered.map((e) => {
            const link = mihorarioUrl
              ? `${mihorarioUrl}${mihorarioUrl.includes("?") ? "&" : "?"}nameInput=${encodeURIComponent(e.code ?? e.name)}`
              : null;
            const inBag = bag?.items.find((i) => i.electiveId === e.id);
            const isChosen = bag ? !!inBag : assignment?.electiveId === e.id;
            const live = enrichment?.matches[e.id];
            const offeredNow = e.offeredTerms.includes(term) || !!live;
            const req = requirementOf(e, live);
            // Mi avance: can it be taken now? (seen > available > locked)
            const st = electiveState(e, eCtx, live?.prereqText, live?.code);
            const seen = st === "seen";
            const locked = canPick && st === "blocked";
            const unknown = st === "unknown";
            const gradOnly = pregrado && graduateOnly(e.registroLevel);
            const restricted = restrictionFor({ programRestriction: e.programRestriction, levelRestriction: e.registroLevel }, programCode);
            const together = new Set([...approved, ...cart]);
            const missing = locked
              ? missingGroups(req.tree, (c) => approved.has(byCode.get(c)?.id ?? c) || approved.has(c) || together.has(byCode.get(c)?.id ?? c), requiredCourseCodes(req.tree))
              : [];
            const creditsShort = typeof e.minCredits === "number" ? Math.max(0, e.minCredits - approvedCredits) : 0;
            const open = openId === e.id;
            const proj = projectionText(e);
            const credits = live?.credits ?? e.registroCredits;
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
                <div className="elective-live">
                  {e.code && <span className="elective-live-code">{spaceCode(e.code)}</span>}
                  {credits != null && <span>{credits} cr</span>}
                  {live ? <span>{live.sectionCount} secc. en {tShort}</span> : <span>{offeredNow ? `Se dicta en ${tShort}` : `No se dicta en ${tShort}`}</span>}
                  {proj && <span>{proj}</span>}
                </div>
                {/* "Aún no": what to take to get there, without opening the row */}
                {locked && (missing.length > 0 || creditsShort > 0 || restricted || gradOnly) && (
                  <div className="elective-missing">
                    <span>Necesitas:</span>
                    {missing.map((group, gi) => (
                      <span key={gi} className="elective-missing-group">
                        {group.length > 1 && <span className="elective-missing-or">uno de:</span>}
                        {group.map((m) => {
                          const c = byCode.get(m);
                          return c ? (
                            <button key={m} type="button" className="chip missing" onClick={() => onSelectCourse(c.id)} title="Ver en el mapa">
                              {toTitle(c.name)}
                            </button>
                          ) : (
                            <span key={m} className="chip missing" title={`${spaceCode(m)} · fuera de tu pensum`}>
                              {nameOf(m)}
                            </span>
                          );
                        })}
                      </span>
                    ))}
                    {creditsShort > 0 && <span className="chip missing">{e.minCredits} créditos aprobados (te faltan {creditsShort})</span>}
                    {restricted && <span className="chip missing">Registro la limita a: {restricted}</span>}
                  </div>
                )}
                {open && (
                  <div className="elective-req" id={`el-req-${e.id}`}>
                    <strong>¿Qué necesito antes de tomar {toTitle(e.name)}?</strong>
                    <p>{req.tree ? renderRequirement(req.tree, allCourses) : "No tiene prerrequisitos registrados."}</p>
                    {e.coreqText && <p>Correquisito: {e.coreqText.split(/\s*,\s*|\s+Y\s+/).map((c) => nameOf(c.replace(/[-\s]/g, ""))).join(", ")}</p>}
                    {gradOnly && <p className="elective-credits">Según Registro, solo para estudiantes de posgrado (maestría / doctorado).</p>}
                    {unknown && (
                      <p className="elective-src">
                        Aún no tenemos su código ni sus requisitos en los datos del programa: verifica sus prerrequisitos en la oferta de cursos.
                      </p>
                    )}
                    {canPick && !locked && !seen && req.tree && <p className="elective-ok">Ya cumples sus prerrequisitos.</p>}
                    {e.lastOfferedTerm && <p className="elective-src">Última vez dictada: {termShort(e.lastOfferedTerm)}.</p>}
                    {req.source && (
                      <p className="elective-src">
                        {req.source === "api"
                          ? `Según la oferta oficial de ${tShort}.`
                          : "Según los requisitos cargados por el departamento (Registro)."}
                      </p>
                    )}
                  </div>
                )}
                <div className="chip-row">
                  {tags(e).map((c) => (
                    <span className={`chip${c.kind ? ` is-${c.kind}` : ""}`} key={c.key} title={c.title}>
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
                    (bag ? (
                      inBag ? (
                        <>
                          <span className={`elective-bag-state is-${bag.state(inBag.key)}`}>
                            {bag.state(inBag.key) === "approved" ? "✓ Vista" : bag.state(inBag.key) === "planned" ? "✓ En tu canasta" : "✓ Elegida"}
                          </span>
                          <button type="button" className="elective-pick is-chosen" onClick={() => bag.onRemove(inBag.key)}>
                            Quitar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="elective-pick"
                            disabled={bag.planningBlocked}
                            onClick={() => bag.onAdd({ ...asAssignment(e), credits: asAssignment(e).credits ?? 2 }, "planned")}
                            title={(credits ?? 0) > 2 ? spanText(credits ?? 0) : undefined}
                          >
                            A mi canasta · {bag.planLabel}
                          </button>
                          <button type="button" className="elective-remove" onClick={() => bag.onAdd({ ...asAssignment(e), credits: asAssignment(e).credits ?? 2 }, "approved")}>
                            Ya la vi
                          </button>
                        </>
                      )
                    ) : isChosen ? (
                      <button type="button" className="elective-pick is-chosen" onClick={() => onAssign(null)}>
                        ✓ Elegida — quitar
                      </button>
                    ) : (
                      <button type="button" className="elective-pick" onClick={() => onAssign(asAssignment(e))}>
                        Elegir para este espacio
                      </button>
                    ))}
                  {link && (
                    <a className="mihorario-link" href={link} target="_blank" rel="noopener noreferrer">
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
