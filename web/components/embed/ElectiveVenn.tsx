"use client";

// Two-set Venn of the elective bag (Eléctrica · Electrónica) for the
// embeddable /embed/electivas page. Hover a region to preview it, click (or
// use the region list) to pin it; the list shows the pinned region. Two
// combinable filters — "Curso integrador" and "Se dicta este semestre" — and
// a click on a course opens its detail inline (requirements by name,
// credits, offering), one query per click. Agreed 2026-10-29.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  VENN_ELC,
  VENN_ELE,
  VENN_REGIONS,
  countByMask,
  filterVenn,
  type VennElective,
} from "@/lib/electiveVenn";
import { termLabel } from "@/lib/term";
import s from "./ElectiveVenn.module.css";

const R = 120;
const CIRCLES = [
  { bit: VENN_ELE, cx: 140, cy: 150, color: "#0e8a95", label: "Eléctrica", lx: 95, ly: 18 },
  { bit: VENN_ELC, cx: 270, cy: 150, color: "#1f6fc4", label: "Electrónica", lx: 315, ly: 18 },
] as const;

/** where each region's count sits */
const LABEL_AT: Record<number, [number, number]> = {
  [VENN_ELE]: [85, 150],
  [VENN_ELE | VENN_ELC]: [205, 150],
  [VENN_ELC]: [325, 150],
};

const regionLabel = (mask: number) => VENN_REGIONS.find((r) => r.mask === mask)?.label ?? "";

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
}

interface Props {
  electives: VennElective[];
  term: string;
  initialOnlyOffered: boolean;
  /** planner links: program set → plan slug */
  planSlugs: { ele: string | null; elc: string | null };
}

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </svg>
  );
}

