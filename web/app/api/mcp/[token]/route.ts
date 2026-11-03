// Same MCP endpoint with the token in the path, for clients that only take a
// URL (claude.ai / Claude Desktop custom connectors). The URL is the secret:
// treat it like a password, and revoke the token in /administrador/cuenta if
// it leaks.

import { authenticateApiToken } from "@/lib/auth/apiTokens";
import { handleMcpPost, methodNotAllowed, unauthorized } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await authenticateApiToken(token);
  if (!actor) return unauthorized();
  return handleMcpPost(req, { actor: actor.username });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
