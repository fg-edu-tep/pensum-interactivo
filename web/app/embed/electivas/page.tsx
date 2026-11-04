import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { toVennElectives, type VennType } from "@/lib/electiveVenn";
import { planTerm, termFromDate } from "@/lib/term";
import { planningTermSetting } from "@/lib/import/official/settings";
import ElectivasTabla from "@/components/embed/ElectivasTabla";

// Public, iframe-able (next.config.mjs sets `frame-ancestors *` on /embed/*).
//   <iframe src="https://<host>/embed/electivas" width="100%" height="640"></iframe>
// Query (all optional, to deep-link a view):
//   ?programa=iele|ielc|ambos  ?tipo=electivas|integradores  ?periodo=202710
//   ?curso=IELE3336 (opens that course)  (?oferta=1 = the planning period, kept from the first version)

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Electivas Eléctrica / Electrónica",
  description: "Electivas y cursos integradores de Ingeniería Eléctrica y Electrónica: qué le vale a cada programa y qué se dicta.",
};

export default async function ElectivasEmbed({
  searchParams,
}: {
  searchParams: Promise<{ programa?: string; tipo?: string; periodo?: string; oferta?: string; curso?: string }>;
}) {
  const sp = await searchParams;
  const rows = await prisma.elective.findMany({
    select: { id: true, name: true, code: true, level: true, ciclo: true, roles: true, offeredTerms: true, isCursoIntegrador: true, attrs: true, projection: true, registroCredits: true },
  });
  const current = termFromDate();
  const planning = (await planningTermSetting()) ?? planTerm();

  const electives = toVennElectives(
    rows.map((e) => ({
      ...e,
      roles: e.roles as Parameters<typeof toVennElectives>[0][number]["roles"],
      attrs: e.attrs as Parameters<typeof toVennElectives>[0][number]["attrs"],
      offeredTerms: (e.offeredTerms as string[] | null) ?? [],
    }))
  ).filter((e) => e.mask !== 0);

  // "Planear con esta materia" opens the standard plan of the program
  const plans = await prisma.catalog.findMany({ where: { status: "published" }, select: { slug: true } });
  const has = (slug: string) => plans.some((p) => p.slug === slug);
  const planSlugs = { ele: has("iele-cbu3") ? "iele-cbu3" : null, elc: has("ielc-cbu3") ? "ielc-cbu3" : null };

  const prog = (sp.programa ?? "").toLowerCase();
  const tipo = (sp.tipo ?? "").toLowerCase();
  const initial = {
    ele: prog === "iele" || prog === "ambos",
    elc: prog === "ielc" || prog === "ambos",
    open: (sp.curso ?? "").toUpperCase().replace(/[\s-]+/g, "") || null,
    type: (tipo === "electivas" || tipo === "integradores" ? tipo : "todas") as VennType,
    term: /^\d{6}$/.test(sp.periodo ?? "") && [current, planning].includes(sp.periodo!) ? sp.periodo! : sp.oferta === "1" ? planning : null,
  };

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" precedence="default" />
      <ElectivasTabla electives={electives} terms={{ current, planning }} initial={initial} planSlugs={planSlugs} />
    </>
  );
}
