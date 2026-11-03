// Registro tokens that are not courses but show up in requirement expressions
// (alternatives such as "EXMA1 O (IELE 2300 Y …)"). Shown by meaning, with the
// code in parentheses so a coordinator can still recognise it.
export const TOKEN_NAMES: Record<string, string> = {
  EXMA1: "ser estudiante de maestría (EXMA1)",
  EXDO1: "ser estudiante de doctorado (EXDO1)",
  ENGL7: "requisito de lectura en inglés (ENGL7)",
  INLE4: "requisito de lectura en inglés (INLE4)",
  RLEC1: "requisito de lectura en inglés (RLEC1)",
  RLEN1: "requisito de lectura en inglés (RLEN1)",
  RPOS1: "requisito de idiomas de posgrado (RPOS1)",
  INGP3: "requisito de idiomas de posgrado (INGP3)",
};

export function tokenName(code: string): string | null {
  return TOKEN_NAMES[code.replace(/\s+/g, "").toUpperCase()] ?? null;
}
