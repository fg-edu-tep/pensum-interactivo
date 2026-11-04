"use client";

// The electives table for /embed/electivas ("Electivas Tabla" design, 2026-11).
//
//   · Programa: Ambos / Electrónica / Eléctrica. Ambos = two banded column
//     groups, one row per course; a dashed "no aplica" where it doesn't count.
//   · Tipo: Todos / Electivas / Integradores. Integrador is NOT a subset of
//     electiva: every row keeps both marks, the other role's column is dimmed.
//   · Oferta: any semester / this one (K) / the next (K+1).
//   · Summary bar to scale; each part filters the list (by program with Ambos,
//     by role with one program). Rows that differ between programs come first.
//   · "Se dicta": K, K+1 and the bag's projection after that (hatched).
//   · A click opens the course inline: credits, prerequisites and corequisites
//     for the planning period (names, grouped — lib/electiveRequirements), the
//     offering, and "Planear con esta materia" → that program's planner.
//   · Lives in an iframe: the table scrolls sideways under a sticky course
//     column when the frame is narrow.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { matrixBase, matrixSummary, type MatrixPart, type ProgramTag, type ProgramView, type VennElective, type VennType } from "@/lib/electiveVenn";
import { joinEs, spacedCode, type ReqView } from "@/lib/electiveRequirements";
import { nextRegularTerm, termLabel } from "@/lib/term";
import { toSentenceCase } from "@/components/explorer/format";
import s from "./ElectivasTabla.module.css";

type Source = "override" | "api" | "registro" | null;
interface Detail {
  credits: number | null;
  offered: boolean | null;
  term: string;
  prereq: ReqView | null;
  prereqSource: Source;
  coreq: ReqView | null;
  coreqSource: Source;
  reqTerm: string;
  minCredits: number | null;
  minCreditsSemesters: number | null;
  lastOfferedTerm: string | null;
}

interface Props {
  electives: VennElective[];
  /** this semester (K) and the next one open for planning (K+1) */
  terms: { current: string; planning: string };
  initial?: { ele?: boolean; elc?: boolean; type?: VennType; term?: string | null; open?: string | null };
  /** planner links: program → plan slug */
  planSlugs: { ele: string | null; elc: string | null };
}

type Prog = "elc" | "ele";
const PN: Record<Prog, string> = { elc: "Electrónica", ele: "Eléctrica" };
const PART_LABEL: Record<MatrixPart, string> = {
  both: "cuentan en ambos programas",
  elc: "solo en Electrónica",
  ele: "solo en Eléctrica",
  e: "solo electiva",
  ei: "electiva e integrador",
  i: "solo integrador",
};
const short = (t: string) => termLabel(t).replace(/^20/, "");

