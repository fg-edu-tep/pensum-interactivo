import Link from "next/link";
import { prisma } from "@/lib/db";
import RegistroUploader from "@/components/admin/registro/RegistroUploader";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  parsed: "draft",
  applied: "published",
  discarded: "archived",
};
const STATUS_LABEL: Record<string, string> = {
  parsed: "en curso",
  applied: "aplicada",
  discarded: "descartada",
};

export default async function RegistroPage() {
  const runs = await prisma.registroImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true, filename: true, uploadedBy: true, status: true, createdAt: true,
      appliedAt: true, applyResult: true,
    },
  });

  return (
    <>
      <h1>Registro</h1>
      <p className="admin-sub">
        Importa el export de Registro (<code>Excel_Registro.xlsx</code>) para actualizar
        prerrequisitos, correquisitos, nombres y créditos de los planes. Un asistente te
        guía: subir → alcance → resolver → vincular → aplicar. Todo se puede deshacer.
      </p>

      <RegistroUploader />

      <h2 style={{ fontSize: 15, margin: "24px 0 10px" }}>Ejecuciones recientes</h2>
      {runs.length === 0 ? (
        <p className="admin-note">Ninguna todavía.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Subido por</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const undone = !!(r.applyResult as { undoneAt?: string } | null)?.undoneAt;
              return (
                <tr key={r.id}>
                  <td>{r.filename}</td>
                  <td>{r.uploadedBy}</td>
                  <td>{new Date(r.createdAt).toLocaleString("es-CO")}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[r.status] ?? "draft"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {undone && <span className="admin-pair"> · deshecha</span>}
                  </td>
                  <td>
                    <Link className="admin-btn" href={`/administrador/registro/${r.id}`}>
                      {r.status === "parsed" ? "Continuar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
