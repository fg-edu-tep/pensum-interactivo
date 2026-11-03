"use client";

// The electives widget for /embed/electivas (review of 2026-10-29, §2; the
// circles replaced 2026-11 by "summary bar + role matrix").
//
//   · Programa: Ambos / Electrónica / Eléctrica. Ambos = two aligned column
//     groups, Electrónica | Eléctrica, one row per course, a dashed "no aplica"
//     where it doesn't count (never red).
//   · Tipo: todos / electivas / integradores — integrador is NOT a subset of
//     electiva, so every row keeps both marks whatever the filter.
//   · Periodo (optional): this semester (K) or the next (K+1).
//   · The summary bar is drawn to scale and each part filters the list: by
//     program with Ambos (the few courses that differ), by role with one
//     program. Rows that differ between programs come first.
//   · A click opens the course inline (requirements, credits, last / next
//     offering) with "Planear con esta materia" → that program's planner.
//   · Built to sit in an iframe: it reflows by its own width (container
//     queries), from a phone column to a wide page.

import "@/components/explorer/tokens.css";
import { useMemo, useState } from "react";
import {
  matrixBase,
  matrixSummary,
  type MatrixPart,
  type ProgramTag,
  type ProgramView,
  type VennElective,
  type VennType,
} from "@/lib/electiveVenn";
import { termLabel } from "@/lib/term";
import { toSentenceCase } from "@/components/explorer/format";
import s from "./ElectiveVenn.module.css";

interface Detail {
  name: string;
  code: string | null;
  credits: number | null;
  offered: boolean | null;
  source: "api" | "registro" | null;
  prereq: string | null;
  coreqs: string[];
  minCredits: number | null;
  minCreditsSemesters: number | null;
  lastOfferedTerm: string | null;
  nextOfferingTerm: string | null;
  projection?: string | null;
}

interface Props {
  electives: VennElective[];
  /** this semester (K) and the next one open for planning (K+1) */
  terms: { current: string; planning: string };
  initial?: { ele?: boolean; elc?: boolean; type?: VennType; term?: string | null };
  /** planner links: program → plan slug */
  planSlugs: { ele: string | null; elc: string | null };
}

const PROGRAM_LABEL = { elc: "Electrónica", ele: "Eléctrica" } as const;
const PART_LABEL: Record<MatrixPart, string> = {
  both: "cuentan en ambos",
  elc: "solo Electrónica",
  ele: "solo Eléctrica",
  e: "solo electiva",
  ei: "electiva + integrador",
  i: "solo integrador",
};

/** "proy. 2028-1" / "cada semestre" / "por definir" from the bag's PROXIMO */
function projectionShort(p: string | null | undefined): string | null {
  const v = (p ?? "").toUpperCase();
  if (/^\d{6}$/.test(v)) return `proy. ${termLabel(v)}`;
  if (v.startsWith("SEM")) return "cada semestre";
  if (v.startsWith("NODEF")) return "por definir";
  return null;
}
function projectionLong(p: string | null | undefined): string | null {
  const v = (p ?? "").toUpperCase();
  if (/^\d{6}$/.test(v)) return `Próxima oferta proyectada: ${termLabel(v)}`;
  if (v.startsWith("SEM")) return "Se dicta todos los semestres";
  if (v.startsWith("NODEF")) return "Próxima oferta: por definir";
  return null;
}

function Mark({ kind, on }: { kind: "e" | "i"; on: boolean }) {
  const name = kind === "e" ? "Electiva" : "Integrador";
  return <span className={`${kind === "e" ? s.mkE : s.mkI} ${on ? "" : s.mkOff}`} role="img" aria-label={`${name}: ${on ? "sí" : "no"}`} title={`${name}: ${on ? "sí cuenta" : "no cuenta"}`} />;
}

function ProgramCell({ which, tag }: { which: "elc" | "ele"; tag: ProgramTag | null }) {
  if (!tag)
    return (
      <div className={`${s.prog} ${s.progNa}`}>
        <span className={s.progName}>{PROGRAM_LABEL[which]}</span>
        <span className={s.na}>no aplica</span>
      </div>
    );
  return (
    <div className={s.prog} data-program={which}>
      <span className={s.progName}>{PROGRAM_LABEL[which]}</span>
      <span className={s.marks}>
        <Mark kind="e" on={tag.electiva} />
        <Mark kind="i" on={tag.integrador} />
      </span>
    </div>
  );
}

