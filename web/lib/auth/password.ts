// Password + master-secret hashing. scrypt (node:crypto) with a per-secret random
// salt; stored as separate hash/salt hex columns (AdminUser.passwordHash/Salt,
// AdminSetting master_secret_hash/salt). Nodejs runtime only — never imported by
// the Edge middleware (which only verifies the signed session cookie).
//
// The legacy single ADMIN_PASSWORD env is gone: accounts live in the DB now
// (see lib/auth/users.ts) and the super-admin manages them.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt cost — N must be a power of 2. 2^15 is a reasonable server-side default.
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface HashedSecret {
  hash: string; // hex
  salt: string; // hex
}

/** Derive a fresh salted scrypt hash for a secret (password or mnemonic). */
export function hashSecret(secret: string): HashedSecret {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(secret.normalize("NFKC"), salt, KEYLEN, SCRYPT_PARAMS).toString("hex");
  return { hash, salt };
}

/** Constant-time verify of a secret against a stored hash+salt. */
export function verifySecret(secret: string, stored: HashedSecret | null | undefined): boolean {
  if (!stored?.hash || !stored?.salt) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(stored.hash, "hex");
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(secret.normalize("NFKC"), stored.salt, expected.length || KEYLEN, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Minimum acceptable password length for new/changed passwords. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordPolicyError(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (pw.length > 200) return "La contraseña es demasiado larga.";
  return null;
}
