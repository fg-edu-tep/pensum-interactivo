import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { RegistroError, applyImport } from "@/lib/registro/service";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { slugs: string[], force?: boolean } — snapshot + write, all-or-nothing. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { slugs?: unknown; force?: unknown } | null;
  if (!body || !Array.isArray(body.slugs) || !body.slugs.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: "Indica los catálogos a aplicar (slugs)." }, { status: 400 });
  }
  try {
    const result = await applyImport(id, {
      slugs: body.slugs as string[],
      force: body.force === true,
      actor: await currentActor(),
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof RegistroError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("registro apply failed", e);
    return NextResponse.json({ error: "No se pudo aplicar; no se escribió nada." }, { status: 500 });
  }
}
