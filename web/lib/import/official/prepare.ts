// Official load, step 1 (pure): read the department's three files and derive
// everything the apply step writes, plus a validation report the admin reads
// before applying. Shared by the seed and /administrador/carga.
//
//   PLANES_<term>.xlsx          plan structure (one column per plan)
//   BOLSAS_<term>.xlsx          elective bag: attributes per program + PROXIMO
//   PRERREQUISITOS_<term>.xlsx  Registro requisitos export, several periods
//
// The planning period is declared by the admin (default: the Periodo column of
// PLANES). Requisites come from the export's row for that period, else the
// newest earlier row; "excluye ingresa a N semestre" becomes 15 × N approved
// credits (restrictionCredits.ts); "Se dicta en P" follows offering.ts.

import { parsePrereqExport, type PrereqRow } from "../parsePrereqExport";
import { parseRegistroHistory, type RegistroHistory } from "../electiveHistory";
import { restrictionToCredits } from "../restrictionCredits";
import { parseRequirement, collectCourseCodes } from "../requirementParser";
import { normalizeCode } from "../normalizeCode";
import { parsePlanesMatrix, type ParsedPlanesMatrix } from "./planesMatrix";
import { parseBolsas, type ParsedBolsas, type Projection } from "./bolsas";
import { offeringFor, type OfferingVerdict } from "./offering";
import { levelAllowsPregrado, programAllowList } from "./programRestriction";
import { termFromDate, nextRegularTerm } from "../../term";

export interface CodeData {
  name: string;
  credits: number | null;
  /** period the requisites below were read from (≤ planning period) */
  period: string | null;
  prereqText: string;
  coreqText: string;
  restrictionPeriodo: string;
  restrictionPrograma: string;
  restrictionNivel: string;
  minCredits: number | null;
  minCreditsSemesters: number | null;
  /** newest period ≤ the current one with a row in the export */
  lastOfferedTerm: string | null;
  periods: string[];
  /** by period: the current one and the planning one */
  offering: Record<string, OfferingVerdict>;
  projection: Projection | null;
  projectionRaw: string;
}

export interface OfficialReport {
  planningTerm: string;
  currentTerm: string;
  files: { planes: string; bolsas: string; requisitos: string };
  plans: { slug: string; header: string; status: string; courses: number; slots: number; credits: number; semesters: number }[];
  companions: number;
  restrictions: { code: string; name: string; text: string; minCredits: number; semesters: number }[];
  programOnly: { code: string; name: string; allowList: string }[];
  graduateOnly: { code: string; name: string; level: string }[];
  missingInRequisitos: { code: string; name: string }[];
  unparsed: { code: string; field: "prerrequisito" | "correquisito"; text: string }[];
  bolsas: {
    total: number;
    byAttr: Record<string, number>;
    projection: { term: number; sem: number; nodef: number; none: number };
  };
  offering: Record<string, { offered: number; notOffered: number; unknown: string[] }>;
  requisitosPeriods: string[];
  warnings: string[];
}

export interface OfficialPrepared {
  planningTerm: string;
  currentTerm: string;
  matrix: ParsedPlanesMatrix;
  bolsas: ParsedBolsas;
  codes: Record<string, CodeData>;
  names: Record<string, { name: string; credits: number | null; period: string }>;
  report: OfficialReport;
}

export interface PrepareInput {
  planes: Buffer | ArrayBuffer;
  bolsas: Buffer | ArrayBuffer;
  requisitos: Buffer | ArrayBuffer;
  filenames?: { planes?: string; bolsas?: string; requisitos?: string };
  /** declared by the admin; default = the PLANES Periodo column */
  planningTerm?: string;
  /** default = the calendar's (Bogotá) */
  currentTerm?: string;
}

const TERM_RE = /^\d{4}(10|20)$/;

