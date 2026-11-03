import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpPost, handleRpc, SUPPORTED_PROTOCOL_VERSIONS } from "./server";
import { TOOLS, ToolInputError, type ToolDef } from "./tools";
import { hashApiToken, looksLikeApiToken, TOKEN_PREFIX } from "../auth/apiTokens";

type Any = any;

const ctx = { actor: "mauricio" };
const echo: ToolDef = {
  name: "echo",
  title: "Echo",
  description: "returns its args and the actor",
  inputSchema: { type: "object" },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (args, c) => {
    if (args.bad) throw new ToolInputError("bad input");
    if (args.boom) throw new Error("db password leaked here");
    return { args, actor: c.actor };
  },
};
const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method, params });

test("initialize negotiates a supported protocol version and announces tools", async () => {
  const r = (await handleRpc(rpc("initialize", { protocolVersion: "2025-03-26" }), ctx)) as Any;
  assert.equal(r.result.protocolVersion, "2025-03-26");
  assert.ok(r.result.capabilities.tools);
  const unknown = (await handleRpc(rpc("initialize", { protocolVersion: "1999-01-01" }), ctx)) as Any;
  assert.equal(unknown.result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
});

test("notifications get no response", async () => {
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
});

test("unknown method / tool are JSON-RPC errors", async () => {
  const m = (await handleRpc(rpc("resources/list"), ctx)) as Any;
  assert.equal(m.error.code, -32601);
  const t = (await handleRpc(rpc("tools/call", { name: "nope", arguments: {} }), ctx, [echo])) as Any;
  assert.equal(t.error.code, -32602);
});

test("tools/call runs the tool as the token's user", async () => {
  const r = (await handleRpc(rpc("tools/call", { name: "echo", arguments: { a: 1 } }), ctx, [echo])) as Any;
  assert.equal(r.result.isError, false);
  assert.deepEqual(JSON.parse(r.result.content[0].text), { args: { a: 1 }, actor: "mauricio" });
});

test("input errors are shown to the model; internal errors are not leaked", async () => {
  const bad = (await handleRpc(rpc("tools/call", { name: "echo", arguments: { bad: true } }), ctx, [echo])) as Any;
  assert.deepEqual([bad.result.isError, bad.result.content[0].text], [true, "bad input"]);
  const orig = console.error;
  console.error = () => {};
  try {
    const boom = (await handleRpc(rpc("tools/call", { name: "echo", arguments: { boom: true } }), ctx, [echo])) as Any;
    assert.equal(boom.result.isError, true);
    assert.doesNotMatch(boom.result.content[0].text, /password/);
  } finally {
    console.error = orig;
  }
});

test("HTTP: notification → 202, request → JSON, garbage → 400, batch → array", async () => {
  const post = (body: string) => handleMcpPost(new Request("http://x/api/mcp", { method: "POST", body }), ctx, [echo]);
  assert.equal((await post(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).status, 202);
  const ok = await post(JSON.stringify(rpc("ping")));
  assert.deepEqual([ok.status, await ok.json()], [200, { jsonrpc: "2.0", id: 1, result: {} }]);
  assert.equal((await post("{not json")).status, 400);
  const batch = await post(JSON.stringify([rpc("ping", undefined, 1), rpc("ping", undefined, 2)]));
  assert.equal(((await batch.json()) as unknown[]).length, 2);
});

test("the real tool list: course-level only, every write tool marked as such", () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    "get_course_requirements",
    "list_plans",
    "list_requirement_differences",
    "search_courses",
    "set_corequisites",
    "set_prerequisites",
    "set_requirement_override",
  ]);
  for (const t of TOOLS) assert.equal(t.annotations.readOnlyHint, !t.name.startsWith("set_"), t.name);
});

test("tokens: only well-formed secrets are looked up; the hash is stable", () => {
  const s = TOKEN_PREFIX + "A".repeat(43);
  assert.ok(looksLikeApiToken(s));
  assert.ok(!looksLikeApiToken("Bearer " + s));
  assert.ok(!looksLikeApiToken("pmcp_short"));
  assert.ok(!looksLikeApiToken(undefined));
  assert.equal(hashApiToken(s), hashApiToken(s));
  assert.notEqual(hashApiToken(s), hashApiToken(s + "B"));
});
