import { prisma } from "@/lib/db";
import { sortCatalogs } from "@/lib/catalogOrder";
import CatalogPicker, { type PickerCatalog } from "@/components/CatalogPicker";

export const dynamic = "force-dynamic";

export default async function CatalogPickerPage() {
  const rows = await prisma.catalog.findMany({
    where: { status: "published" },
    orderBy: [{ programCode: "asc" }, { slug: "asc" }],
    select: {
      slug: true,
      programName: true,
      programCode: true,
      variantLabel: true,
      term: true,
      accentColor: true,
      tagline: true,
      subtitle: true,
      imagePath: true,
      _count: { select: { courses: true } },
    },
  });

  const catalogs: PickerCatalog[] = sortCatalogs(rows).map((c) => ({
    slug: c.slug,
    programName: c.programName,
    programCode: c.programCode,
    variantLabel: c.variantLabel,
    term: c.term,
    accentColor: c.accentColor,
    tagline: c.tagline,
    subtitle: c.subtitle,
    imagePath: c.imagePath,
    courseCount: c._count.courses,
  }));

  return <CatalogPicker catalogs={catalogs} />;
}