export function prepareOfficialLoad(input: PrepareInput): OfficialPrepared {
  const matrix = parsePlanesMatrix(input.planes);
  const bolsas = parseBolsas(input.bolsas);
  const history: RegistroHistory = parseRegistroHistory(input.requisitos);
  const warnings: string[] = [...matrix.warnings, ...bolsas.warnings];

  const currentTerm = input.currentTerm && TERM_RE.test(input.currentTerm) ? input.currentTerm : termFromDate();
  const planningTerm =
    (input.planningTerm && TERM_RE.test(input.planningTerm) && input.planningTerm) ||
    (matrix.period && TERM_RE.test(matrix.period) && matrix.period) ||
    nextRegularTerm(currentTerm);
  if (matrix.period && matrix.period !== planningTerm)
    warnings.push(`PLANES dice Periodo ${matrix.period} pero la carga se declara para ${planningTerm}.`);
  if (bolsas.period && bolsas.period !== planningTerm)
    warnings.push(`BOLSAS dice Periodo ${bolsas.period} pero la carga se declara para ${planningTerm}.`);

  const prereqMap: Map<string, PrereqRow> = parsePrereqExport(input.requisitos, planningTerm);
  const covered = new Set<string>();
  for (const rows of history.values()) for (const r of rows) covered.add(r.period);
  const requisitosPeriods = [...covered].sort();
  if (!covered.has(planningTerm))
    warnings.push(`PRERREQUISITOS no tiene filas de ${planningTerm}: la oferta de ese periodo sale solo de la proyección (PROXIMO).`);

  const bolsaByCode = new Map(bolsas.rows.map((r) => [r.normalizedCode, r]));
  const planesByCode = new Map(matrix.rows.map((r) => [r.normalizedCode, r]));
  const realPlanCodes = new Set<string>();
  for (const list of Object.values(matrix.courses)) for (const c of list) if (!c.isPlaceholder) realPlanCodes.add(c.normalizedCode);
  for (const [parent, comps] of Object.entries(matrix.companions)) if (realPlanCodes.has(parent)) comps.forEach((c) => realPlanCodes.add(c));

  const codes: Record<string, CodeData> = {};
  const terms = [...new Set([currentTerm, planningTerm])];
  for (const code of new Set([...realPlanCodes, ...bolsaByCode.keys()])) {
    const rows = history.get(code) ?? [];
    const pr = prereqMap.get(code);
    const pl = planesByCode.get(code);
    const bo = bolsaByCode.get(code);
    // the requisites the department wrote in PLANES / BOLSAS win over the export
    const prereqText = pl?.prereqText || bo?.prereqText || pr?.prereqText || "";
    const coreqText = pl?.coreqText || bo?.coreqText || pr?.coreqText || "";
    const restrictionPeriodo = pl?.restrictions.periodo || bo?.restrictions.periodo || pr?.restrictions.periodo || "";
    const restrictionPrograma = pl?.restrictions.programa || bo?.restrictions.programa || pr?.restrictions.programa || "";
    const restrictionNivel = pl?.restrictions.nivel || bo?.restrictions.nivel || pr?.restrictions.nivel || "";
    const rc = restrictionToCredits(restrictionPeriodo);
    const periods = [...new Set(rows.map((r) => r.period))].sort();
    const projection = bo ? bo.projected : null;
    const offering: Record<string, OfferingVerdict> = {};
    for (const t of terms) offering[t] = offeringFor(periods, covered, t, projection);
    codes[code] = {
      name: pl?.name || bo?.name || pr?.nameEs || rows[0]?.name || code,
      credits: pl?.credits ?? bo?.credits ?? pr?.credits ?? rows[0]?.credits ?? null,
      period: rows.find((r) => r.period <= planningTerm)?.period ?? null,
      prereqText,
      coreqText,
      restrictionPeriodo,
      restrictionPrograma,
      restrictionNivel,
      minCredits: rc?.minCredits ?? null,
      minCreditsSemesters: rc?.semesters ?? null,
      lastOfferedTerm: rows.find((r) => r.period <= currentTerm)?.period ?? null,
      periods,
      offering,
      projection,
      projectionRaw: bo?.projectedRaw ?? "",
    };
  }

  // names of every code the export knows (requirements are shown by name)
  const names: OfficialPrepared["names"] = {};
  for (const [code, rows] of history) {
    const r = rows.find((x) => x.period <= planningTerm) ?? rows[rows.length - 1];
    if (r?.name) names[code] = { name: r.name, credits: r.credits, period: r.period };
  }
  for (const [code, d] of Object.entries(codes)) names[code] ??= { name: d.name, credits: d.credits, period: d.period ?? planningTerm };

  // ---- report ----
  const plans = matrix.plans.map((p) => {
    const list = matrix.courses[p.slug] ?? [];
    return {
      slug: p.slug,
      header: p.header,
      status: p.status,
      courses: list.filter((c) => !c.isPlaceholder).length,
      slots: list.filter((c) => c.isPlaceholder).length,
      credits: list.reduce((s, c) => s + (c.credits ?? 0), 0),
      semesters: list.reduce((m, c) => Math.max(m, c.semester ?? 0), 0),
    };
  });
  const restrictions: OfficialReport["restrictions"] = [];
  const programOnly: OfficialReport["programOnly"] = [];
  const graduateOnly: OfficialReport["graduateOnly"] = [];
  const unparsed: OfficialReport["unparsed"] = [];
  for (const [code, d] of Object.entries(codes).sort(([a], [b]) => a.localeCompare(b))) {
    if (d.minCredits) restrictions.push({ code, name: d.name, text: d.restrictionPeriodo, minCredits: d.minCredits, semesters: d.minCreditsSemesters ?? 0 });
    const allow = programAllowList(d.restrictionPrograma);
    if (allow) programOnly.push({ code, name: d.name, allowList: allow });
    if (d.restrictionNivel && !levelAllowsPregrado(d.restrictionNivel)) graduateOnly.push({ code, name: d.name, level: d.restrictionNivel });
    if (d.prereqText && !parseRequirement(d.prereqText)) unparsed.push({ code, field: "prerrequisito", text: d.prereqText });
    if (d.coreqText && !parseRequirement(d.coreqText.replace(/-/g, " "))) unparsed.push({ code, field: "correquisito", text: d.coreqText });
  }
  const missingInRequisitos = [...realPlanCodes]
    .filter((c) => !history.has(c))
    .sort()
    .map((code) => ({ code, name: codes[code]?.name ?? code }));
  const byAttr: Record<string, number> = {};
  for (const r of bolsas.rows)
    for (const [prog, a] of Object.entries(r.attrs))
      for (const [k, v] of Object.entries(a)) if (v) byAttr[`${prog} ${k}`] = (byAttr[`${prog} ${k}`] ?? 0) + 1;
  const projection = { term: 0, sem: 0, nodef: 0, none: 0 };
  for (const r of bolsas.rows) projection[r.projected.kind] += 1;
  const offering: OfficialReport["offering"] = {};
  for (const t of terms) {
    const o = { offered: 0, notOffered: 0, unknown: [] as string[] };
    for (const [code, d] of Object.entries(codes)) {
      const v = d.offering[t];
      if (v.status === "offered") o.offered += 1;
      else if (v.status === "not_offered") o.notOffered += 1;
      else o.unknown.push(code);
    }
    offering[t] = o;
  }
  // requisites that name codes the export doesn't know: old alternatives
  // (MATE 1212, FISI 1028 …) — informational, one line
  const known = new Set([...history.keys(), ...realPlanCodes]);
  const unknownRefs = new Set<string>();
  for (const d of Object.values(codes))
    for (const ref of collectCourseCodes(parseRequirement(d.prereqText)))
      if (!known.has(ref) && /^[A-Z]{4}\d{4}[A-Z]?$/.test(ref) && !/^(LENG|ENGL|RLEC|RLEN|INLE|IDIO|EXMA|EXDO)/.test(ref)) unknownRefs.add(ref);
  if (unknownRefs.size)
    warnings.push(
      `${unknownRefs.size} código(s) mencionados en prerrequisitos no aparecen en PRERREQUISITOS (alternativas de cursos antiguos; no bloquean a nadie): ${[...unknownRefs].sort().join(", ")}.`
    );

  return {
    planningTerm,
    currentTerm,
    matrix,
    bolsas,
    codes,
    names,
    report: {
      planningTerm,
      currentTerm,
      files: {
        planes: input.filenames?.planes ?? "PLANES.xlsx",
        bolsas: input.filenames?.bolsas ?? "BOLSAS.xlsx",
        requisitos: input.filenames?.requisitos ?? "PRERREQUISITOS.xlsx",
      },
      plans,
      companions: Object.values(matrix.companions).reduce((s, l) => s + l.length, 0),
      restrictions,
      programOnly,
      graduateOnly,
      missingInRequisitos,
      unparsed,
      bolsas: { total: bolsas.rows.length, byAttr, projection },
      offering,
      requisitosPeriods,
      warnings: [...new Set(warnings)],
    },
  };
}

/** Codes a requirement text names (for name lookups). */
export function referencedCodes(text: string): string[] {
  return [...collectCourseCodes(parseRequirement(text))].map((c) => normalizeCode(c));
}
