import { notFound } from "next/navigation";
import { loadCourseInputs } from "@/lib/discrepancy/service";
import { BatchError, listMapEdits, loadDictionaryInfo, loadMapView } from "@/lib/mapEditor/service";
import type { ReqNode } from "@/lib/types";
import MapEditor from "@/components/admin/map/MapEditor";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let view;
  try {
    view = await loadMapView(slug);
  } catch (e) {
    if (e instanceof BatchError && e.status === 404) notFound();
    throw e;
  }
  const loaded = (await loadCourseInputs([slug])).get(slug);
  const term = loaded?.meta.term ?? "";
  const [dictionary, edits] = await Promise.all([loadDictionaryInfo(term), listMapEdits(slug)]);

  const title = `${view.catalog.programName}${view.catalog.variantLabel ? ` · ${view.catalog.variantLabel}` : ""}`;
  return (
    <>
      <MapEditor
        slug={slug}
        title={title}
        backHref="/administrador"
        classicHref={`/administrador/catalogos/${slug}`}
        orderVersion={view.orderVersion}
        rows={view.rows.map((r) => ({
          id: r.id,
          code: r.code,
          displayCode: r.displayCode,
          name: r.name,
          credits: r.credits,
          courseType: r.courseType,
          isPlaceholder: r.isPlaceholder,
          semester: r.suggestedSemester,
          sortIndex: r.sortIndex,
          prereqText: r.prereqText,
          coreqText: r.coreqText,
          prereqTree: (r.prereqTree as ReqNode | null) ?? null,
          coreqTree: (r.coreqTree as ReqNode | null) ?? null,
          lockedFields: (r.lockedFields as string[] | null) ?? [],
          version: r.version,
          prereqUnparsed: r.prereqUnparsed,
          coreqUnparsed: r.coreqUnparsed,
        }))}
        inputs={loaded?.inputs ?? []}
        dictionary={{
          importId: dictionary.importId,
          period: dictionary.period,
          planTerm: dictionary.planTerm,
          coversCurrentTerm: dictionary.coversCurrentTerm,
          entries: dictionary.entries.map((e) => ({ code: e.code, name: e.name })),
        }}
        edits={edits.map((e) => ({
          id: e.id,
          actor: e.actor,
          status: e.status,
          createdAt: e.createdAt.toISOString(),
          ops: e.ops,
        }))}
      />
    </>
  );
}
