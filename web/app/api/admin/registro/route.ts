import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { RegistroFormatError } from "@/lib/registro/parse";
import { RegistroError, createImport } from "@/lib/registro/service";

export const runtime = "nodejs";
// parsing the ~3 MB / 117k-row export takes ~7 s and ~650 MB
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;

/** POST multipart { file } — upload Excel_Registro.xlsx, reduce it, start a wizard run. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Adjunta el archivo Excel_Registro.xlsx en el campo 'file'." }, { status: 400 });
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "El archivo debe ser .xlsx." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera el límite de 25 MB." }, { status: 413 });
  }
  try {
    const id = await createImport(
      { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
      await currentActor()
    );
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof RegistroFormatError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof RegistroError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("registro upload failed", e);
    return NextResponse.json({ error: "No se pudo procesar el archivo." }, { status: 500 });
  }
}
