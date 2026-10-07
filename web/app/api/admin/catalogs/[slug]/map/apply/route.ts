import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { applyMapBatch } from "@/lib/mapEditor/service";
import { mapError } from "@/lib/mapEditor/http";
import type { MapBatch } from "@/lib/mapEditor/ops";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST MapBatch — validate, then apply atomically. 409 = stale / needs confirmation, 422 = invalid. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Partial<MapBatch> | null;
  if (!body || !Array.isArray(body.ops)) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  try {
    const out = await applyMapBatch({ ...(body as MapBatch), catalogSlug: slug }, await currentActor());
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return mapError(e, "map apply");
  }
}
