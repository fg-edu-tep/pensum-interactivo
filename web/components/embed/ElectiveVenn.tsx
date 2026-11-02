"use client";

// The electives widget for /embed/electivas (review of 2026-10-29, §2).
//
//   · Program buttons (Eléctrica / Electrónica). None = everything; one = a
//     single column; both = two aligned columns, Electrónica | Eléctrica,
//     one row per course, with an empty slot where it doesn't count.
//   · Type: todas / electivas / integradores — integrador is NOT a subset of
//     electiva, so every row keeps its tags ("Electiva + Integrador", "Solo
//     integrador", "Solo electiva") whatever the filter.
//   · Period (optional): only this semester (K) or the next (K+1) — a course
//     with an NRC / requisitos row for that period.
//   · The two-set Venn on the left is the summary of the same filters; a
//     region narrows the list.
//   · A click opens the course inline (requirements by name, credits, last /
//     next offering) with "Planear con esta materia" → the planner of the
//     program being viewed.

import { useId, useMemo, useRef, useState } from "react";
import {
  VENN_ELC,
  VENN_ELE,
  VENN_REGIONS,
  passes,
  tagText,
  vennCounts,
  vennRows,
  type ProgramTag,
  type VennElective,
  type VennType,
} from "@/lib/electiveVenn";
import { termLabel } from "@/lib/term";
import s from "./ElectiveVenn.module.css";

const R = 120;
const CIRCLES = [
  { bit: VENN_ELE, cx: 140, cy: 150, color: "#0e6b70", label: "Eléctrica", lx: 95, ly: 18 },
  { bit: VENN_ELC, cx: 270, cy: 150, color: "#1f6fc4", label: "Electrónica", lx: 315, ly: 18 },
] as const;

const LABEL_AT: Record<number, [number, number]> = {
  [VENN_ELE]: [85, 150],
  [VENN_ELE | VENN_ELC]: [205, 150],
  [VENN_ELC]: [325, 150],
};

function maskAt(x: number, y: number): number {
  let m = 0;
  for (const c of CIRCLES) if ((x - c.cx) ** 2 + (y - c.cy) ** 2 <= R * R) m |= c.bit;
  return m;
}

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

const projectionText = (p: string | null | undefined) => {
  const v = (p ?? "").toUpperCase();
  if (/^\d{6}$/.test(v)) return `Próxima oferta proyectada: ${termLabel(v)}`;
  if (v.startsWith("SEM")) return "Se dicta todos los semestres";
  if (v.startsWith("NODEF")) return "Próxima oferta: por definir";
  return null;
};

function Tag({ t, offered, term }: { t: ProgramTag; offered: boolean; term: string | null }) {
  return (
    <span className={s.tags}>
      <em className={t.integrador ? (t.electiva ? s.tagBoth : s.tagInt) : s.tagEle}>{tagText(t)}</em>
      {term && offered && <em className={s.badge}>Se dicta en {termLabel(term)}</em>}
    </span>
  );
}