function Check({ prog, on, role }: { prog: Prog; on: boolean; role: string }) {
  if (!on) return <span className={s.dash} role="img" aria-label={`${role}: no`} />;
  return (
    <span className={`${s.check} ${s[`check_${prog}`]}`} role="img" aria-label={`${role}: sí`} title={`Cuenta como ${role.toLowerCase()} en ${PN[prog]}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** "Proyectado 2028-1" / "Se dicta todos los semestres" / "Por definir" / null */
function projectionText(p: string | null): string | null {
  const v = (p ?? "").toUpperCase();
  if (/^\d{6}$/.test(v)) return `Próxima oferta proyectada: ${termLabel(v)}`;
  if (v.startsWith("SEM")) return "Se dicta todos los semestres";
  if (v.startsWith("NODEF")) return "Próxima oferta: por definir";
  return null;
}

/** The three "Se dicta" cells: K, K+1, then the projection after K+1. */
function offering(e: VennElective, K: string, P: string) {
  const sK = e.offeredTerms.includes(K);
  const sP = e.offeredTerms.includes(P);
  const v = (e.projection ?? "").toUpperCase();
  const after = nextRegularTerm(P);
  let proj: string | null = null; // term label shown hatched in the 3rd cell
  if (/^\d{6}$/.test(v) && v > P) proj = v;
  else if (v.startsWith("SEM")) proj = after;
  const tbd = !sK && !sP && !proj;
  return { sK, sP, proj, tbd, tbdText: v.startsWith("NODEF") ? "por definir" : "sin oferta prevista" };
}

// ---- requirements: names, grouped ----
function Inline({ v, nested = false }: { v: ReqView; nested?: boolean }) {
  switch (v.k) {
    case "course":
      return (
        <span className={s.req}>
          {v.name ?? spacedCode(v.code)}
          {v.name && <code className={s.reqCode}>{spacedCode(v.code)}</code>}
          {v.soft && <em className={s.soft}>puede ser al tiempo</em>}
        </span>
      );
    case "token":
      return <span className={s.req}>{v.label}</span>;
    case "english":
      return (
        <span className={s.req}>
          Requisito de lectura en inglés <span className={s.reqAlt}>({joinEs(v.options, "o")})</span>
        </span>
      );
    case "any":
    case "all": {
      const parts = v.items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={s.conj}>{v.k === "any" ? " o " : " y "}</span>}
          <Inline v={it} nested />
        </Fragment>
      ));
      return nested ? <span>({parts})</span> : <span>{parts}</span>;
    }
  }
}

function Requirement({ v, empty }: { v: ReqView | null; empty: string }) {
  if (!v) return <span className={s.muted}>{empty}</span>;
  if (v.k === "all" || v.k === "any")
    return (
      <div className={s.reqBlock}>
        <span className={s.reqLead}>{v.k === "all" ? "Necesitas todos:" : "Cumple una de estas opciones:"}</span>
        <ul className={s.reqList}>
          {v.items.map((it, i) => (
            <li key={i}>
              <Inline v={it} />
            </li>
          ))}
        </ul>
      </div>
    );
  return <Inline v={v} />;
}

const SOURCE_NOTE: Record<Exclude<Source, null>, (t: string) => string> = {
  override: () => "fijado por la coordinación",
  api: (t) => `oferta de cursos ${termLabel(t)}`,
  registro: (t) => `Registro ${termLabel(t)}`,
};

export default function ElectivasTabla({ electives, terms, initial, planSlugs }: Props) {
  const K = terms.current;
  const P = terms.planning;
  const [program, setProgram] = useState<ProgramView>(initial?.ele && !initial?.elc ? "ele" : initial?.elc && !initial?.ele ? "elc" : "ambos");
  const [type, setType] = useState<VennType>(initial?.type ?? "todas");
  const [term, setTerm] = useState<string | null>(initial?.term ?? null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<MatrixPart | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search (as the hint says), unless the user is typing
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      ev.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const base = useMemo(() => matrixBase(electives, { program, type, term, query }), [electives, program, type, term, query]);
  const summary = useMemo(() => matrixSummary(base, program), [base, program]);
  const rows = useMemo(() => (part ? base.filter((r) => r.part === part) : base), [base, part]);
  const total = summary.reduce((n, p) => n + p.count, 0);
  const shown: Prog[] = program === "ambos" ? ["elc", "ele"] : [program];
  const both = shown.length === 2;

  // inline detail: one request per course and period, cached for the session
  const detailTerm = term === K ? K : P;
  const initialOpen = initial?.open ? electives.find((e) => e.code === initial.open)?.id ?? null : null;
  const [openId, setOpenId] = useState<number | null>(initialOpen);
  const [details, setDetails] = useState<Record<string, Detail | "loading" | "error">>({});
  const load = (id: number, force = false) => {
    const key = `${id}:${detailTerm}`;
    if (!force && details[key] && details[key] !== "error") return;
    setDetails((d) => ({ ...d, [key]: "loading" }));
    fetch(`/api/electives/detail?id=${id}&term=${encodeURIComponent(detailTerm)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => setDetails((cur) => ({ ...cur, [key]: d })))
      .catch(() => setDetails((cur) => ({ ...cur, [key]: "error" })));
  };
  useEffect(() => {
    if (openId !== null) load(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, detailTerm]);

  const choose = <T,>(set: (v: T) => void) => (v: T) => {
    setPart(null);
    set(v);
  };
  const reset = () => {
    setPart(null);
    setType("todas");
    setTerm(null);
    setQuery("");
  };

  const dimE = type === "integradores";
  const dimI = type === "electivas";
  const typeWord = type === "electivas" ? "Electiva" : type === "integradores" ? "Integrador" : null;

  function detailPanel(e: VennElective, valid: Prog[], id: string) {
    const d = details[`${e.id}:${detailTerm}`];
    const off = offering(e, K, P);
    const dated = [K, P].filter((t) => e.offeredTerms.includes(t));
    const projLine = projectionText(e.projection);
    const links = valid.map((w) => ({ w, slug: planSlugs[w] })).filter((x): x is { w: Prog; slug: string } => !!x.slug);
    return (
      <div className={s.detail} id={id}>
        <div className={s.facts}>
          <span className={s.factK}>Créditos</span>
          <span className={s.mono}>{(d && typeof d === "object" ? d.credits : e.credits) ?? "—"} cr</span>
          {d === "loading" || d === undefined ? (
            <>
              <span className={s.factK}>Requisitos</span>
              <span className={s.loading} aria-live="polite">
                Consultando requisitos de {termLabel(detailTerm)}…
              </span>
            </>
          ) : d === "error" ? (
            <>
              <span className={s.factK}>Requisitos</span>
              <span>
                No pudimos traer los requisitos ahora.{" "}
                <button type="button" className={s.retry} onClick={() => load(e.id, true)}>
                  Reintentar
                </button>
              </span>
            </>
          ) : (
            <>
              <span className={s.factK}>
                Prerrequisitos
                {d.prereqSource && <small className={s.src}>{SOURCE_NOTE[d.prereqSource](d.reqTerm)}</small>}
              </span>
              <Requirement v={d.prereq} empty="Ninguno registrado" />
              <span className={s.factK}>
                Correquisitos
                {d.coreqSource && <small className={s.src}>{SOURCE_NOTE[d.coreqSource](d.reqTerm)}</small>}
              </span>
              <div>
                <Requirement v={d.coreq} empty="Ninguno" />
                {d.coreq && <span className={s.hint}>Se inscriben en el mismo semestre.</span>}
              </div>
              {d.minCredits ? (
                <>
                  <span className={s.factK}>Restricción</span>
                  <span>
                    {d.minCredits} créditos aprobados (desde {(d.minCreditsSemesters ?? 0) + 1}.º semestre)
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
        <div className={s.side}>
          {dated.length > 0 ? (
            <div className={s.offerOn}>
              <i aria-hidden />
              Se dicta · {dated.map(termLabel).join(" · ")}
            </div>
          ) : (
            <div className={s.offerOff}>
              <i aria-hidden />
              {off.proj ? `Proyectado ${termLabel(off.proj)}` : off.tbdText === "por definir" ? "Por definir" : "Sin oferta prevista"}
            </div>
          )}
          {projLine && dated.length > 0 && <span className={s.hint}>{projLine}</span>}
          {d && typeof d === "object" && d.lastOfferedTerm && !dated.length && <span className={s.hint}>Última vez: {termLabel(d.lastOfferedTerm)}</span>}
          {links.map((l) => (
            <a key={l.w} className={`${s.plan} ${s[`plan_${l.w}`]}`} href={`/p/${l.slug}?modo=avance`} target="_blank" rel="noopener noreferrer">
              Planear con esta materia · {PN[l.w]} →
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap} data-program={program}>
      <header className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>Pensum · Electivas</span>
          <h1>Electivas e integradores</h1>
          <p>Ingeniería Electrónica y Eléctrica: qué te vale en tu programa y cuándo se dicta.</p>
        </div>
        <label className={s.search}>
          <span className={s.srOnly}>Buscar curso o código</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input ref={searchRef} type="search" placeholder="Buscar curso o código" value={query} onChange={(ev) => choose(setQuery)(ev.target.value)} />
          {!query && <kbd aria-hidden>/</kbd>}
        </label>
      </header>

      <section className={s.filters} aria-label="Filtros">
        <div className={s.filterRow}>
          <Seg label="Programa" value={program} onChange={choose(setProgram)} options={[["ambos", "Ambos"], ["elc", "Electrónica"], ["ele", "Eléctrica"]]} />
          <Seg label="Tipo" value={type} onChange={choose(setType)} options={[["todas", "Todos"], ["electivas", "Electivas"], ["integradores", "Integradores"]]} />
        </div>
        <div className={s.pills} role="group" aria-label="Oferta">
          <span className={s.pillsLabel}>Oferta:</span>
          {(
            [
              [null, "Cualquier semestre"],
              [K, `Lo que se dicta este semestre (${termLabel(K)})`],
              [P, `Próximo semestre (${termLabel(P)})`],
            ] as [string | null, string][]
          )
            .filter(([t], i, all) => i === 0 || all.findIndex(([u]) => u === t) === i)
            .map(([t, label]) => (
              <button key={t ?? "any"} type="button" className={s.pill} aria-pressed={term === t} onClick={() => choose(setTerm)(t)}>
                {label}
              </button>
            ))}
        </div>
      </section>

      <section className={s.summary} aria-label="Resumen">
        <div className={s.bar} role="group" aria-label="Toca una parte para ver solo esos cursos">
          {summary
            .filter((p) => p.count > 0)
            .map((p) => (
              <button
                key={p.part}
                type="button"
                className={`${s.seg} ${s[`seg_${p.part}`]}`}
                style={{ flexGrow: p.count }}
                aria-pressed={part === p.part}
                data-dim={part !== null && part !== p.part ? "" : undefined}
                onClick={() => setPart(part === p.part ? null : p.part)}
                title={`${p.count} ${PART_LABEL[p.part]} — toca para filtrar`}
              >
                {p.count}
              </button>
            ))}
          {total === 0 && <span className={s.barEmpty}>Ningún curso con estos filtros</span>}
        </div>
        <p className={s.legend}>
          {summary.map((p) => (
            <span key={p.part} data-zero={p.count === 0 ? "" : undefined}>
              <i className={`${s.sw} ${s[`seg_${p.part}`]}`} aria-hidden />
              <b>{p.count}</b> {PART_LABEL[p.part]}
            </span>
          ))}
          {part && (
            <button type="button" className={s.linkBtn} onClick={() => setPart(null)}>
              Ver los {total}
            </button>
          )}
        </p>
      </section>

      <div className={s.card}>
        <div className={s.scroller}>
          <div className={s.table} data-cols={shown.length} role="table" aria-label="Electivas e integradores">
            <div className={s.headGrid} role="row">
              <span className={`${s.hCourse} ${s.sticky}`} role="columnheader">
                Curso
              </span>
              {shown.map((w) => (
                <span key={w} className={`${s.hProg} ${s[`band_${w}`]}`} role="columnheader">
                  <span className={s[`hProgName_${w}`]}>{PN[w]}</span>
                </span>
              ))}
              <span className={s.hWhen} role="columnheader">
                <span>Se dicta</span>
                <span className={s.terms3}>
                  <span>{short(K)}</span>
                  <span>{short(P)}</span>
                  <span title={`Proyección de la bolsa después de ${termLabel(P)}`}>luego</span>
                </span>
              </span>
              <span className={s.hChev} aria-hidden />
              {shown.map((w) => (
                <Fragment key={w}>
                  <span className={`${s.hRole} ${s[`band_${w}`]} ${s[`hRole_${w}`]}`} style={{ opacity: dimE ? 0.3 : 1 }}>
                    Electiva
                  </span>
                  <span className={`${s.hRole} ${s[`band_${w}`]} ${s[`hRole_${w}`]}`} style={{ opacity: dimI ? 0.3 : 1 }}>
                    Integrador
                  </span>
                </Fragment>
              ))}
            </div>

            {rows.map((r) => {
              const open = openId === r.e.id;
              const differs = both && r.part !== "both";
              // full tags whatever the type filter: the other role is dimmed, not hidden
              const tags: Record<Prog, ProgramTag | null> = { elc: r.e.elc, ele: r.e.ele };
              const valid = shown.filter((w) => tags[w]);
              const off = offering(r.e, K, P);
              const panelId = `det-${r.e.id}`;
              return (
                <div key={r.e.id} className={s.rowWrap} data-open={open ? "" : undefined} role="rowgroup">
                  <button type="button" className={s.rowBtn} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpenId(open ? null : r.e.id)} role="row">
                    <span className={`${s.cCourse} ${s.sticky}`} role="cell">
                      <span className={s.name}>{toSentenceCase(r.e.name)}</span>
                      <span className={s.meta}>
                        <span className={s.mono}>{r.e.code ? spacedCode(r.e.code) : ""}</span>
                        {differs && (
                          <span className={s[`solo_${r.part as Prog}`]}>
                            {typeWord ? `${typeWord} solo en ${PN[r.part as Prog]}` : `Solo ${PN[r.part as Prog]}`}
                          </span>
                        )}
                      </span>
                    </span>
                    {shown.map((w) =>
                      tags[w] ? (
                        <Fragment key={w}>
                          <span className={`${s.cMark} ${s[`band_${w}`]}`} style={{ opacity: dimE ? 0.3 : 1 }} role="cell">
                            <Check prog={w} on={tags[w]!.electiva} role="Electiva" />
                          </span>
                          <span className={`${s.cMark} ${s[`band_${w}`]}`} style={{ opacity: dimI ? 0.3 : 1 }} role="cell">
                            <Check prog={w} on={tags[w]!.integrador} role="Integrador" />
                          </span>
                        </Fragment>
                      ) : (
                        <span key={w} className={`${s.cNa} ${s[`band_${w}`]}`} role="cell">
                          <span className={s[`na_${w}`]}>no aplica</span>
                        </span>
                      )
                    )}
                    <span className={s.cWhen} role="cell">
                      {off.tbd ? (
                        <span className={s.tbd}>{off.tbdText}</span>
                      ) : (
                        <>
                          <span className={off.sK ? s.on : s.off} title={`${termLabel(K)}: ${off.sK ? "se dicta" : "no se dicta"}`} />
                          <span className={off.sP ? s.on : s.off} title={`${termLabel(P)}: ${off.sP ? "se dicta" : "no se dicta"}`} />
                          {off.proj ? (
                            <span className={s.proj} title={projectionText(r.e.projection) ?? ""}>
                              {short(off.proj)}
                            </span>
                          ) : (
                            <span className={s.off} title={projectionText(r.e.projection) ?? "Sin proyección"} />
                          )}
                        </>
                      )}
                    </span>
                    <span className={s.cChev} aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d={open ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
                      </svg>
                    </span>
                  </button>
                  {open && detailPanel(r.e, valid, panelId)}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className={s.empty}>
                <strong>Ningún curso coincide</strong>
                <span>Prueba otro semestre o limpia la búsqueda.</span>
                <button type="button" onClick={reset}>
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className={s.foot}>
        <span>
          <Check prog="elc" on role="Electiva" /> Cuenta en Electrónica
        </span>
        <span>
          <Check prog="ele" on role="Electiva" /> Cuenta en Eléctrica
        </span>
        <span>
          <span className={s.dash} aria-hidden /> No cuenta
        </span>
        <span className={s.vr} aria-hidden />
        <span>
          <i className={s.keyOn} aria-hidden /> Se dicta
        </span>
        <span>
          <i className={s.keyProj} aria-hidden /> Proyectado
        </span>
        <span>
          <i className={s.keyOff} aria-hidden /> No se dicta
        </span>
      </footer>
      <p className={s.source}>Fuente: la bolsa de electivas del departamento y el Registro de {termLabel(P)}. Un curso obligatorio en un programa no es electiva de ese programa.</p>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className={s.segGroup} role="group" aria-label={label}>
      <span className={s.ctlLabel}>{label}</span>
      <span className={s.segTrack}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}
