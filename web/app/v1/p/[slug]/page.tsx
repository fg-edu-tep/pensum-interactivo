// Frozen mirror of app/p/[slug]/page.tsx, rendering the untouched legacy
// explorer (components/legacy/PensumExplorer) so the current design stays
// reachable at /v1 for a side-by-side comparison with the redesign at /p.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildCatalogPayload } from "@/lib/catalogPayload";
import PensumExplorer from "@/components/legacy/PensumExplorer";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await buildCatalogPayload(slug);
  if (!payload) return { title: "Pensum no encontrado" };
  const v = payload.catalog.variantLabel ? ` · ${payload.catalog.variantLabel}` : "";
  return { title: `${payload.catalog.programName}${v} — Pensum interactivo (v1)` };
}

export default async function LegacyCatalogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await buildCatalogPayload(slug);
  if (!payload) notFound();

  const mihorarioUrl =
    process.env.MIHORARIO_URL ??
    "https://open-source-uniandes.github.io/Mi-Horario-Uniandes/";

  return (
    <PensumExplorer key={payload.catalog.slug} data={payload} mihorarioUrl={mihorarioUrl} />
  );
}
