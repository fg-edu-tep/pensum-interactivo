// Client-safe (no fetcher import): used by the EFI picker and its tests.

import { normalizeCode } from "./import/normalizeCode";

/** "Electiva en Fundamentos de Ingeniería": any engineering course — every
 * Uniandes engineering subject starts with I (IELE, IMEC, IBIO, ISIS, IIND,
 * ICYA, IQUI, …). Accepts "IMEC 1234", "imec-1234", "IMEC1234L". */
export function isEngineeringCode(raw: string): boolean {
  return /^I[A-Z]{3}\d{4}[A-Z]?$/.test(normalizeCode(raw));
}
