import { NextResponse } from "next/server";
import { isInitialized } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the one-time setup has already completed. */
export async function GET() {
  return NextResponse.json({ initialized: await isInitialized() });
}
