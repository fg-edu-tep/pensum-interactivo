// 12-word BIP39 mnemonic used as the super-admin "master secret".
//
// A real BIP39 phrase: 128 bits of CSPRNG entropy + a 4-bit SHA-256 checksum,
// split into 12 groups of 11 bits, each indexing the 2048-word English list.
// We generate it once at setup, show it to the super-admin to write down, and
// only ever store a scrypt hash of its normalized form (see mnemonicHash /
// verifyMnemonic). Nodejs runtime only (uses node:crypto).

import { createHash, randomBytes } from "node:crypto";
import { BIP39_WORDLIST } from "./bip39Wordlist";

const WORD_COUNT = 12;
const ENTROPY_BITS = 128; // 12 words → 128-bit entropy + 4-bit checksum
const ENTROPY_BYTES = ENTROPY_BITS / 8; // 16

/** Generate a fresh 12-word BIP39 mnemonic (space-separated, lowercase). */
export function generateMnemonic(): string {
  const entropy = randomBytes(ENTROPY_BYTES);
  return entropyToMnemonic(entropy);
}

function entropyToMnemonic(entropy: Buffer): string {
  const checksumBits = (entropy.length * 8) / 32; // 4 for 16 bytes
  const hash = createHash("sha256").update(entropy).digest();
  // bit string = entropy bits followed by the first `checksumBits` of the hash
  let bits = "";
  for (const b of entropy) bits += b.toString(2).padStart(8, "0");
  bits += hash[0].toString(2).padStart(8, "0").slice(0, checksumBits);

  const words: string[] = [];
  for (let i = 0; i < bits.length; i += 11) {
    const idx = parseInt(bits.slice(i, i + 11), 2);
    words.push(BIP39_WORDLIST[idx]);
  }
  return words.join(" ");
}

/**
 * Normalize a user-entered phrase for storage/compare: lowercase, trim, collapse
 * all whitespace to single spaces. (BIP39 phrases are ASCII; no NFKD needed for
 * the English list, but we still fold whitespace so copy/paste variations match.)
 */
export function normalizeMnemonic(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Structural validity: exactly 12 words, all in the wordlist, checksum ok. */
export function isValidMnemonic(input: string): boolean {
  const words = normalizeMnemonic(input).split(" ");
  if (words.length !== WORD_COUNT) return false;

  // 12 words → 132 bits = 128 entropy + 4 checksum.
  const totalBits = WORD_COUNT * 11; // 132
  const entBits = (totalBits * 32) / 33; // 128
  const csBits = totalBits - entBits; // 4

  let bits = "";
  for (const w of words) {
    const idx = BIP39_WORDLIST.indexOf(w);
    if (idx === -1) return false;
    bits += idx.toString(2).padStart(11, "0");
  }

  const entropyBitStr = bits.slice(0, entBits);
  const providedChecksum = bits.slice(entBits);

  const bytes: number[] = [];
  for (let i = 0; i < entropyBitStr.length; i += 8) {
    bytes.push(parseInt(entropyBitStr.slice(i, i + 8), 2));
  }
  const hash = createHash("sha256").update(Buffer.from(bytes)).digest();
  const expectedChecksum = hash[0].toString(2).padStart(8, "0").slice(0, csBits);
  return providedChecksum === expectedChecksum;
}
