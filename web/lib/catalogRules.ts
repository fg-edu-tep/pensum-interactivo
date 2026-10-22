// Admin-authored progression rules per catalog. The seed writes these into the
// `Catalog.rules` JSON column; the student panel reads them from the payload and
// enforces them client-side (see lib/availability.ts `evaluateGates`).
//
// A future /administrador screen will edit the same column — this file is just
// the current authoring surface. Edit + `npm run seed` to apply.
//
//   attestations: self-checked, non-course requirements. `autoGatePrereqRegex`
//     locks any course whose prereq tree mentions a matching code until checked.
//   gates: "you can't take course X until <condition>". Every sub-condition
//     present in `condition` must hold (AND). `appliesTo` selects the locked
//     courses by code regex, suggested semester, or explicit Course.id.

import type { CatalogRules } from "./types";

// The English-reading requirement is now a node in the graph (see
// catalogPayload.ts) that courses reference as a normal prerequisite, so it no
// longer needs `autoGatePrereqRegex` — the node does the blocking. The field is
// still supported by evaluateGates() for any future non-course attestation.
const LANGUAGE_ATTESTATION = {
  id: "idioma",
  label: "Requisito de lectura en inglés",
  description:
    "Suficiencia por examen de clasificación (LENG / ENGL / RLEC) o exención " +
    "registrada en el Registro Académico. Ver el nodo “Requisito de lectura en " +
    "inglés” en el mapa.",
};

// Not the same as the English-reading requirement above: a separate
// graduation requirement of proficiency in a second language.
export const SECOND_LANGUAGE_ATTESTATION = {
  id: "segundo-idioma",
  label: "Requisito segundo idioma",
  description:
    "Dominio de una segunda lengua exigido para grado (distinto del requisito de lectura en inglés).",
  infoUrl:
    "https://cienciassociales.uniandes.edu.co/lenguas-cultura/servicios/requisitos-lenguas-grado/requisito-de-dominio-en-segunda-lengua/",
};

// Two distinct graduation requirements — NOT the same thing.
const INTERNACIONALIZACION_ATTESTATION = {
  id: "internacionalizacion",
  label: "Requisito de internacionalización",
  description:
    "Experiencia internacional exigida para grado (intercambio, curso o " +
    "actividad internacional, o su equivalencia aprobada).",
};

const SABERPRO_ATTESTATION = {
  id: "saberpro",
  label: "Saber Pro",
  description:
    "Haber presentado el Examen de Estado Saber Pro (requisito nacional de grado).",
};

/** Common baseline for the CBU3 plans.
 *
 * Only the language attestation for now: its `autoGatePrereqRegex` locks any
 * course whose prereq tree references a language code (LENG/ENGL/RLEC/IDIO)
 * until the student ticks "Requisito de inglés cumplido". The reason surfaces
 * only when such a course is selected (SidePanel "Reglas del plan por cumplir"),
 * not as a permanent legend entry.
 *
 * `gates` (generic GateRule engine — min credits, semester caps, "todo nivel 2
 * antes de nivel 3", …) stays wired but empty until the coordinators define real
 * rules. The earlier `fundamentos-nivel-2` demo gate was removed. */
function cbu3Rules(): CatalogRules {
  return {
    attestations: [
      LANGUAGE_ATTESTATION,
      SECOND_LANGUAGE_ATTESTATION,
      INTERNACIONALIZACION_ATTESTATION,
      SABERPRO_ATTESTATION,
    ],
    gates: [],
  };
}

export const CATALOG_RULES: Record<string, CatalogRules> = {
  "iele-cbu3": cbu3Rules(),
  "iele-cbu3-pc": cbu3Rules(),
  "ielc-cbu3": cbu3Rules(),
  "ielc-cbu3-pc": cbu3Rules(),
  "doble-cbu3": cbu3Rules(),
};

export function rulesForSlug(slug: string): CatalogRules {
  return CATALOG_RULES[slug] ?? { gates: [], attestations: [] };
}
