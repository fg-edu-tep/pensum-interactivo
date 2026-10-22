"use client";

// Three-set Venn of the elective bag (Eléctrica · Electrónica · maestría) for
// the embeddable /embed/electivas page. Hover a region to preview it, click (or
// use the region list) to pin it; the course list shows the pinned region.

import { useId, useMemo, useRef, useState } from "react";
import {
  VENN_ELC,
  VENN_ELE,
  VENN_MAE,
  VENN_REGIONS,
  countByMask,
  type VennElective,
} from "@/lib/electiveVenn";
import { termLabel } from "@/lib/term";
import s from "./ElectiveVenn.module.css";

const R = 110;
const CIRCLES = [
  { bit: VENN_ELE, cx: 150, cy: 130, color: "#1f6fc4", label: "Eléctrica", lx: 58, ly: 28, anchor: "middle" },
  { bit: VENN_ELC, cx: 260, cy: 130, color: "#0e8a95", label: "Electrónica", lx: 352, ly: 28, anchor: "middle" },
  { bit: VENN_MAE, cx: 205, cy: 225, color: "#8a4fc2", label: "Maestría", lx: 205, ly: 356, anchor: "middle" },
] as const;

/** where each region's count sits (hand-placed for the geometry above) */
const LABEL_AT: Record<number, [number, number]> = {
  [VENN_ELE]: [108, 106],
  [VENN_ELC]: [302, 106],
  [VENN_MAE]: [205, 282],
  [VENN_ELE | VENN_ELC]: [205, 92],
  [VENN_ELE | VENN_MAE]: [154, 194],
  [VENN_ELC | VENN_MAE]: [256, 194],
  [VENN_ELE | VENN_ELC | VENN_MAE]: [205, 160],
};

const regionLabel = (mask: number) => VENN_REGIONS.find((r) => r.mask === mask)?.label ?? "";

function maskAt(x: number, y: number): number {
  let m = 0;
  for (const c of CIRCLES) if ((x - c.cx) ** 2 + (y - c.cy) ** 2 <= R * R) m |= c.bit;
  return m;
}

interface Props {
  electives: VennElective[];
  term: string;
  initialOnlyOffered: boolean;
}

export default function ElectiveVenn({ electives, term, initialOnlyOffered }: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [onlyOffered, setOnlyOffered] = useState(initialOnlyOffered);
  const [hover, setHover] = useState(0);

  const pool = useMemo(
    () => (onlyOffered ? electives.filter((e) => e.offeredTerms.includes(term)) : electives),
    [electives, onlyOffered, term]
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
    () =>
      pool
        .filter((e) => e.mask === shown)
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [pool, shown]
  );

  /** region under a pointer event (0 = outside every circle) */
  function regionAt(e: React.MouseEvent<SVGSVGElement>): number {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return 0;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return maskAt(p.x, p.y);
  }

  const regionShape = (mask: number, cls: string) => {
    const inc = CIRCLES.filter((c) => mask & c.bit);
    // intersection of the included circles = nested clip paths
    let node: React.ReactNode = <rect width="410" height="370" className={cls} />;
    for (const c of inc) node = <g clipPath={`url(#${uid}-c${c.bit})`}>{node}</g>;
    return <g mask={`url(#${uid}-x${mask})`}>{node}</g>;
  };

  return (
    <div className={s.wrap}>
      <div className={s.chart}>
        <svg
          ref={svgRef}
          viewBox="0 0 410 370"
          className={s.svg}
          role="img"
          aria-label={`Diagrama de Venn: ${inSets} electivas entre Eléctrica, Electrónica y maestría`}
          onPointerMove={(e) => e.pointerType === "mouse" && setHover(regionAt(e))}
          onPointerLeave={() => setHover(0)}
          // from the click itself: touch taps never send a hover first
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
              // white = keep; the circles this region is NOT in are cut out
              <mask key={r.mask} id={`${uid}-x${r.mask}`}>
                <rect width="410" height="370" fill="white" />
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
            <text key={c.bit} x={c.lx} y={c.ly} textAnchor={c.anchor} className={s.setLabel} fill={c.color}>
              {c.label}
            </text>
          ))}
          {VENN_REGIONS.map((r) => {
            const [x, y] = LABEL_AT[r.mask];
            const n = counts.get(r.mask) ?? 0;
            return (
              <text
                key={r.mask}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className={`${s.count}${n === 0 ? ` ${s.countZero}` : ""}`}
              >
                {n}
              </text>
            );
          })}
        </svg>

        <label className={s.toggle}>
          <input type="checkbox" checked={onlyOffered} onChange={(e) => setOnlyOffered(e.target.checked)} />
          Solo las que se dictan en {termLabel(term)}
        </label>
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
        </div>
        <ul className={s.list}>
          {list.map((e) => (
            <li key={e.id}>
              {e.code && <code>{e.code}</code>}
              <span>{e.name}</span>
              {!onlyOffered && e.offeredTerms.includes(term) && <em className={s.badge}>se dicta {termLabel(term)}</em>}
              {e.ciclo && <small>{e.ciclo}</small>}
            </li>
          ))}
          {list.length === 0 && <li className={s.empty}>Ningún curso en esta región.</li>}
        </ul>
        <p className={s.foot}>
          {inSets} electivas en la bolsa
          {outside > 0 ? ` · ${outside} no son electivas de ningún programa (obligatorias, proyecto de grado…)` : ""}.
        </p>
      </div>
    </div>
  );
}
