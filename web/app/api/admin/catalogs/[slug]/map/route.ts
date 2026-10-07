import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listMapEdits, loadDictionaryInfo, loadMapView } from "@/lib/mapEditor/service";
import { mapError } from "@/lib/mapEditor/http";

export const runtime = "nodejs";

/** GET — the plan as the canvas needs it: rows + versions, code dictionary, recent edits. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const view = await loadMapView(slug);
    const cat = await prisma.catalog.findUnique({ where: { slug }, select: { term: true } });
    const [dictionary, edits] = await Promise.all([loadDictionaryInfo(cat?.term ?? ""), listMapEdits(slug)]);
    return NextResponse.json({ ...view, dictionary, edits });
  } catch (e) {
    return mapError(e, "map view");
  }
}
