// Parser for the coordinator template `plantillas/PLANES.xlsx` (see
// scripts/exportTemplates.ts). Flat: one row = one course/slot, `Semestre` is an
// explicit column. Different from parsePensumWorkbook.ts, which reads the legacy
// wide grid.
//
// Sheets:
//   "IELE CBU3" … "DOBLE CBU3"  -> plan rows
//   "_CATALOGOS"                -> catalog identity + target term + status
//   "_REQUISITOS_GRADO"         -> attestations + gates (Catalog.rules)
//   "_NODOS_REQUISITO"          -> RequirementNode rows
//   "_INSTRUCCIONES"            -> ignored

import * as XLSX from "xlsx";
import type { CourseType } from "../types";
import type { CourseCategory } from "../courseCategory";
import { normalizeCode } from "./normalizeCode";
import { classifyCourse, type PlaceholderKind } from "./classifyPlaceholder";
import { isPlanesMatrix, parsePlanesMatrix } from "./official/planesMatrix";

export interface ParsedPlanCourse {
  rowNum: number; // 1-based sheet row, for error messages
  semester: number | null;
  displayCode: string;
  normalizedCode: string;
  name: string;
  credits: number | null;
  courseType: CourseType;
  /** map group from the official file's TIPO (lib/courseCategory.ts); absent in
   * the coordinator template, null when TIPO is blank or unknown */
  category?: CourseCategory | null;
  isPlaceholder: boolean;
  placeholderKind?: PlaceholderKind;
  placeholderLabel?: string;
  prereqText: string;
  /** Registro corequisite text ("IELE-1002L"); only the official matrix file has it */
  coreqText?: string;
  notes: string;
}

export interface ParsedCatalogMeta {
  slug: string;
  programName: string;
  variantLabel: string;
  term: string;
  status: string;
  accentColor: string | null;
  tagline: string | null;
}

export interface ParsedGradRequirement {
  id: string;
  label: string;
  description: string;
  type: "atestación" | "gate" | string;
  rule: string; // free text / JSON for gates
}

export interface ParsedRequirementNode {
  key: string;
  label: string;
  semester: number | null;
  attestationId: string | null;
  autoLinkRegex: string | null;
  linkedCourseCodes: string[];
  infoUrl: string | null;
  description: string | null;
}

export interface ParsedPlanesWorkbook {
  /** "matrix" = the department's official PLANES_<term>.xlsx (one column per
   * plan); absent = the coordinator template. The matrix carries no graduation
   * rules / requirement nodes, so those are left as they are. */
  format?: "matrix" | "template";
  catalogs: ParsedCatalogMeta[];
  courses: Record<string, ParsedPlanCourse[]>; // slug -> rows
  gradRequirements: ParsedGradRequirement[];
  requirementNodes: ParsedRequirementNode[];
  warnings: string[];
}

const SHEET_TO_SLUG: Record<string, string> = {
  "IELE CBU3": "iele-cbu3",
  "IELE CBU3 PC": "iele-cbu3-pc",
  "IELC CBU3": "ielc-cbu3",
  "IELC CBU3 PC": "ielc-cbu3-pc",
  "DOBLE CBU3": "doble-cbu3",
};

const norm = (s: unknown) => String(s ?? "").trim();
const foldKey = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

function rows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
}

function num(v: unknown): number | null {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const TYPE_FROM_LABEL: Record<string, CourseType> = {
  "núcleo": "nucleo",
  nucleo: "nucleo",
  electiva: "electiva",
  cbu: "cbu",
  "libre elección": "complementaria",
  "libre eleccion": "complementaria",
  proyecto: "proyecto",
};

function parsePlanSheet(
  ws: XLSX.WorkSheet,
  warnings: string[],
  sheetName: string
): ParsedPlanCourse[] {
  const out: ParsedPlanCourse[] = [];
  const data = rows(ws);
  data.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const code = norm(row["Código"] ?? row["Codigo"]);
    const name = norm(row["Nombre"]);
    // skip blank rows and the informational "Total Semestre N" rows (no code)
    if (!code) return;
    if (/^total/i.test(name)) return;

    const semRaw = norm(row["Semestre"]);
    const semester = semRaw ? num(semRaw) : null;
    if (semester == null) {
      warnings.push(`${sheetName} fila ${rowNum}: "${code}" sin Semestre.`);
    }

    const cls = classifyCourse(code, name);
    const typeLabel = norm(row["Tipo"]).toLowerCase();
    const courseType =
      TYPE_FROM_LABEL[typeLabel] ?? cls.courseType;

    out.push({
      rowNum,
      semester,
      displayCode: code,
      normalizedCode: normalizeCode(code),
      name: name || cls.placeholderLabel || code,
      credits: num(row["Créditos"] ?? row["Creditos"]),
      courseType,
      isPlaceholder: cls.isPlaceholder,
      placeholderKind: cls.placeholderKind,
      placeholderLabel: cls.isPlaceholder ? name || cls.placeholderLabel : undefined,
      prereqText: norm(
        row["Prerrequisito (respaldo, opcional)"] ??
          row["Prerrequisito"] ??
          row["Prerreq. (opcional)"]
      ),
      notes: norm(row["Notas del coordinador"] ?? row["Notas"]),
    });
  });
  return out;
}

