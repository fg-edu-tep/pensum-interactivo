import Link from "next/link";
import { buildDiscrepancyReports } from "@/lib/discrepancy/service";
import { termLabel } from "@/lib/term";
import DiscrepancyAlert from "@/components/admin/DiscrepancyAlert";
import type { CourseReport, FieldReport } from "@/lib/discrepancy/report";

export const dynamic = "force-dynamic";

type View = "advertencias" | "todo";

function keep(f: FieldReport, view: View): boolean {
  if (view === "advertencias") return f.severity === "warn";
  return f.status !== "match"; // "todo": every difference and every unverified field
}

const FIELD_TITLE = { prereq: "Prerrequisitos", coreq: "Correquisitos" } as const;

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function DiscrepanciasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; catalogo?: string }>;
}) {
  const sp = await searchParams;
  const view: View = sp.ver === "todo" ? "todo" : "advertencias";
  const only = sp.catalogo;
  const all = await buildDiscrepancyReports();
  const reports = only ? all.filter((r) => r.slug === only) : all;

  const q = (ver: View, catalogo?: string) =>
    `/administrador/discrepancias?ver=${ver}${catalogo ? `&catalogo=${catalogo}` : ""}`;

  const totalWarn = all.reduce((s, r) => s + r.summary.warn, 0);

  return (
    <>
      <h1>Discrepancias</h1>
      <p className="admin-sub">
        Compara lo que hay en el <strong>documento</strong> (seed, Registro, ediciones manuales) con los datos{" "}
        <strong>oficiales de la API</strong> del semestre del plan. Los estudiantes siempre ven la API cuando la hay; el
        documento solo se muestra si la API no tiene datos del curso.
      </p>

      <div className="disc-filter">
        <Link className={`admin-btn${view === "advertencias" ? " primary" : ""}`} href={q("advertencias", only)}>
          Solo advertencias{totalWarn ? ` (${totalWarn})` : ""}
        </Link>
        <Link className={`admin-btn${view === "todo" ? " primary" : ""}`} href={q("todo", only)}>
          Todas las diferencias y sin verificar
        </Link>
        <span className="disc-cats">|</span>
        <Link className={`admin-btn${!only ? " primary" : ""}`} href={q(view)}>
          Todos los planes
        </Link>
        {all.map((r) => (
          <Link key={r.slug} className={`admin-btn${only === r.slug ? " primary" : ""}`} href={q(view, r.slug)}>
            {r.slug} {r.summary.warn > 0 && <span className="disc-badge">{r.summary.warn}</span>}
          </Link>
        ))}
      </div>

      {reports.length === 0 && <p className="admin-note">No hay planes.</p>}

      {reports.map((r) => {
        const rows: { c: CourseReport; fields: FieldReport[] }[] = r.courses
          .map((c) => ({ c, fields: [c.prereq, c.coreq].filter((f) => keep(f, view)) }))
          .filter((x) => x.fields.length > 0);
        const age = daysAgo(r.oldestApiSync);
        return (
          <section key={r.slug} className="admin-card">
            <h2>
              {r.programName}
              {r.variantLabel ? ` · ${r.variantLabel}` : ""}{" "}
              <span className="admin-pair">
                <code>{r.slug}</code> · semestre {termLabel(r.term)}
              </span>{" "}
              <span className={`disc-badge${r.summary.warn === 0 ? " zero" : ""}`}>
                {r.summary.warn === 0 ? "sin advertencias" : `${r.summary.warn} advertencia(s)`}
              </span>
            </h2>
            <p className="admin-note" style={{ marginTop: 0 }}>
              {r.summary.byStatus.match} campos coinciden · {r.summary.byStatus["soft-only"]} solo difieren en * ·{" "}
              {r.summary.byStatus["api-only"]} solo en la API · {r.summary.byStatus.unverified} sin datos de la API
              (el documento manda). Datos de la API sincronizados{" "}
              {r.latestApiSync ? `hasta el ${r.latestApiSync.slice(0, 10)}` : "— nunca"}
              {age != null && age > 14 && (
                <strong> · ⚠ los más antiguos tienen {age} días; vuelve a sincronizar para una comparación confiable</strong>
              )}
              .
            </p>

            {rows.length === 0 ? (
              <p className="admin-note">
                {view === "advertencias" ? "Nada que advertir en este plan." : "Todo coincide con la API."}
              </p>
            ) : (
              rows.map(({ c, fields }) => (
                <div key={c.catalogCourseId} className="wiz-item">
                  <div className="wiz-item-head">
                    <div>
                      <strong>{c.displayCode}</strong> <span className="admin-pair">{c.name}</span>
                    </div>
                    <Link className="admin-btn" href={`/administrador/catalogos/${r.slug}#cursos`}>
                      Abrir editor
                    </Link>
                  </div>
                  {fields.map((f) => (
                    <div key={f.field}>
                      <div className="admin-pair" style={{ marginTop: 6 }}>
                        <b>{FIELD_TITLE[f.field]}</b>
                      </div>
                      <DiscrepancyAlert field={f} compact={f.status === "unverified"} />
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>
        );
      })}
    </>
  );
}
