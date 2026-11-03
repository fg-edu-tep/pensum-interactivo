import Link from "next/link";
import { prisma } from "@/lib/db";
import OfficialUploader from "@/components/admin/OfficialUploader";
import { lastOfficialLoad, planningTermSetting } from "@/lib/import/official/settings";
import { nextRegularTerm, termFromDate, termLabel } from "@/lib/term";

export const dynamic = "force-dynamic";

export default async function CargaOficialPage() {
  const [jobs, last, planning] = await Promise.all([
    prisma.importJob.findMany({ where: { scope: "official" }, orderBy: { uploadedAt: "desc" }, take: 10 }),
    lastOfficialLoad(),
    planningTermSetting(),
  ]);
  const current = termFromDate();
  const next = nextRegularTerm(current);
  return (
    <>
      <h1>Carga oficial</h1>
      <p className="admin-sub">
        La forma oficial de actualizar el programa: los tres archivos del departamento —{" "}
        <code>PLANES_&lt;periodo&gt;.xlsx</code>, <code>BOLSAS_&lt;periodo&gt;.xlsx</code> y{" "}
        <code>PRERREQUISITOS_&lt;periodo&gt;.xlsx</code>. Se leen todas las columnas, también las ocultas.
      </p>

      <div className="admin-card">
        <h2>Estado</h2>
        <p className="admin-note" style={{ margin: 0 }}>
          Periodo actual (por fecha): <strong>{termLabel(current)}</strong> · Periodo abierto para planear:{" "}
          <strong>{planning ? termLabel(planning) : "ninguno declarado todavía"}</strong>
          {last && (
            <>
              {" "}
              · Última carga: {new Date(last.appliedAt).toLocaleString("es-CO")} por {last.actor} ({last.files.planes}, {last.files.bolsas},{" "}
              {last.files.requisitos})
            </>
          )}
        </p>
      </div>

      <OfficialUploader current={{ code: current, label: termLabel(current) }} next={{ code: next, label: termLabel(next) }} />

      <div className="admin-card">
        <h2>Qué hace cada archivo</h2>
        <ul className="admin-note" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>PLANES</strong>: qué curso va en qué semestre de cada plan (PLAN IELE PC/CD, IELC PC/CD, IELE IELC, y los de maestría como
            borrador). Las filas de laboratorio (LAB…, código terminado en L/T/P) quedan como correquisito de su curso; ELEC se parte en casillas de 2 créditos.
          </li>
          <li>
            <strong>BOLSAS</strong>: reemplaza la bolsa de electivas. Por programa: obligatoria, electiva, curso integrador (independientes); PROXIMO =
            próxima oferta proyectada (un periodo, SEM, NODEF o vacío).
          </li>
          <li>
            <strong>PRERREQUISITOS</strong>: requisitos del periodo declarado (o el último anterior), restricciones (“excluye ingresa a primer… semestre” → 15
            créditos por semestre; restricciones de programa y nivel) y la oferta: un curso con fila en el periodo se dicta en ese periodo.
          </li>
        </ul>
      </div>

      <h2 style={{ fontSize: 15, margin: "24px 0 10px" }}>Cargas recientes</h2>
      {jobs.length === 0 ? (
        <p className="admin-note">Ninguna todavía.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Archivos</th>
              <th>Fecha</th>
              <th>Por</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>
                  {j.filename} · {j.prereqFilename}
                </td>
                <td>{new Date(j.uploadedAt).toLocaleString("es-CO")}</td>
                <td>{j.uploadedBy}</td>
                <td>
                  <span className={`admin-badge ${j.status === "applied" ? "published" : j.status === "discarded" ? "archived" : "draft"}`}>{j.status}</span>
                </td>
                <td>
                  <Link className="admin-btn" href={`/administrador/carga/${j.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
