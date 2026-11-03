// MCP endpoint (Streamable HTTP, stateless). Auth: a personal access token
// from /administrador/cuenta, sent as "Authorization: Bearer pmcp_…" (Claude
// Code, Antigravity, Claude Desktop via config). Clients that cannot send
// headers (claude.ai custom connectors) use /api/mcp/<token> instead.
// Outside /api/admin on purpose: the admin middleware only knows cookies.

import { authenticateApiToken } from "@/lib/auth/apiTokens";
import { handleMcpPost, methodNotAllowed, unauthorized } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  const actor = await authenticateApiToken(m?.[1]);
  if (!actor) return unauthorized();
  return handleMcpPost(req, { actor: actor.username });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
