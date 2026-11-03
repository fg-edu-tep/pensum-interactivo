// Personal access tokens for the MCP endpoint (app/api/mcp). Each admin creates
// their own in /administrador/cuenta; the secret is shown once and only its
// SHA-256 is stored (the secret is 256 random bits, so a plain hash is enough —
// unlike passwords there is nothing to brute-force). A token acts as its user:
// disabling the user, or a pending password reset, stops it too.
// Nodejs runtime only.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";

export const TOKEN_PREFIX = "pmcp_";
const MAX_PER_USER = 10;
/** lastUsedAt is refreshed at most this often, to keep reads cheap */
const TOUCH_MS = 5 * 60 * 1000;

export function hashApiToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function looksLikeApiToken(s: string | null | undefined): s is string {
  return !!s && s.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{40,80}$/.test(s);
}

export interface ApiTokenRow {
  id: number;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

const ROW_SELECT = { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true } as const;

export async function listApiTokens(userId: number): Promise<ApiTokenRow[]> {
  return prisma.adminApiToken.findMany({ where: { userId }, select: ROW_SELECT, orderBy: { createdAt: "desc" } });
}

/** Create a token; returns the secret (shown once) and the stored row. */
export async function createApiToken(
  userId: number,
  name: string,
  expiresInDays: number | null
): Promise<{ secret: string; row: ApiTokenRow } | { error: string }> {
  const label = name.trim().slice(0, 60);
  if (!label) return { error: "Ponle un nombre al token (p. ej. «Claude escritorio»)." };
  const active = await prisma.adminApiToken.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_PER_USER) return { error: `Máximo ${MAX_PER_USER} tokens activos. Revoca alguno primero.` };
  const secret = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const row = await prisma.adminApiToken.create({
    data: {
      userId,
      name: label,
      tokenHash: hashApiToken(secret),
      prefix: secret.slice(0, TOKEN_PREFIX.length + 6),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    },
    select: ROW_SELECT,
  });
  return { secret, row };
}

export async function revokeApiToken(userId: number, id: number): Promise<boolean> {
  const r = await prisma.adminApiToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count > 0;
}

export interface TokenActor {
  tokenId: number;
  userId: number;
  username: string;
}

/** The user a presented secret acts as, or null (unknown, revoked, expired,
 * user disabled or forced to reset the password). */
export async function authenticateApiToken(secret: string | null | undefined): Promise<TokenActor | null> {
  if (!looksLikeApiToken(secret)) return null;
  const tok = await prisma.adminApiToken.findUnique({
    where: { tokenHash: hashApiToken(secret) },
    include: { user: { select: { id: true, username: true, disabled: true, mustReset: true } } },
  });
  if (!tok || tok.revokedAt) return null;
  if (tok.expiresAt && tok.expiresAt.getTime() <= Date.now()) return null;
  if (tok.user.disabled || tok.user.mustReset) return null;
  if (!tok.lastUsedAt || Date.now() - tok.lastUsedAt.getTime() > TOUCH_MS) {
    await prisma.adminApiToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { tokenId: tok.id, userId: tok.user.id, username: tok.user.username };
}
