import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildDiscrepancyReports } from "@/lib/discrepancy/service";
import type { CatalogRules } from "@/lib/types";
import CatalogEditor from "@/components/admin/CatalogEditor";

export const dynamic = "force-dynamic";

export default async function CatalogEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalog = await prisma.catalog.findUnique({
    where: { slug },
    include: {
      courses: {
        orderBy: [{ suggestedSemester: "asc" }, { sortIndex: "asc" }],
        include: {
          course: {
            select: {
              normalizedCode: true,
              description: true,
              descriptionSyncedAt: true,
            },
          },
        },
      },
      requirementNodes: { orderBy: [{ semester: "asc" }, { sortIndex: "asc" }] },
    },
  });
  if (!catalog) notFound();

  // document-vs-official-API report for this plan's rows (strip the tree: it is not serialisable UI data)
  const [disc] = await buildDiscrepancyReports([slug]);
  const discById = new Map(
    (disc?.courses ?? []).map((c) => {
      const { visible: _p, ...prereq } = c.prereq;
      const { visible: _c, ...coreq } = c.coreq;
      void _p;
      void _c;
      return [c.catalogCourseId, { prereq, coreq }] as const;
    })
  );

  const rules = (catalog.rules as CatalogRules | null) ?? {
    gates: [],
    attestations: [],
  };

  const data = {
    slug: catalog.slug,
    identity: {
      programName: catalog.programName,
      programCode: catalog.programCode,
      variantLabel: catalog.variantLabel,
      term: catalog.term,
      status: catalog.status,
      accentColor: catalog.accentColor ?? "",
      tagline: catalog.tagline ?? "",
      subtitle: catalog.subtitle ?? "",
      imagePath: catalog.imagePath ?? "",
    },
    courses: catalog.courses.map((c) => ({
      id: c.id,
      displayCode: c.displayCode,
      normalizedCode: c.course?.normalizedCode ?? null,
      name: c.name,
      credits: c.credits,
      suggestedSemester: c.suggestedSemester,
      courseType: c.courseType,
      isPlaceholder: c.isPlaceholder,
      placeholderKind: c.placeholderKind ?? "",
      placeholderLabel: c.placeholderLabel ?? "",
      prereqText: c.prereqText ?? "",
      pairingStatus: c.pairingStatus,
      manuallyEdited: c.manuallyEdited,
      lockedFields: (c.lockedFields as string[] | null) ?? [],
      description: c.course?.description ?? "",
      descriptionSyncedAt: c.course?.descriptionSyncedAt
        ? c.course.descriptionSyncedAt.toISOString()
        : null,
      discrepancy: discById.get(c.id) ?? null,
    })),
    requirementNodes: catalog.requirementNodes.map((n) => ({
      id: n.id,
      key: n.key,
      label: n.label,
      description: n.description ?? "",
      infoUrl: n.infoUrl ?? "",
      semester: n.semester,
      sortIndex: n.sortIndex,
      attestationId: n.attestationId ?? "",
      autoLinkRegex: n.autoLinkRegex ?? "",
      linkedCourseCodes: ((n.linkedCourseCodes as string[] | null) ?? []).join(", "),
    })),
    rules,
  };

  return (
    <>
      <p className="admin-sub">
        <Link href="/administrador">← Catálogos</Link> ·{" "}
        <Link href={`/administrador/catalogos/${slug}/mapa`}>Abrir mapa visual →</Link>
      </p>
      <h1>
        {catalog.programName}
        {catalog.variantLabel ? ` · ${catalog.variantLabel}` : ""}
      </h1>
      <p className="admin-sub">
        <code>{catalog.slug}</code> · {catalog.term} ·{" "}
        <span className={`admin-badge ${catalog.status}`}>{catalog.status}</span>
      </p>

      <CatalogEditor data={data} />
    </>
  );
}
