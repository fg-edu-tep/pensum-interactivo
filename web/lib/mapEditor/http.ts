import { NextResponse } from "next/server";
import { BatchError } from "./plan";

/** Map service errors to JSON responses; anything unexpected is a generic 500 (nothing was written). */
export function mapError(e: unknown, what: string) {
  if (e instanceof BatchError)
    return NextResponse.json({ error: e.message, ...(e.detail ? { detail: e.detail } : {}) }, { status: e.status });
  console.error(`${what} failed`, e);
  return NextResponse.json({ error: "No se pudo completar; no se cambió nada." }, { status: 500 });
}
