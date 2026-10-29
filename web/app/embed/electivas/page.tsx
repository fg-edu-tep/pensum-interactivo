import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { toVennElectives } from "@/lib/electiveVenn";
import { planTerm } from "@/lib/term";
import ElectiveVenn from "@/components/embed/ElectiveVenn";

// Public, iframe-able (next.config.mjs sets `frame-ancestors *` on /embed/*).
//   <iframe src="https://<host>/embed/electivas" width="100%" height="560"></iframe>
// Query: ?term=202620 (default: the published plans' term) · ?oferta=1 (start
// filtered to the electives taught that term).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Electivas Eléctrica / Electrónica",
  description: "Diagrama de Venn de las electivas de Ingeniería Eléctrica y Electrónica.",
};

export default async function ElectiveVennEmbed({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; oferta?: string }>;
}) {
  const sp = await searchParams;
  const [rows, catalog] = await Promise.all([
    prisma.elective.findMany({
      select: { id: true, name: true, code: true, level: true, ciclo: true, roles: true, offeredTerms: true, isCursoIntegrador: true },
    }),
    prisma.catalog.findFirst({ where: { status: "published" }, orderBy: { term: "desc" }, select: { term: true } }),
  ]);
  const term = /^\d{6}$/.test(sp.term ?? "") ? sp.term! : catalog?.term ?? planTerm();

  const electives = toVennElectives(
    rows.map((e) => ({
      ...e,
      roles: e.roles as Parameters<typeof toVennElectives>[0][number]["roles"],
      offeredTerms: (e.offeredTerms as string[] | null) ?? [],
    }))
  );

  // "Planear con esta materia" opens the standard plan of the program
  const plans = await prisma.catalog.findMany({ where: { status: "published" }, select: { slug: true } });
  const has = (slug: string) => plans.some((p) => p.slug === slug);
  const planSlugs = { ele: has("iele-cbu3") ? "iele-cbu3" : null, elc: has("ielc-cbu3") ? "ielc-cbu3" : null };

  return <ElectiveVenn electives={electives} term={term} initialOnlyOffered={sp.oferta === "1"} planSlugs={planSlugs} />;
}
