import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildDiscrepancyReports } from "@/lib/discrepancy/service";

export const dynamic = "force-dynamic";

const PAIR_ORDER = [
  "auto_paired",
  "manual_resolved",
  "not_offered",
  "needs_manual",
  "placeholder_pool",
  "sync_failed",
] as const;
const PAIR_LABEL: Record<string, string> = {
  auto_paired: "auto",
  manual_resolved: "manual",
  not_offered: "no ofertado",
  needs_manual: "por revisar",
  placeholder_pool: "pool",
  sync_failed: "falló sync",
};

export default async function CatalogListPage() {
  const [catalogs, pairRows, lastImport, discReports] = await Promise.all([
    prisma.catalog.findMany({
      orderBy: { slug: "asc" },
      include: { _count: { select: { courses: true, requirementNodes: true } } },
    }),
    prisma.catalogCourse.groupBy({
      by: ["catalogId", "pairingStatus"],
      _count: { _all: true },
    }),
    prisma.importJob.findFirst({ orderBy: { uploadedAt: "desc" } }),
    buildDiscrepancyReports(),
  ]);
  const warnBySlug = new Map(discReports.map((r) => [r.slug, r.summary.warn]));

  const pairByCatalog = new Map<number, Record<string, number>>();
  for (const row of pairRows) {
    const m = pairByCatalog.get(row.catalogId) ?? {};
    m[row.pairingStatus] = row._count._all;
    pairByCatalog.set(row.catalogId, m);
  }

  return (
    <>
      <h1>Catálogos</h1>
      <p className="admin-sub">
        {catalogs.length} planes.{" "}
        {lastImport
          ? `Última importación: ${new Date(lastImport.uploadedAt).toLocaleString(
              "es-CO"
            )} (${lastImport.status}).`
          : "Sin importaciones registradas."}
      </p>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Plan</th>
            <th>Estado</th>
            <th>Término</th>
            <th>Cursos</th>
            <th>Emparejamiento</th>
            <th>Discrepancias</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {catalogs.map((c) => {
            const pair = pairByCatalog.get(c.id) ?? {};
            return (
              <tr key={c.id}>
                <td>
                  <strong>{c.programName}</strong>
                  {c.variantLabel ? ` · ${c.variantLabel}` : ""}
                  <div className="admin-pair">
                    <code>{c.slug}</code>
                  </div>
                </td>
                <td>
                  <span className={`admin-badge ${c.status}`}>{c.status}</span>
                </td>
                <td>{c.term}</td>
                <td>
                  {c._count.courses}
                  <div className="admin-pair">
                    {c._count.requirementNodes} nodo(s) de requisito
                  </div>
                </td>
                <td className="admin-pair">
                  {PAIR_ORDER.filter((k) => pair[k]).map((k) => (
                    <div key={k} className={k === "sync_failed" ? "warn" : undefined}>
                      <b>{pair[k]}</b> {PAIR_LABEL[k]}
                    </div>
                  ))}
                </td>
                <td>
                  {(() => {
                    const n = warnBySlug.get(c.slug) ?? 0;
                    return n > 0 ? (
                      <Link
                        className="disc-badge"
                        href={`/administrador/discrepancias?catalogo=${c.slug}`}
                        title="El documento difiere de los datos oficiales de la API"
                      >
                        ⚠ {n}
                      </Link>
                    ) : (
                      <span className="disc-badge zero">sin advertencias</span>
                    );
                  })()}
                </td>
                <td>
                  <Link
                    className="admin-btn"
                    href={`/administrador/catalogos/${c.slug}`}
                  >
                    Editar
                  </Link>{" "}
                  <Link
                    className="admin-btn"
                    href={`/administrador/catalogos/${c.slug}/mapa`}
                  >
                    Mapa
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
