import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/actor";
import { RegistroFormatError } from "@/lib/registro/parse";
import {
  RegistroError,
  discardImport,
  getImportView,
  reprocessImport,
  saveResolutions,
} from "@/lib/registro/service";
import type { ScopeOptions } from "@/lib/registro/types";
import type { Resolutions } from "@/lib/registro/analyze";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function fail(e: unknown) {
  if (e instanceof RegistroFormatError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof RegistroError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("registro route failed", e);
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}

async function parseId(ctx: Ctx): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** GET — the whole wizard state (dictionary, items, resolutions, link plan). ?force=1&slugs=a,b */
export async function GET(req: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (!id) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const url = new URL(req.url);
  try {
    return NextResponse.json(
      await getImportView(id, {
        force: url.searchParams.get("force") === "1",
        slugs: url.searchParams.get("slugs")?.split(",").filter(Boolean),
      })
    );
  } catch (e) {
    return fail(e);
  }
}

/**
 * PATCH { scope?: { levels?, selectedRegularTerms? }, resolutions? }
 *  - scope       -> re-reduce from the kept file (slow, ~7 s)
 *  - resolutions -> replace the admin's decisions (validated)
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (!id) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as {
    scope?: Partial<Pick<ScopeOptions, "levels" | "selectedRegularTerms">>;
    resolutions?: Resolutions;
  } | null;
  if (!body || (!body.scope && !body.resolutions)) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }
  try {
    const actor = await currentActor();
    if (body.scope) {
      const patch: Partial<ScopeOptions> = {};
      if (body.scope.levels) {
        const levels = body.scope.levels.map((l) => String(l).toUpperCase());
        if (levels.some((l) => !["PREG", "POST"].includes(l))) {
          return NextResponse.json({ error: "Nivel inválido (PREG | POST)." }, { status: 400 });
        }
        patch.levels = levels;
      }
      if (body.scope.selectedRegularTerms) {
        const terms = body.scope.selectedRegularTerms.map(String);
        if (terms.some((t) => !/^\d{4}(10|20)$/.test(t))) {
          return NextResponse.json({ error: "Semestre regular inválido." }, { status: 400 });
        }
        patch.selectedRegularTerms = terms;
      }
      await reprocessImport(id, patch, actor);
    }
    if (body.resolutions) await saveResolutions(id, body.resolutions, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** DELETE — discard an open run (an applied run cannot be discarded). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (!id) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  try {
    await discardImport(id, await currentActor());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
