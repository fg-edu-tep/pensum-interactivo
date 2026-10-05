// Signed session cookies for the /administrador panel. Edge-compatible (Web
// Crypto only), so the same module works in middleware and in route handlers.
//
// Two cookies:
//   pensum_admin  — proves "logged in as <username>" (12h). Payload carries the
//                   username so the audit log + account page know who's acting.
//   pensum_super  — proves "unlocked the super-panel with the master secret"
//                   (short TTL). Required *in addition* to pensum_admin for the
//                   /administrador/super area and its API.
//
// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET)).

export const SESSION_COOKIE = "pensum_admin";
export const SUPER_COOKIE = "pensum_super";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
export const SUPER_TTL_SECONDS = 60 * 30; // 30 min — re-enter the master secret after

export interface SessionPayload {
  sub: string; // username (admin cookie) or "super" (super cookie)
  kind: "admin" | "super";
  exp: number; // unix seconds
}

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (>=16 chars)");
  }
  return s;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createToken(payload: SessionPayload): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

/** Decode + verify a token; returns the payload if the signature + expiry hold. */
export async function readToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    if (!timingSafeEqual(sig, await sign(body))) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body))
    ) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- admin session (logged-in user) ---

/** Mint a session token for a logged-in user. */
export async function createSessionToken(username: string): Promise<string> {
  return createToken({
    sub: username,
    kind: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

/** Backwards-friendly boolean check used by the Edge middleware. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  const p = await readToken(token);
  return !!p && p.kind === "admin";
}

/** The username carried by a valid admin token, or null. */
export async function sessionUsername(
  token: string | undefined | null
): Promise<string | null> {
  const p = await readToken(token);
  return p && p.kind === "admin" ? p.sub : null;
}

// --- super session (master-secret unlock) ---

export async function createSuperToken(): Promise<string> {
  return createToken({
    sub: "super",
    kind: "super",
    exp: Math.floor(Date.now() / 1000) + SUPER_TTL_SECONDS,
  });
}

export async function verifySuperToken(
  token: string | undefined | null
): Promise<boolean> {
  const p = await readToken(token);
  return !!p && p.kind === "super";
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function superCookieOptions(maxAgeSeconds = SUPER_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
