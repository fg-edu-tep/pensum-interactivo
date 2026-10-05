import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import RegistroWizard from "@/components/admin/registro/RegistroWizard";

export const dynamic = "force-dynamic";

export default async function RegistroRunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const exists = await prisma.registroImport.count({ where: { id } });
  if (!exists) notFound();

  return (
    <>
      <p className="admin-sub">
        <Link href="/administrador/registro">← Registro</Link>
      </p>
      <RegistroWizard id={id} />
    </>
  );
}
