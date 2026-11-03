import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { PlanesDiff } from "@/lib/import/diffPlanes";
import ImportReview from "@/components/admin/ImportReview";

export const dynamic = "force-dynamic";

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await prisma.importJob.findUnique({ where: { id: Number(jobId) } });
  if (!job) notFound();
  const diff = job.diff as unknown as PlanesDiff | null;

  return (
    <>
      <p className="admin-sub">
        <Link href="/administrador/importar">← Importaciones</Link>
      </p>
      <h1>{job.filename}</h1>
      <p className="admin-sub">
        {new Date(job.uploadedAt).toLocaleString("es-CO")} · estado: {job.status}
      </p>

      {job.scope === "official" && (
        <p className="admin-note">
          Este diff es parte de una <Link href={`/administrador/carga/${job.id}`}>carga oficial</Link>: se aplica desde allí, junto con la bolsa de
          electivas y los requisitos.
        </p>
      )}
      {!diff ? (
        <p className="admin-note">Sin diff (el archivo no se pudo procesar).</p>
      ) : (
        <ImportReview jobId={job.id} status={job.scope === "official" && job.status === "parsed" ? "review-only" : job.status} diff={diff} />
      )}
    </>
  );
}
