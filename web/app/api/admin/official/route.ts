// The department's official load (lib/import/official): PLANES, BOLSAS and
// PRERREQUISITOS + the period it opens for planning. Nothing is written here
// but the pending ImportJob — the admin reviews the report, then applies.
//
// POST multipart: planes, bolsas, requisitos (files), planningTerm (YYYYPP)
//   200 { jobId }   400 { error }

import { NextResponse } from "next/server";
import { prepareOfficialLoad } from "@/lib/import/official/prepare";
import { createOfficialJob } from "@/lib/import/official/apply";
import { currentActor } from "@/lib/auth/actor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const files = { planes: form?.get("planes"), bolsas: form?.get("bolsas"), requisitos: form?.get("requisitos") };
  for (const [k, f] of Object.entries(files)) {
    if (!(f instanceof File)) return NextResponse.json({ error: `Falta el archivo ${k.toUpperCase()}.` }, { status: 400 });
    if (!/\.xlsx$/i.test(f.name)) return NextResponse.json({ error: `${f.name}: debe ser .xlsx.` }, { status: 400 });
  }
  const planningTerm = String(form?.get("planningTerm") ?? "").trim();
  if (!/^\d{4}(10|20)$/.test(planningTerm)) {
    return NextResponse.json({ error: "Declara el periodo de planeación (p. ej. 202710)." }, { status: 400 });
  }
  const f = files as Record<string, File>;
  try {
    const prep = prepareOfficialLoad({
      planes: Buffer.from(await f.planes.arrayBuffer()),
      bolsas: Buffer.from(await f.bolsas.arrayBuffer()),
      requisitos: Buffer.from(await f.requisitos.arrayBuffer()),
      filenames: { planes: f.planes.name, bolsas: f.bolsas.name, requisitos: f.requisitos.name },
      planningTerm,
    });
    const { jobId } = await createOfficialJob(prep, await currentActor());
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json({ error: "No se pudieron leer los archivos: " + (e as Error).message }, { status: 400 });
  }
}
