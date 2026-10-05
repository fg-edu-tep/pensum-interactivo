import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { RegistroError, undoImport } from "@/lib/registro/service";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { force?: boolean } — restore every row the apply touched (all-or-nothing). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  try {
    const out = await undoImport(id, { force: body.force === true, actor: await currentActor() });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof RegistroError) {
      const conflicts = (e as RegistroError & { conflicts?: unknown }).conflicts;
      return NextResponse.json({ error: e.message, ...(conflicts ? { conflicts } : {}) }, { status: e.status });
    }
    console.error("registro undo failed", e);
    return NextResponse.json({ error: "No se pudo deshacer; no se cambió nada." }, { status: 500 });
  }
}
