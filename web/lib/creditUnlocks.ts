// "Desbloqueo por créditos": slots of the pensum that only read as available in
// Mi avance once the student has declared enough approved credits. It's a UX
// choice (a first-semester student shouldn't see every elective as "you can
// take this now"), not a business rule: below the threshold the slot simply
// shows the ordinary grey "not yet" state — no lock, no reason text — and it
// can still be marked as seen. Stored as gates in Catalog.rules.gates that
// select slots by `appliesTo.placeholderKinds` with `condition.minCredits`;
// lib/availability.ts `creditPending` reads them (evaluateGates skips them).
//
// Defaults for the pregrado plans (the coordinators' numbers, editable in
// /administrador → plan → Reglas):
//   EFI (Electiva en Fundamentos de Ingeniería)  75 créditos
//   Electivas IELE                                80 créditos
//   Curso de libre elección + Curso integrador    40 créditos
//
// They're added with `withCreditUnlockDefaults` wherever rules are read (the
// student payload, the admin editor, the seed) until the plan is marked
// `creditUnlocksSeeded` — which the seed and every admin save do — so a
// threshold an admin deletes stays deleted and production gets the defaults
// without a re-seed.

import type { CatalogRules, GateRule } from "./types";
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

function unlock(id: string, kinds: string[], minCredits: number): GateRule {
  return { id, label: creditUnlockLabel(minCredits), appliesTo: { placeholderKinds: kinds }, condition: { minCredits } };
}

export const CREDIT_UNLOCK_DEFAULTS: GateRule[] = [
  unlock("creditos-efi", ["EFI"], 75),
  unlock("creditos-electivas", ["ELECTIVA"], 80),
  unlock("creditos-cle-ci", ["CLE", "CI"], 40),
];

/** A gate edited in the "Desbloqueo por créditos" table: slots + min credits. */
export function isCreditUnlock(g: GateRule): boolean {
  return (g.appliesTo?.placeholderKinds?.length ?? 0) > 0;
}

/** Maestrías are out: an 80-credit threshold would lock a 36–40 credit plan forever. */
export function takesCreditUnlockDefaults(catalog: OrderableCatalog): boolean {
  return catalogFamilyRank(catalog) < 3;
}

export function withCreditUnlockDefaults(rules: CatalogRules, catalog: OrderableCatalog): CatalogRules {
  if (rules.creditUnlocksSeeded || !takesCreditUnlockDefaults(catalog)) return rules;
  const have = new Set((rules.gates ?? []).map((g) => g.id));
  return {
    ...rules,
    gates: [...(rules.gates ?? []), ...CREDIT_UNLOCK_DEFAULTS.filter((d) => !have.has(d.id))],
    creditUnlocksSeeded: true,
  };
}
