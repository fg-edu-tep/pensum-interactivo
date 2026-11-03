import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import OfficialApply from "@/components/admin/OfficialApply";
import type { OfficialJobPayload } from "@/lib/import/official/apply";
import type { PlanesDiff } from "@/lib/import/diffPlanes";
import { termLabel } from "@/lib/term";

export const dynamic = "force-dynamic";

export default async function CargaJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const id = Number((await params).jobId);
  const job = Number.isFinite(id) ? await prisma.importJob.findUnique({ where: { id } }) : null;
  if (!job || job.scope !== "official") notFound();
  const payload = job.parsedPayload as unknown as OfficialJobPayload;
  const r = payload.official.report;
  const diff = job.diff as unknown as PlanesDiff;
  return (
    <>
      <p>
        <Link href="/administrador/carga">← Carga oficial</Link>
      </p>
      <h1>
        Carga para {termLabel(r.planningTerm)} <span className={`admin-badge ${job.status === "applied" ? "published" : job.status === "discarded" ? "archived" : "draft"}`}>{job.status}</span>
      </h1>
      <p className="admin-sub">
        {r.files.planes} · {r.files.bolsas} · {r.files.requisitos} — subida por {job.uploadedBy} el {new Date(job.uploadedAt).toLocaleString("es-CO")}. Periodos en PRERREQUISITOS:{" "}
        {r.requisitosPeriods.map(termLabel).join(", ")}.
      </p>

      <OfficialApply jobId={job.id} status={job.status} conflicts={diff.counts.conflicts} />

      <div className="admin-card">
        <h2>Planes</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Columna</th>
              <th>Plan</th>
              <th>Cursos</th>
              <th>Casillas</th>
              <th>Créditos</th>
              <th>Semestres</th>
              <th>Cambios vs. la base</th>
            </tr>
          </thead>
          <tbody>
            {r.plans.map((p) => {
              const d = diff.catalogs.find((c) => c.slug === p.slug);
              const n = (k: string) => d?.courses.filter((x) => x.kind === k).length ?? 0;
              return (
                <tr key={p.slug}>
                  <td>{p.header}</td>
                  <td>
                    {p.slug} {p.status === "draft" && <span className="admin-badge draft">borrador</span>}
                  </td>
                  <td>{p.courses}</td>
                  <td>{p.slots}</td>
                  <td>{p.credits}</td>
                  <td>{p.semesters}</td>
                  <td>{d?.isNew ? "plan nuevo" : `+${n("added")} −${n("removed")} ~${n("modified")}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="admin-note">
          {r.companions} laboratorio(s)/complementaria(s) quedan como correquisito de su curso.{" "}
          <Link href={`/administrador/importar/${job.id}`}>Ver el detalle curso por curso →</Link>
        </p>
      </div>

      <div className="admin-card">
        <h2>Restricciones → créditos ({r.restrictions.length})</h2>
        <p className="admin-note">“Excluye ingresa a N semestre” se lee como 15 × N créditos aprobados (“no primer semestre” = 15).</p>
        <ul>
          {r.restrictions.map((x) => (
            <li key={x.code}>
              <code>{x.code}</code> {x.name} → <strong>{x.minCredits} créditos</strong> ({x.semesters === 1 ? "no primer semestre" : `excluye semestres 1–${x.semesters}`})
            </li>
          ))}
        </ul>
        <h3>Solo para otros programas ({r.programOnly.length})</h3>
        <ul>
          {r.programOnly.map((x) => (
            <li key={x.code}>
              <code>{x.code}</code> {x.name}: {x.allowList}
            </li>
          ))}
        </ul>
        {r.graduateOnly.length > 0 && (
          <>
            <h3>Solo posgrado ({r.graduateOnly.length})</h3>
            <ul>
              {r.graduateOnly.map((x) => (
                <li key={x.code}>
                  <code>{x.code}</code> {x.name}: {x.level}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="admin-card">
        <h2>Bolsa de electivas ({r.bolsas.total})</h2>
        <p className="admin-note">
          {Object.entries(r.bolsas.byAttr)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
        <p className="admin-note">
          PROXIMO: {r.bolsas.projection.term} con periodo · {r.bolsas.projection.sem} SEM · {r.bolsas.projection.nodef} NODEF · {r.bolsas.projection.none} vacío
          (probablemente no se vuelve a ofrecer).
        </p>
      </div>

      <div className="admin-card">
        <h2>Oferta</h2>
        <ul>
          {Object.entries(r.offering).map(([t, o]) => (
            <li key={t}>
              <strong>{termLabel(t)}</strong>: {o.offered} se dictan · {o.notOffered} no · sin dato: {o.unknown.join(", ") || "—"}
            </li>
          ))}
        </ul>
        <p className="admin-note">
          Un curso con fila del periodo en PRERREQUISITOS se dicta en ese periodo. Los que no tienen requisitos no aparecen en ese archivo: para ellos decide
          PROXIMO. La oferta en línea, cuando responde, siempre gana.
        </p>
        {r.missingInRequisitos.length > 0 && (
          <p className="admin-note">Sin fila en PRERREQUISITOS (cursos sin requisitos): {r.missingInRequisitos.map((x) => `${x.code} ${x.name}`).join(" · ")}</p>
        )}
      </div>

      {(r.warnings.length > 0 || r.unparsed.length > 0) && (
        <div className="admin-card">
          <h2>Avisos</h2>
          <ul>
            {r.unparsed.map((x) => (
              <li key={`${x.code}-${x.field}`}>
                No se pudo leer el {x.field} de <code>{x.code}</code>: “{x.text}”
              </li>
            ))}
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
