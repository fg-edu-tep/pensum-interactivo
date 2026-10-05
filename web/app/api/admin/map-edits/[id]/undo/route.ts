import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { undoMapEdit } from "@/lib/mapEditor/service";
import { mapError } from "@/lib/mapEditor/http";

export const runtime = "nodejs";

/** POST { force?: boolean } — restore the exact rows a canvas batch changed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  try {
    return NextResponse.json({ ok: true, ...(await undoMapEdit(id, { force: body.force === true, actor: await currentActor() })) });
  } catch (e) {
    return mapError(e, "map undo");
  }
}
