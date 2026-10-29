// "Desbloqueo por créditos": an OPTIONAL admin tool. A slot type (EFI,
// electivas, CLE, curso integrador, CBU) can be given a number of declared
// approved credits below which it reads as "aún no" in Mi avance — a UX state,
// never a lock. Stored as gates in Catalog.rules.gates that select slots by
// `appliesTo.placeholderKinds` with `condition.minCredits`; read by
// lib/availability.ts `creditPending` (evaluateGates skips them).
//
// There are NO defaults any more (2026-10-29): elective slots are enabled by
// requirement (lib/electiveAvailability.ts). The thresholds seeded on
// 2026-10-22 (EFI 75, electivas 80, CLE + CI 40) are removed once from every
// plan by `withRuleDefaults` (flag `creditUnlocksRetired`); anything an admin
// adds afterwards is kept.

import type { CatalogRules, GateRule } from "./types";
import { SECOND_LANGUAGE_ATTESTATION } from "./catalogRules";
import { catalogFamilyRank, type OrderableCatalog } from "./catalogOrder";

/** Slot kinds an admin can put behind a credit threshold, with their names. */
export const UNLOCKABLE_SLOT_KINDS: { kind: string; label: string }[] = [
  { kind: "EFI", label: "Electiva en Fundamentos de Ingeniería" },
  { kind: "ELECTIVA", label: "Electivas" },
  { kind: "CLE", label: "Curso de libre elección" },
  { kind: "CI", label: "Curso integrador" },
  { kind: "CBU", label: "CBU" },
];

export function creditUnlockLabel(minCredits: number): string {
  return `Se habilita con ${minCredits} créditos aprobados`;
}

/** the 2026-10-22 defaults, now retired (see the header) */
export const RETIRED_DEFAULT_IDS = new Set(["creditos-efi", "creditos-electivas", "creditos-cle-ci"]);

/** A gate edited in the "Desbloqueo por créditos" table: slots + min credits. */
export function isCreditUnlock(g: GateRule): boolean {
  return (g.appliesTo?.placeholderKinds?.length ?? 0) > 0;
}

/** Pregrado-only defaults (the second-language requirement); maestrías are out. */
export function takesPregradoDefaults(catalog: OrderableCatalog): boolean {
  return catalogFamilyRank(catalog) < 3;
}

/** Rule migrations applied wherever rules are read (student payload, admin
 * editor, seed), once each — the flag keeps an admin's later changes:
 *   - the retired credit-threshold defaults are removed (all plans);
 *   - pregrado plans get the "Requisito segundo idioma" attestation. */
export function withRuleDefaults(rules: CatalogRules, catalog: OrderableCatalog): CatalogRules {
  let out = rules;
  if (!out.creditUnlocksRetired) {
    out = {
      ...out,
      gates: (out.gates ?? []).filter((g) => !RETIRED_DEFAULT_IDS.has(g.id)),
      creditUnlocksRetired: true,
    };
  }
  if (!takesPregradoDefaults(catalog)) return out;
  if (!out.secondLanguageSeeded) {
    const atts = [...(out.attestations ?? [])];
    if (!atts.some((a) => a.id === SECOND_LANGUAGE_ATTESTATION.id)) {
      const english = atts.findIndex((a) => a.id === "idioma");
      atts.splice(english >= 0 ? english + 1 : atts.length, 0, SECOND_LANGUAGE_ATTESTATION);
    }
    out = { ...out, attestations: atts, secondLanguageSeeded: true };
  }
  return out;
}
