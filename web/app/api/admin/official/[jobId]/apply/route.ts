import { NextResponse } from "next/server";
import { applyOfficialJob } from "@/lib/import/official/apply";
import { currentActor } from "@/lib/auth/actor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const id = Number((await ctx.params).jobId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "jobId inválido" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { confirmRemovals?: boolean; forceConflicts?: boolean };
  try {
    const result = await applyOfficialJob(id, {
      actor: await currentActor(),
      confirmRemovals: body.confirmRemovals !== false,
      forceConflicts: !!body.forceConflicts,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