export default function ElectiveVenn({ electives, terms, initial, planSlugs }: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [programs, setPrograms] = useState({ ele: !!initial?.ele, elc: !!initial?.elc });
  const [type, setType] = useState<VennType>(initial?.type ?? "todas");
  const [term, setTerm] = useState<string | null>(initial?.term ?? null);
  const [region, setRegion] = useState<number | null>(null);
  const [hover, setHover] = useState(0);
  const both = programs.ele && programs.elc;

  const counts = useMemo(() => vennCounts(electives, type, term), [electives, type, term]);
  const rows = useMemo(() => {
    const r = vennRows(electives, { programs, type, term });
    // a Venn region narrows the list to the courses in exactly that region
    return region ? r.filter((x) => ((passes(x.e.ele, type) ? VENN_ELE : 0) | (passes(x.e.elc, type) ? VENN_ELC : 0)) === region) : r;
  }, [electives, programs, type, term, region]);

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

  function regionAt(e: React.MouseEvent<SVGSVGElement>): number {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return 0;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return maskAt(p.x, p.y);
  }
  const regionShape = (mask: number, cls: string) => {
    const inc = CIRCLES.filter((c) => mask & c.bit);
    let node: React.ReactNode = <rect width="410" height="300" className={cls} />;
    for (const c of inc) node = <g clipPath={`url(#${uid}-c${c.bit})`}>{node}</g>;
    return <g mask={`url(#${uid}-x${mask})`}>{node}</g>;
  };

  const planLink = (which: "ele" | "elc") => {
    const slug = which === "ele" ? planSlugs.ele : planSlugs.elc;
    return slug ? { slug, label: which === "ele" ? "Eléctrica" : "Electrónica" } : null;
  };
  const planLinks = (row: { ele: boolean; elc: boolean }) =>
    [row.elc ? planLink("elc") : null, row.ele ? planLink("ele") : null].filter((x): x is { slug: string; label: string } => !!x);

  const cell = (e: VennElective, which: "ele" | "elc", on: boolean) => {
    const t = which === "ele" ? e.ele : e.elc;
    if (!on || !t)
      return (
        <div className={s.slotEmpty} aria-label={`No cuenta para ${which === "ele" ? "Eléctrica" : "Electrónica"}`}>
          <span>no aplica en {which === "ele" ? "Eléctrica" : "Electrónica"}</span>
        </div>
      );
    return (
      <div className={s.slot}>
        <Tag t={t} offered={!!term && e.offeredTerms.includes(term)} term={term} />
      </div>
    );
  };

  const detailBlock = (e: VennElective, row: { ele: boolean; elc: boolean }) => {
    const d = details[e.id];
    return (
      <div className={s.detail}>
        {d === "loading" || d === undefined ? (
          <p className={s.muted}>Consultando…</p>
        ) : d === "error" ? (
          <p className={s.muted}>No pudimos traer el detalle ahora.</p>
        ) : (
          <>
            <dl>
              <dt>Créditos</dt>
              <dd>{d.credits ?? "sin dato"}</dd>
              <dt>{termLabel(detailTerm)}</dt>
              <dd>
                {e.offeredTerms.includes(detailTerm) || d.offered ? `se dicta en ${termLabel(detailTerm)}` : `no se dicta en ${termLabel(detailTerm)}`}
              </dd>
              <dt>Prerrequisitos</dt>
              <dd>{d.prereq ?? "Ninguno registrado"}</dd>
              {d.coreqs.length > 0 && (
                <>
                  <dt>Correquisitos</dt>
                  <dd>{d.coreqs.join(", ")}</dd>
                </>
              )}
              {d.minCredits && (
                <>
                  <dt>Restricción</dt>
                  <dd>
                    {d.minCredits} créditos aprobados (equivale a {d.minCreditsSemesters} semestres)
                  </dd>
                </>
              )}
              {(projectionText(e.projection) || d.nextOfferingTerm) && (
                <>
                  <dt>Próxima oferta</dt>
                  <dd>{projectionText(e.projection) ?? `Proyectada: ${termLabel(d.nextOfferingTerm!)}`}</dd>
                </>
              )}
              {d.lastOfferedTerm && (
                <>
                  <dt>Última vez</dt>
                  <dd>{termLabel(d.lastOfferedTerm)}</dd>
                </>
              )}
            </dl>
            {planLinks(row).length > 0 && (
              <p className={s.planLinks}>
                {planLinks(row).map((l) => (
                  <a key={l.slug} href={`/p/${l.slug}?modo=avance`} target="_blank" rel="noopener noreferrer">
                    Planear con esta materia · {l.label} →
                  </a>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  const toggleProgram = (k: "ele" | "elc") => {
    setRegion(null);
    setPrograms((p) => ({ ...p, [k]: !p[k] }));
  };
  const inSets = [...counts.entries()].filter(([m]) => m).reduce((a, [, n]) => a + n, 0);

  return (
    <div className={s.wrap}>
      <div className={s.chart}>
        <svg
          ref={svgRef}
          viewBox="0 0 410 300"
          className={s.svg}
          role="img"
          aria-label={`Diagrama de Venn: ${inSets} cursos entre Eléctrica y Electrónica`}
          onPointerMove={(e) => e.pointerType === "mouse" && setHover(regionAt(e))}
          onPointerLeave={() => setHover(0)}
          onClick={(e) => {
            const m = regionAt(e);
            setRegion(m && m !== region ? m : null);
          }}
        >
          <defs>
            {CIRCLES.map((c) => (
              <clipPath key={c.bit} id={`${uid}-c${c.bit}`}>
                <circle cx={c.cx} cy={c.cy} r={R} />
              </clipPath>
            ))}
            {VENN_REGIONS.map((r) => (
              <mask key={r.mask} id={`${uid}-x${r.mask}`}>
                <rect width="410" height="300" fill="white" />
                {CIRCLES.filter((c) => !(r.mask & c.bit)).map((c) => (
                  <circle key={c.bit} cx={c.cx} cy={c.cy} r={R} fill="black" />
                ))}
              </mask>
            ))}
          </defs>
          {CIRCLES.map((c) => (
            <circle key={c.bit} cx={c.cx} cy={c.cy} r={R} fill={c.color} fillOpacity={0.13} />
          ))}
          {region ? regionShape(region, s.regionPicked) : null}
          {hover && hover !== region ? regionShape(hover, s.regionHover) : null}
          {CIRCLES.map((c) => (
            <circle key={c.bit} cx={c.cx} cy={c.cy} r={R} fill="none" stroke={c.color} strokeWidth={2} />
          ))}
          {CIRCLES.map((c) => (
            <text key={c.bit} x={c.lx} y={c.ly} textAnchor="middle" className={s.setLabel} fill={c.color}>
              {c.label}
            </text>
          ))}
          {VENN_REGIONS.map((r) => {
            const [x, y] = LABEL_AT[r.mask];
            const n = counts.get(r.mask) ?? 0;
            return (
              <text key={r.mask} x={x} y={y} textAnchor="middle" dominantBaseline="central" className={`${s.count}${n === 0 ? ` ${s.countZero}` : ""}`}>
                {n}
              </text>
            );
          })}
        </svg>
        <p className={s.muted} style={{ textAlign: "center" }}>
          Toca una región para ver solo esos cursos.{region ? " " : ""}
          {region ? (
            <button type="button" className={s.linkBtn} onClick={() => setRegion(null)}>
              Quitar «{VENN_REGIONS.find((r) => r.mask === region)?.label}»
            </button>
          ) : null}
        </p>
      </div>

      <div className={s.side}>
        <div className={s.controls}>
          <div role="group" aria-label="Programa" className={s.filters}>
            <span className={s.ctlLabel}>Programa</span>
            <button type="button" className={s.filterBtn} aria-pressed={programs.elc} onClick={() => toggleProgram("elc")}>
              Electrónica
            </button>
            <button type="button" className={s.filterBtn} aria-pressed={programs.ele} onClick={() => toggleProgram("ele")}>
              Eléctrica
            </button>
          </div>
          <div role="group" aria-label="Tipo" className={s.filters}>
            <span className={s.ctlLabel}>Tipo</span>
            {(["todas", "electivas", "integradores"] as const).map((t) => (
              <button key={t} type="button" className={s.filterBtn} aria-pressed={type === t} onClick={() => setType(t)}>
                {t === "todas" ? "Todos" : t === "electivas" ? "Electivas" : "Integradores"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Periodo" className={s.filters}>
            <span className={s.ctlLabel}>Periodo</span>
            <button type="button" className={s.filterBtn} aria-pressed={term === null} onClick={() => setTerm(null)}>
              Cualquiera
            </button>
            {[...new Set([terms.current, terms.planning])].map((t) => (
              <button key={t} type="button" className={s.filterBtn} aria-pressed={term === t} onClick={() => setTerm(t)}>
                Se dicta en {termLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div className={s.listHead}>
          <strong>
            {both ? "Electrónica y Eléctrica" : programs.elc ? "Electrónica" : programs.ele ? "Eléctrica" : "Ambos programas"}
          </strong>{" "}
          · {rows.length} {rows.length === 1 ? "curso" : "cursos"}
          {!programs.ele && !programs.elc && <span className={s.muted}> · elige tu programa para ver qué te vale a ti</span>}
        </div>

        {both && (
          <div className={s.colHead} aria-hidden>
            <span>Curso</span>
            <span>Electrónica</span>
            <span>Eléctrica</span>
          </div>
        )}
        <ul className={s.list}>
          {rows.map((row) => {
            const e = row.e;
            const open = openId === e.id;
            const single = programs.ele !== programs.elc ? (programs.ele ? "ele" : "elc") : null;
            return (
              <li key={e.id} className={`${both ? s.rowBoth : s.row}${open ? ` ${s.itemOpen}` : ""}`}>
                <button type="button" className={s.itemBtn} aria-expanded={open} onClick={() => toggleDetail(e.id)}>
                  {e.code && <code>{e.code.replace(/^([A-Z]+)(\d)/, "$1 $2")}</code>}
                  <span>{e.name}</span>
                </button>
                {both ? (
                  <>
                    {cell(e, "elc", row.elc)}
                    {cell(e, "ele", row.ele)}
                  </>
                ) : single ? (
                  <Tag t={(single === "ele" ? e.ele : e.elc)!} offered={!!term && e.offeredTerms.includes(term)} term={term} />
                ) : (
                  <span className={s.tags}>
                    {e.elc && row.elc && <em className={s.tagProg}>Electrónica: {tagText(e.elc)}</em>}
                    {e.ele && row.ele && <em className={s.tagProg}>Eléctrica: {tagText(e.ele)}</em>}
                    {term && e.offeredTerms.includes(term) && <em className={s.badge}>Se dicta en {termLabel(term)}</em>}
                  </span>
                )}
                {open && detailBlock(e, row)}
              </li>
            );
          })}
          {rows.length === 0 && <li className={s.empty}>Ningún curso con estos filtros.</li>}
        </ul>
        <p className={s.foot}>Fuente: la bolsa de electivas del departamento. Un curso obligatorio en un programa no aparece como electiva de ese programa.</p>
      </div>
    </div>
  );
}
