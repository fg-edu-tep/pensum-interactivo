import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sortCatalogs } from "@/lib/catalogOrder";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalogs = await prisma.catalog.findMany({
    where: { status: "published" },
    orderBy: [{ programCode: "asc" }, { slug: "asc" }],
    select: {
      slug: true,
      programCode: true,
      programName: true,
      variantLabel: true,
      term: true,
      _count: { select: { courses: true } },
    },
  });
  return NextResponse.json({
    catalogs: sortCatalogs(catalogs).map((c) => ({
      slug: c.slug,
      programCode: c.programCode,
      programName: c.programName,
      variantLabel: c.variantLabel,
      term: c.term,
      courseCount: c._count.courses,
    })),
  });
}
