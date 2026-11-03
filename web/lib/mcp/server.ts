// A minimal, stateless MCP server over Streamable HTTP: every request is one
// JSON-RPC POST answered with application/json (no SSE stream, no sessions),
// which is all a tools-only server needs and fits Vercel functions.
// Methods: initialize, ping, tools/list, tools/call; notifications get 202.
// Auth happens in the route (app/api/mcp) before anything here runs.

import { TOOLS, ToolInputError, type ToolContext, type ToolDef } from "./tools";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SERVER_INFO = { name: "pensum-interactivo", title: "Pensum IELE · requisitos", version: "1.0.0" };

const INSTRUCTIONS =
  "Edits the prerequisites and corequisites of courses in the Uniandes Electrical/Electronic Engineering pensum planner. " +
  "Students see the official Uniandes API first; each plan's own value (the 'document') is only a fallback unless an admin " +
  "override is on. Before changing a course, call get_course_requirements and show the user the current values. " +
  "When a set_* tool returns needsDecision=true, nothing was saved: explain how the new value differs from the API and ask " +
  "the user whether students should see their value instead of the API (override=true) or keep the API (override=false). " +
  "Answer the user in their language (the department works in Spanish).";

type Id = string | number;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: Id | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: Id | null; result: unknown }
  | { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string } };

const err = (id: Id | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function toolListing(t: ToolDef) {
  return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
}

/** One JSON-RPC message → its response, or null for a notification. */
export async function handleRpc(msg: unknown, ctx: ToolContext, tools: ToolDef[] = TOOLS): Promise<JsonRpcResponse | null> {
  const m = msg as Partial<JsonRpcRequest> | null;
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    // a response or garbage: nothing to answer if it had no id
    return m && typeof m === "object" && "id" in m && !("result" in m || "error" in m)
      ? err((m.id as Id) ?? null, -32600, "Invalid Request")
      : null;
  }
  if (m.id === undefined || m.id === null) return null; // notification
  const id = m.id;
  const params = (m.params ?? {}) as Record<string, unknown>;

  switch (m.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: tools.map(toolListing) } };
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return err(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (typeof args !== "object" || Array.isArray(args)) return err(id, -32602, "arguments must be an object");
      try {
        const out = await tool.run(args, ctx);
        const isError = !!out && typeof out === "object" && "error" in out && !!(out as { error?: unknown }).error;
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError } };
      } catch (e) {
        // input problems are the model's to fix; anything else is logged, not leaked
        const message = e instanceof ToolInputError ? e.message : "Error interno al ejecutar la herramienta.";
        if (!(e instanceof ToolInputError)) console.error(`mcp tool ${tool.name} failed`, e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
      }
    }
    default:
      return err(id, -32601, `Method not found: ${m.method}`);
  }
}

/** The HTTP side: POST body (one message or a batch) → Response. */
export async function handleMcpPost(req: Request, ctx: ToolContext, tools: ToolDef[] = TOOLS): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(err(null, -32700, "Parse error"), { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, ctx, tools)))).filter((r): r is JsonRpcResponse => r !== null);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handleRpc(body, ctx, tools);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

/** No server-initiated stream: GET/DELETE are not offered (spec-allowed 405). */
export function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function unauthorized(): Response {
  return Response.json(
    { error: "unauthorized", message: "Token de acceso inválido, vencido o revocado. Créalo en /administrador/cuenta." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="pensum-mcp"' } }
  );
}
