// Registro's "Restricción de programa" / "Restricción de nivel", read for the
// two undergraduate programs this app plans for. Clauses are joined by "&":
//
//   INCLUYE INGENIERIA ELECTRICA                       only that program
//   INCLUYE MAEST.INTELIGENCIA ARTIFICIAL & INCLUYE …  only those (→ not ours)
//   EXCLUYE MAEST.INTELIGENCIA ARTIFICIAL              everyone but them
//
// INCLUYE clauses form an allow-list; EXCLUYE clauses a deny-list. A program
// matches a clause only by its exact undergraduate name ("INGENIERIA
// ELECTRICA" is not "MAESTRIA EN ING.ELECTRICA"). Pure, isomorphic.

import { foldAccents } from "../textMatch";

export type StudentProgram = "IELE" | "IELC" | "DOBLE";

const NAMES: Record<"IELE" | "IELC", RegExp> = {
  IELE: /^(INGENIERIA|ING\.?) ELECTRICA$/,
  IELC: /^(INGENIERIA|ING\.?) ELECTRONICA$/,
};

function clauses(text: string | null | undefined): { include: boolean; what: string }[] {
  return foldAccents(text ?? "")
    .toUpperCase()
    .split("&")
    .map((c) => c.replace(/\s+/g, " ").trim())
    .map((c) => {
      const m = /^(INCLUYE|EXCLUYE) (.+)$/.exec(c);
      return m ? { include: m[1] === "INCLUYE", what: m[2].trim() } : null;
    })
    .filter((x): x is { include: boolean; what: string } => !!x);
}

function matches(what: string, program: "IELE" | "IELC"): boolean {
  return NAMES[program].test(what);
}

/** Can a student of `program` register? (DOBLE: either program is enough.) */
export function programAllows(restriction: string | null | undefined, program: StudentProgram): boolean {
  const cs = clauses(restriction);
  if (cs.length === 0) return true;
  const progs: ("IELE" | "IELC")[] = program === "DOBLE" ? ["IELE", "IELC"] : [program];
  return progs.some((p) => {
    if (cs.some((c) => !c.include && matches(c.what, p))) return false;
    const inc = cs.filter((c) => c.include);
    return inc.length === 0 || inc.some((c) => matches(c.what, p));
  });
}

/** The allow-list in plain words, for "Solo para: …" ("" when there is none). */
export function programAllowList(restriction: string | null | undefined): string {
  return clauses(restriction)
    .filter((c) => c.include)
    .map((c) => prettyProgram(c.what))
    .join(", ");
}

export function prettyProgram(what: string): string {
  const t = what
    .toUpperCase()
    .replace(/^MAEST(?:RIA|R)?\.?\s*(?:EN\s+)?/, "MAESTRÍA EN ")
    .replace(/\bING\.\s*/g, "INGENIERÍA ")
    .replace(/\bINTELIGENC\.\s*/g, "INTELIGENCIA ")
    .replace(/\bGERENC\.\s*/g, "GERENCIA ")
    .replace(/\bTECNOLOG\.\s*/g, "TECNOLOGÍAS ")
    .replace(/\bINFORMAC\b/g, "INFORMACIÓN")
    .replace(/\bANALIT\.\s*/g, "ANALÍTICA ")
    .replace(/\bELECTRON\.\s*/g, "ELECTRÓNICA ")
    .replace(/\bINGENIERIA\b/g, "INGENIERÍA")
    .replace(/\bELECTRICA\b/g, "ELÉCTRICA")
    .replace(/\bELECTRONICA\b/g, "ELECTRÓNICA")
    .replace(/\bCOMPUTACION\b/g, "COMPUTACIÓN")
    .replace(/\bBIOMEDICA\b/g, "BIOMÉDICA")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Undergraduate students can register? ("INCLUYE MAGISTER" alone = no). */
export function levelAllowsPregrado(level: string | null | undefined): boolean {
  const cs = clauses(level);
  if (cs.length === 0) return true;
  if (cs.some((c) => !c.include && /PREGRADO/.test(c.what))) return false;
  const inc = cs.filter((c) => c.include);
  return inc.length === 0 || inc.some((c) => /PREGRADO/.test(c.what));
}
