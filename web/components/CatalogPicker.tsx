"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface PickerCatalog {
  slug: string;
  programName: string;
  programCode: string;
  variantLabel: string;
  term: string;
  accentColor: string | null;
  tagline: string | null;
  subtitle: string | null;
  imagePath: string | null;
  courseCount: number;
}

type Track = "standard" | "precalculo";

function trackOf(c: PickerCatalog): Track {
  return /prec/i.test(c.variantLabel) ? "precalculo" : "standard";
}

export default function CatalogPicker({
  catalogs,
  basePath = "/p",
}: {
  catalogs: PickerCatalog[];
  /** where a row links to, e.g. "/v1/p" for the frozen legacy explorer. */
  basePath?: string;
}) {
  const [track, setTrack] = useState<Track>("standard");

  const hasPrecalculo = useMemo(
    () => catalogs.some((c) => trackOf(c) === "precalculo"),
    [catalogs]
  );

  const visible = useMemo(
    () => catalogs.filter((c) => trackOf(c) === track),
    [catalogs, track]
  );

  const groups = useMemo(() => {
    const out: { programName: string; items: PickerCatalog[] }[] = [];
    for (const c of visible) {
      let g = out.find((x) => x.programName === c.programName);
      if (!g) {
        g = { programName: c.programName, items: [] };
        out.push(g);
      }
      g.items.push(c);
    }
    return out;
  }, [visible]);

  return (
    <div className="picker-page">
      <h1>Pensum Interactivo</h1>
      <p className="picker-sub">
        Elige el plan sugerido que quieres explorar. Cada plan muestra los cursos por
        semestre, sus prerrequisitos y qué se dicta este periodo.
      </p>

      {catalogs.length === 0 ? (
        <div className="picker-empty">
          No hay catálogos publicados todavía. Corre <code>npm run seed</code> o súbelos
          desde <code>/administrador</code>.
        </div>
      ) : (
        <>
          {hasPrecalculo && (
            <div className="picker-toggle" role="tablist" aria-label="Ruta del plan">
              <button
                role="tab"
                aria-selected={track === "standard"}
                className={track === "standard" ? "active" : ""}
                onClick={() => setTrack("standard")}
              >
                Plan estándar
              </button>
              <button
                role="tab"
                aria-selected={track === "precalculo"}
                className={track === "precalculo" ? "active" : ""}
                onClick={() => setTrack("precalculo")}
              >
                Con Precálculo
              </button>
            </div>
          )}

          {groups.map((g) => (
            <div className="picker-group" key={g.programName}>
              <h2>{g.programName}</h2>
              <div className="picker-rows">
                {g.items.map((c) => {
                  const accent = c.accentColor ?? "#1f6fc4";
                  return (
                    <Link
                      className="picker-row"
                      href={`${basePath}/${c.slug}`}
                      key={c.slug}
                      style={{ ["--accent" as string]: accent }}
                    >
                      <div className="pr-thumb">
                        {c.imagePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imagePath} alt="" />
                        ) : null}
                      </div>
                      <div className="pr-body">
                        <span className="pr-badge">
                          {c.variantLabel || "Plan estándar"}
                        </span>
                        <h3>{c.programName}</h3>
                        {c.tagline ? <p className="pr-tagline">{c.tagline}</p> : null}
                      </div>
                      <div className="pr-meta">
                        {c.subtitle ?? `${c.courseCount} cursos · periodo ${c.term}`}
                      </div>
                      <span className="pr-cta">Ver pensum →</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