export default function ElectiveVenn({ electives, terms, initial, planSlugs }: Props) {
  const [program, setProgram] = useState<ProgramView>(
    initial?.ele && !initial?.elc ? "ele" : initial?.elc && !initial?.ele ? "elc" : "ambos"
  );
  const [type, setType] = useState<VennType>(initial?.type ?? "todas");
  const [term, setTerm] = useState<string | null>(initial?.term ?? null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<MatrixPart | null>(null);

  const base = useMemo(() => matrixBase(electives, { program, type, term, query }), [electives, program, type, term, query]);
  const summary = useMemo(() => matrixSummary(base, program), [base, program]);
  const rows = useMemo(() => (part ? base.filter((r) => r.part === part) : base), [base, part]);
  const total = summary.reduce((n, p) => n + p.count, 0);
  const shown: ("elc" | "ele")[] = program === "ambos" ? ["elc", "ele"] : [program];
  const periodTerms = [...new Set([terms.current, terms.planning])];

  // inline detail: one request per click, cached for the session
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail | "loading" | "error">>({});
  const detailTerm = term ?? terms.planning;
  function toggleDetail(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    if (details[id]) return;
    setDetails((d) => ({ ...d, [id]: "loading" }));
    fetch(`/api/electives/detail?id=${id}&term=${encodeURIComponent(detailTerm)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : Promise.reject()))
      .then((d) => setDetails((cur) => ({ ...cur, [id]: d })))
      .catch(() => setDetails((cur) => ({ ...cur, [id]: "error" })));
  }

  const choose = <T,>(set: (v: T) => void) => (v: T) => {
    setPart(null);
    set(v);
  };

  function when(e: VennElective) {
    const taught = periodTerms.filter((t) => e.offeredTerms.includes(t));
    if (taught.length)
      return (
        <span className={s.taught} title={`Se dicta en ${taught.map(termLabel).join(" y ")}`}>
          {taught.map(termLabel).join(" · ")}
        </span>
      );
    const p = projectionShort(e.projection);
    return <span className={p && p !== "por definir" ? s.projected : s.unknown} title={projectionLong(e.projection) ?? "Sin dato de oferta"}>{p ?? "sin dato"}</span>;
  }

  function detailBlock(e: VennElective, valid: ("elc" | "ele")[]) {
    const d = details[e.id];
    if (d === "loading" || d === undefined) return <p className={s.muted}>Consultando…</p>;
    if (d === "error") return <p className={s.muted}>No pudimos traer el detalle ahora. Inténtalo de nuevo en un momento.</p>;
    const links = valid
      .map((w) => ({ w, slug: w === "ele" ? planSlugs.ele : planSlugs.elc }))
      .filter((x): x is { w: "elc" | "ele"; slug: string } => !!x.slug);
    return (
      <>
        <dl className={s.dl}>
          <dt>Créditos</dt>
          <dd>{d.credits ?? "sin dato"}</dd>
          <dt>{termLabel(detailTerm)}</dt>
          <dd>{e.offeredTerms.includes(detailTerm) || d.offered ? `Se dicta en ${termLabel(detailTerm)}` : `No se dicta en ${termLabel(detailTerm)}`}</dd>
          <dt>Prerrequisitos</dt>
          <dd>{d.prereq ?? "Ninguno registrado"}</dd>
          {d.coreqs.length > 0 && (
            <>
              <dt>Correquisitos</dt>
              <dd>{d.coreqs.join(", ")}</dd>
            </>
          )}
          {d.minCredits ? (
            <>
              <dt>Restricción</dt>
              <dd>
                {d.minCredits} créditos aprobados (equivale a {d.minCreditsSemesters} semestres)
              </dd>
            </>
          ) : null}
          {(projectionLong(e.projection) || d.nextOfferingTerm) && (
            <>
              <dt>Próxima oferta</dt>
              <dd>{projectionLong(e.projection) ?? `Proyectada: ${termLabel(d.nextOfferingTerm!)}`}</dd>
            </>
          )}
          {d.lastOfferedTerm && (
            <>
              <dt>Última vez</dt>
              <dd>{termLabel(d.lastOfferedTerm)}</dd>
            </>
          )}
        </dl>
        {links.length > 0 && (
          <p className={s.planLinks}>
            {links.map((l) => (
              <a key={l.slug} href={`/p/${l.slug}?modo=avance`} target="_blank" rel="noopener noreferrer">
                Planear con esta materia · {PROGRAM_LABEL[l.w]} →
              </a>
            ))}
          </p>
        )}
      </>
    );
  }

  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <h1>Electivas e integradores</h1>
          <p>Ingeniería Electrónica y Eléctrica: qué te vale en tu programa y cuándo se dicta.</p>
        </div>
        <label className={s.search}>
          <span className={s.srOnly}>Buscar curso</span>
          <input id="electivas-buscar" type="search" placeholder="Buscar curso o código" value={query} onChange={(e) => choose(setQuery)(e.target.value)} />
        </label>
      </header>

      <div className={s.controls}>
        <Seg label="Programa" value={program} onChange={choose(setProgram)} options={[["ambos", "Ambos"], ["elc", "Electrónica"], ["ele", "Eléctrica"]]} />
        <Seg label="Tipo" value={type} onChange={choose(setType)} options={[["todas", "Todos"], ["electivas", "Electivas"], ["integradores", "Integradores"]]} />
        <Seg
          label="Se dicta en"
          value={term ?? "any"}
          onChange={choose((v: string) => setTerm(v === "any" ? null : v))}
          options={[["any", "Cualquiera"], ...periodTerms.map((t) => [t, termLabel(t)] as [string, string])]}
        />
      </div>

      <section className={s.summary} aria-label="Resumen">
        <div className={s.bar} role="group" aria-label={program === "ambos" ? "Cursos por programa: toca una parte para ver solo esos" : "Cursos por tipo: toca una parte para ver solo esos"}>
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
                title={`${p.count} ${PART_LABEL[p.part]}`}
              >
                <span>{p.count}</span>
              </button>
            ))}
          {total === 0 && <span className={s.barEmpty}>Ningún curso con estos filtros</span>}
        </div>
        <p className={s.legend}>
          {summary.map((p) => (
            <span key={p.part} className={p.count === 0 ? s.legendZero : undefined}>
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

      <div className={s.table} data-cols={shown.length} role="table" aria-label="Electivas e integradores">
        <div className={`${s.row} ${s.headRow}`} role="row">
          <span role="columnheader">Curso</span>
          {shown.map((w) => (
            <span key={w} role="columnheader" className={s.progHead} data-program={w}>
              <b>{PROGRAM_LABEL[w]}</b>
              <span className={s.subHead}>
                <span>Elec.</span>
                <span>Integ.</span>
              </span>
            </span>
          ))}
          <span role="columnheader">Se dicta</span>
        </div>
        {rows.map((r) => {
          const open = openId === r.e.id;
          const differs = program === "ambos" && r.part !== "both";
          const valid = shown.filter((w) => (w === "elc" ? r.elc : r.ele));
          return (
            <div key={r.e.id} className={`${s.rowGroup} ${differs ? s.differs : ""} ${open ? s.open : ""}`} role="rowgroup">
              <div className={s.row} role="row">
                <span role="cell" className={s.courseCell}>
                  <button type="button" className={s.courseBtn} aria-expanded={open} onClick={() => toggleDetail(r.e.id)}>
                    <span className={s.courseName}>{toSentenceCase(r.e.name)}</span>
                    <span className={s.courseMeta}>
                      {r.e.code ? r.e.code.replace(/^([A-Z]+)(\d)/, "$1 $2") : ""}
                      {differs && <em className={s.diffTag}>solo {PROGRAM_LABEL[r.part as "elc" | "ele"]}</em>}
                    </span>
                  </button>
                </span>
                {shown.map((w) => (
                  <span key={w} role="cell">
                    <ProgramCell which={w} tag={w === "elc" ? r.elc : r.ele} />
                  </span>
                ))}
                <span role="cell" className={s.whenCell}>
                  {when(r.e)}
                </span>
              </div>
              {open && <div className={s.detail}>{detailBlock(r.e, valid)}</div>}
            </div>
          );
        })}
        {rows.length === 0 && <p className={s.empty}>Ningún curso con estos filtros. Prueba con «Cualquiera» en el periodo o borra la búsqueda.</p>}
      </div>

      <footer className={s.foot}>
        <span className={s.key}>
          <Mark kind="e" on /> cuenta como electiva
        </span>
        <span className={s.key}>
          <Mark kind="i" on /> cuenta como curso integrador
        </span>
        <span className={s.key}>
          <span className={s.naKey}>no aplica</span> no cuenta en ese programa
        </span>
        <span className={s.source}>Fuente: la bolsa de electivas del departamento. Un curso obligatorio en un programa no es electiva de ese programa.</span>
      </footer>
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