export default function ElectiveVenn({ electives, term, initialOnlyOffered, planSlugs }: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [onlyOffered, setOnlyOffered] = useState(initialOnlyOffered);
  const [onlyIntegrador, setOnlyIntegrador] = useState(false);
  const [hover, setHover] = useState(0);

  // "Se dicta este semestre" comes from the live offering; when the API is
  // down the filter is disabled with a note (API preflight rule)
  const [offeredIds, setOfferedIds] = useState<Set<number> | null>(null);
  const [apiState, setApiState] = useState<"loading" | "up" | "down">("loading");
  useEffect(() => {
    let alive = true;
    fetch(`/api/electives/enrich?term=${encodeURIComponent(term)}`)
      .then((r) => (r.ok ? r.json() : { apiAvailable: false, matches: {} }))
      .then((d: { apiAvailable: boolean; matches: Record<string, unknown> }) => {
        if (!alive) return;
        setApiState(d.apiAvailable ? "up" : "down");
        setOfferedIds(new Set(Object.keys(d.matches).map(Number)));
      })
      .catch(() => alive && setApiState("down"));
    return () => {
      alive = false;
    };
  }, [term]);
  const offeredFilterOn = onlyOffered && apiState === "up";

  const pool = useMemo(
    () => filterVenn(electives, { integrador: onlyIntegrador, offeredIds: offeredFilterOn ? offeredIds : null }),
    [electives, onlyIntegrador, offeredFilterOn, offeredIds]
  );
  const counts = useMemo(() => countByMask(pool), [pool]);
  const outside = counts.get(0) ?? 0;
  const inSets = pool.length - outside;

  // default to the biggest region so the embed never opens empty
  const biggest = VENN_REGIONS.reduce((a, b) => ((counts.get(b.mask) ?? 0) > (counts.get(a.mask) ?? 0) ? b : a)).mask;
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? biggest;
  const shown = hover || selected;

  const list = useMemo(
    () => pool.filter((e) => e.mask === shown).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [pool, shown]
  );

  // inline detail: one request per click, cached for the session
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail | "loading" | "error">>({});
  function toggleDetail(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    if (details[id]) return;
    setDetails((d) => ({ ...d, [id]: "loading" }));
    fetch(`/api/electives/detail?id=${id}&term=${encodeURIComponent(term)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : Promise.reject()))
      .then((d) => setDetails((cur) => ({ ...cur, [id]: d })))
      .catch(() => setDetails((cur) => ({ ...cur, [id]: "error" })));
  }

  /** region under a pointer event (0 = outside every circle) */
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

  const planLinks = (e: VennElective) =>
    [
      e.mask & VENN_ELE && planSlugs.ele ? { slug: planSlugs.ele, label: "Eléctrica" } : null,
      e.mask & VENN_ELC && planSlugs.elc ? { slug: planSlugs.elc, label: "Electrónica" } : null,
    ].filter((x): x is { slug: string; label: string } => !!x);

  return (
    <div className={s.wrap}>
      <div className={s.chart}>
        <svg
          ref={svgRef}
          viewBox="0 0 410 300"
          className={s.svg}
          role="img"
          aria-label={`Diagrama de Venn: ${inSets} electivas entre Eléctrica y Electrónica`}
          onPointerMove={(e) => e.pointerType === "mouse" && setHover(regionAt(e))}
          onPointerLeave={() => setHover(0)}
          onClick={(e) => {
            const m = regionAt(e);
            if (m) setPicked(m);
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
          {selected ? regionShape(selected, s.regionPicked) : null}
          {hover && hover !== selected ? regionShape(hover, s.regionHover) : null}
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

        <div className={s.filters} role="group" aria-label="Filtros">
          <button type="button" className={s.filterBtn} aria-pressed={onlyIntegrador} onClick={() => setOnlyIntegrador((v) => !v)}>
            <FilterIcon /> Curso integrador
          </button>
          <button
            type="button"
            className={s.filterBtn}
            aria-pressed={offeredFilterOn}
            disabled={apiState !== "up"}
            onClick={() => setOnlyOffered((v) => !v)}
            title={apiState === "down" ? "La oferta en línea no responde en este momento" : undefined}
          >
            <FilterIcon /> Se dicta en {termLabel(term)}
          </button>
        </div>
        {apiState === "down" && (
          <p className={s.note}>La oferta en línea no está disponible ahora: el filtro “Se dicta” vuelve cuando responda.</p>
        )}
      </div>

      <div className={s.side}>
        <div className={s.regions} role="group" aria-label="Regiones del diagrama">
          {VENN_REGIONS.map((r) => (
            <button
              key={r.mask}
              type="button"
              className={s.regionBtn}
              aria-pressed={selected === r.mask}
              onClick={() => setPicked(r.mask)}
              onMouseEnter={() => setHover(r.mask)}
              onMouseLeave={() => setHover(0)}
            >
              <span className={s.dots} aria-hidden>
                {CIRCLES.map((c) => (
                  <i key={c.bit} style={{ background: r.mask & c.bit ? c.color : "transparent", borderColor: c.color }} />
                ))}
              </span>
              <span className={s.regionName}>{r.label}</span>
              <span className={s.regionCount}>{counts.get(r.mask) ?? 0}</span>
            </button>
          ))}
        </div>

        <div className={s.listHead}>
          <strong>{regionLabel(shown)}</strong> · {list.length} {list.length === 1 ? "curso" : "cursos"}
          {onlyIntegrador ? " · integrador" : ""}
        </div>
        <ul className={s.list}>
          {list.map((e) => {
            const open = openId === e.id;
            const d = details[e.id];
            return (
              <li key={e.id} className={open ? s.itemOpen : undefined}>
                <button type="button" className={s.itemBtn} aria-expanded={open} onClick={() => toggleDetail(e.id)}>
                  {e.code && <code>{e.code.replace(/^([A-Z]+)(\d)/, "$1 $2")}</code>}
                  <span>{e.name}</span>
                  {e.isCursoIntegrador && <em className={s.badgeInt}>integrador</em>}
                  {!offeredFilterOn && offeredIds?.has(e.id) && <em className={s.badge}>se dicta {termLabel(term)}</em>}
                </button>
                {open && (
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
                          <dt>Este semestre</dt>
                          <dd>{d.offered === null ? "oferta no disponible" : d.offered ? `se dicta en ${termLabel(term)}` : `no se dicta en ${termLabel(term)}`}</dd>
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
                          {(d.lastOfferedTerm || d.nextOfferingTerm) && (
                            <>
                              <dt>Oferta</dt>
                              <dd>
                                {[
                                  d.lastOfferedTerm ? `Última vez ofrecida: ${termLabel(d.lastOfferedTerm)}` : null,
                                  d.nextOfferingTerm ? `Próxima oferta planeada: ${termLabel(d.nextOfferingTerm)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </dd>
                            </>
                          )}
                        </dl>
                        <p className={s.muted}>
                          {d.source === "api" ? `Según la oferta oficial de ${termLabel(term)}.` : d.source === "registro" ? "Según Registro." : ""}
                        </p>
                        {planLinks(e).length > 0 && (
                          <p className={s.planLinks}>
                            {planLinks(e).map((l) => (
                              <a key={l.slug} href={`/p/${l.slug}?modo=avance`} target="_blank" rel="noopener noreferrer">
                                Planear con esta materia · {l.label} →
                              </a>
                            ))}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {list.length === 0 && <li className={s.empty}>Ningún curso en esta región.</li>}
        </ul>
        <p className={s.foot}>
          {inSets} electivas
          {outside > 0 ? ` · ${outside} de la bolsa no son electivas de ningún programa (obligatorias, proyecto de grado, solo maestría…)` : ""}.
        </p>
      </div>
    </div>
  );
}