function parseCatalogos(ws: XLSX.WorkSheet): ParsedCatalogMeta[] {
  return rows(ws)
    .map((r) => ({
      slug: norm(r["Slug"]),
      programName: norm(r["Programa"]),
      variantLabel: norm(r["Variante"]),
      term: norm(r["Término objetivo"] ?? r["Termino objetivo"] ?? r["Término"]),
      status: norm(r["Estado"]) || "published",
      accentColor: norm(r["Color"]) || null,
      tagline: norm(r["Tagline"]) || null,
    }))
    .filter((c) => c.slug);
}

function parseGradRequirements(ws: XLSX.WorkSheet): ParsedGradRequirement[] {
  return rows(ws)
    .map((r) => ({
      id: norm(r["ID"]),
      label: norm(r["Etiqueta"]),
      description: norm(r["Descripción"] ?? r["Descripcion"]),
      type: (norm(r["Tipo"]) || "atestación") as ParsedGradRequirement["type"],
      rule: norm(r["Regla (solo gates)"] ?? r["Regla"]),
    }))
    .filter((r) => r.id);
}

function parseRequirementNodes(ws: XLSX.WorkSheet): ParsedRequirementNode[] {
  return rows(ws)
    .map((r) => ({
      key: norm(r["Key"]),
      label: norm(r["Etiqueta"]),
      semester: num(r["Semestre"]),
      attestationId: norm(r["Atestación asociada"] ?? r["Atestacion asociada"]) || null,
      autoLinkRegex: norm(r["Auto-enlace (regex)"]) || null,
      linkedCourseCodes: norm(r["Cursos que lo exigen"])
        .split(/[,\n;]+/)
        .map((s) => normalizeCode(s))
        .filter(Boolean),
      infoUrl: norm(r["URL info"]) || null,
      description: norm(r["Descripción"] ?? r["Descripcion"]) || null,
    }))
    .filter((n) => n.key);
}

export function parsePlanesWorkbook(
  buffer: Buffer | ArrayBuffer
): ParsedPlanesWorkbook {
  const wb = XLSX.read(buffer, {
    type: buffer instanceof Buffer ? "buffer" : "array",
  });
  // the department's official file (one column per plan) — lib/import/official
  if (isPlanesMatrix(wb)) return parsePlanesMatrix(wb);
  const warnings: string[] = [];
  const courses: Record<string, ParsedPlanCourse[]> = {};
  let catalogs: ParsedCatalogMeta[] = [];
  let gradRequirements: ParsedGradRequirement[] = [];
  let requirementNodes: ParsedRequirementNode[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const key = foldKey(name);
    if (key === "_INSTRUCCIONES") continue;
    if (key === "_CATALOGOS") {
      catalogs = parseCatalogos(ws);
      continue;
    }
    if (key === "_REQUISITOS_GRADO") {
      gradRequirements = parseGradRequirements(ws);
      continue;
    }
    if (key === "_NODOS_REQUISITO") {
      requirementNodes = parseRequirementNodes(ws);
      continue;
    }
    if (key.startsWith("_")) continue;

    const slug =
      SHEET_TO_SLUG[key] ??
      catalogs.find((c) => foldKey(c.slug.replace(/-/g, " ")) === key)?.slug;
    if (!slug) {
      warnings.push(`Hoja "${name}" no reconocida — se ignora.`);
      continue;
    }
    courses[slug] = parsePlanSheet(ws, warnings, name);
  }

  if (catalogs.length === 0) {
    warnings.push("La hoja _CATALOGOS está vacía o falta.");
  }
  for (const slug of Object.keys(courses)) {
    if (!catalogs.some((c) => c.slug === slug)) {
      warnings.push(`El plan "${slug}" no aparece en _CATALOGOS.`);
    }
  }

  return { catalogs, courses, gradRequirements, requirementNodes, warnings };
}
