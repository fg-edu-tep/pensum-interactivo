import { NextResponse } from "next/server";
import { discardImportJob } from "@/lib/import/applyPlanes";
import { currentActor } from "@/lib/auth/actor";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const id = Number((await ctx.params).jobId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "jobId inválido" }, { status: 400 });
  await discardImportJob(id, await currentActor());
  return NextResponse.json({ ok: true });
}
