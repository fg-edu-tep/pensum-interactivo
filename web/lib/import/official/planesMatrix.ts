// The department's official PLANES file (from 2026-11, e.g. datos/PLANES_202710.xlsx).
// One row per course, the Registro columns (Periodo … Restricción de atributos
// alumno) followed by one column per plan whose cell is the SEMESTER the course
// sits in for that plan (blank = not in that plan), then TIPO:
//
//   Periodo | … | Materia | Créditos | Nombre curso | Código prerrequisito | … |
//   PLAN IELE PC | PLAN IELE CD | PLAN IELC PC | PLAN IELC CD | PLAN IELE IELC |
//   PLAN MIELE | PLAN MIELC | TIPO
//
// "PC" = the plan that starts with Precálculo, "CD" = starts with Cálculo
// Diferencial. Slot rows use pseudo-codes: CBU1…CBU5, IXXX (EFI), ELEC
// (elective credits, split into 2-credit boxes), CINTEG, CLE, IELE-4XXX /
// YYYY-4XXX (master's slots). 0-credit companions (LAB …, TRAB. ASIST …, codes
// ending in L/T/P) are not map nodes: they are the parent's corequisite.
//
// Produces the same ParsedPlanesWorkbook the coordinator template produces, so
// the admin diff/apply flow (diffPlanes / applyPlanes) is shared. Pure.

import * as XLSX from "xlsx";
import type { CourseType } from "../../types";
import { normalizeCode } from "../normalizeCode";
import { foldAccents } from "../textMatch";
import { CATEGORY_LABEL, GENERIC_CATEGORIES, courseTypeOfCategory, parseCategory, type CourseCategory } from "../../courseCategory";
import type { PlaceholderKind } from "../classifyPlaceholder";
import type { ParsedCatalogMeta, ParsedPlanCourse, ParsedPlanesWorkbook } from "../parsePlanesWorkbook";

export interface PlanColumn {
  header: string;
  slug: string;
  programCode: "IELE" | "IELC" | "DOBLE" | "MIELE" | "MIELC";
  programName: string;
  variantLabel: string;
  status: "published" | "draft";
}

/** "PLAN IELE PC" → catalog. Master's plans load as drafts (not shown to students). */
export const PLAN_COLUMNS: Record<string, Omit<PlanColumn, "header">> = {
  "PLAN IELE PC": { slug: "iele-cbu3-pc", programCode: "IELE", programName: "Ingeniería Eléctrica", variantLabel: "con Precálculo", status: "published" },
  "PLAN IELE CD": { slug: "iele-cbu3", programCode: "IELE", programName: "Ingeniería Eléctrica", variantLabel: "", status: "published" },
  "PLAN IELC PC": { slug: "ielc-cbu3-pc", programCode: "IELC", programName: "Ingeniería Electrónica", variantLabel: "con Precálculo", status: "published" },
  "PLAN IELC CD": { slug: "ielc-cbu3", programCode: "IELC", programName: "Ingeniería Electrónica", variantLabel: "", status: "published" },
  "PLAN IELE IELC": { slug: "doble-cbu3", programCode: "DOBLE", programName: "Doble programa Ing. Eléctrica y Electrónica", variantLabel: "Doble programa", status: "published" },
  "PLAN MIELE": { slug: "miele", programCode: "MIELE", programName: "Maestría en Ingeniería Eléctrica", variantLabel: "Maestría", status: "draft" },
  "PLAN MIELC": { slug: "mielc", programCode: "MIELC", programName: "Maestría en Ingeniería Electrónica y de Computadores", variantLabel: "Maestría", status: "draft" },
};

const TIPO: Record<string, CourseType> = {
  OBLIGATORIO: "nucleo",
  OBLIGATORIA: "nucleo",
  PROYECTO: "proyecto",
  CBU: "cbu",
  ELECTIVA: "electiva",
};

/** Registro "-" and blanks are "nothing"; Registro pads with spaces. */
export function cell(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s === "-" ? "" : s;
}

/** "IELE-1002" → "IELE 1002"; slot pseudo-codes stay as they are. */
export function displayCodeOf(code: string): string {
  const m = /^([A-Z]{3,4})-?(\d{4}[A-Z]?)$/.exec(code.trim().toUpperCase());
  return m ? `${m[1]} ${m[2]}` : code.trim().toUpperCase();
}

/** 0-credit lab / complementaria / asistencia rows: the parent's corequisite, not a map node. */
export function isCompanion(code: string, name: string, credits: number | null): boolean {
  if ((credits ?? 0) !== 0) return false;
  if (/^[A-Z]{4}-?\d{4}[LTPC]$/.test(code.trim().toUpperCase())) return true;
  return /^(LAB|LABORATOR|TRAB|COMPL)/.test(foldAccents(name).toUpperCase());
}

interface SlotSpec {
  kind: PlaceholderKind;
  displayCode: string;
  name: string;
  courseType: CourseType;
  /** split into boxes of this many credits (ELEC: 2-credit half-box pairs) */
  boxCredits?: number;
}

/** Slot pseudo-codes of the file. null = a real course. */
export function slotSpec(code: string, name: string): SlotSpec | null {
  const c = normalizeCode(code);
  const n = foldAccents(name).toUpperCase();
  if (/^CBU\d*$/.test(c)) return { kind: "CBU", displayCode: "CBU", name: "CICLO BÁSICO UNIANDINO", courseType: "cbu" };
  if (c === "IXXX" || c === "EFI") return { kind: "EFI", displayCode: "EFI", name: "ELECTIVA EN FUNDAMENTOS DE INGENIERÍA", courseType: "electiva" };
  if (c === "ELEC") return { kind: "ELECTIVA", displayCode: "IELE ELECTIVA", name: "ELECTIVA IELE", courseType: "electiva", boxCredits: 2 };
  if (c === "CINTEG" || c === "CI") return { kind: "CI", displayCode: "IELE CI", name: "CURSO INTEGRADOR", courseType: "electiva" };
  if (c === "CLE") return { kind: "CLE", displayCode: "CLE", name: "CURSO DE LIBRE ELECCIÓN", courseType: "complementaria" };
  if (/X{3}$/.test(c) || /^[A-Z]{4}4XXX$/.test(c)) {
    if (n.includes("LIBRE")) return { kind: "CLE", displayCode: displayCodeOf(code), name: name.trim(), courseType: "complementaria" };
    return { kind: "ELECTIVA", displayCode: displayCodeOf(code), name: name.trim(), courseType: "electiva" };
  }
  return null;
}

export interface MatrixRow {
  rowNum: number;
  code: string; // as written, e.g. "IELE-1002"
  normalizedCode: string;
  name: string;
  credits: number | null;
  prereqText: string;
  coreqText: string;
  restrictions: { periodo: string; programa: string; nivel: string };
  tipo: string;
  /** slug → semester */
  semesters: Record<string, number>;
  period: string;
}

export interface ParsedPlanesMatrix extends ParsedPlanesWorkbook {
  format: "matrix";
  /** Periodo column (the term these requisites are for), e.g. "202710" */
  period: string | null;
  plans: PlanColumn[];
  rows: MatrixRow[];
  /** companion rows folded into their parent: parent code → companion codes */
  companions: Record<string, string[]>;
}

const num = (v: unknown): number | null => {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** True when the first sheet's header has "PLAN …" semester columns. */
export function isPlanesMatrix(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return false;
  const head = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" })[0] ?? []) as unknown[];
  return head.some((h) => /^PLAN\s+\S/.test(cell(h).toUpperCase())) && head.some((h) => cell(h) === "Materia");
}

export function parsePlanesMatrix(buffer: Buffer | ArrayBuffer | XLSX.WorkBook): ParsedPlanesMatrix {
  const wb = "SheetNames" in (buffer as XLSX.WorkBook)
    ? (buffer as XLSX.WorkBook)
    : XLSX.read(buffer as Buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const warnings: string[] = [];
  const header = ((grid[0] ?? []) as unknown[]).map((h) => cell(h));
  const col = (name: string) => header.findIndex((h) => foldAccents(h).toUpperCase() === foldAccents(name).toUpperCase());
  const iPer = col("Periodo");
  const iMat = col("Materia");
  const iCred = col("Créditos");
  const iName = col("Nombre curso");
  const iPre = col("Código prerrequisito");
  const iCo = col("Código correquisito");
  const iRPer = col("Restricción de periodo");
  const iRProg = col("Restricción de programa");
  const iRNiv = col("Restricción de nivel");
  const iTipo = col("TIPO");
  if (iMat < 0) throw new Error('PLANES: falta la columna "Materia".');

  const plans: (PlanColumn & { index: number })[] = [];
  header.forEach((h, index) => {
    const key = h.toUpperCase().replace(/\s+/g, " ");
    if (!/^PLAN\s/.test(key)) return;
    const known = PLAN_COLUMNS[key];
    if (known) plans.push({ header: h, index, ...known });
    else warnings.push(`Columna "${h}" no reconocida como plan — se ignora. Planes conocidos: ${Object.keys(PLAN_COLUMNS).join(", ")}.`);
  });
  if (plans.length === 0) throw new Error('PLANES: no hay columnas "PLAN …".');

  const rows: MatrixRow[] = [];
  let period: string | null = null;
  for (let r = 1; r < grid.length; r++) {
    const g = grid[r] as unknown[];
    const code = cell(g[iMat]);
    if (!code) continue;
    const semesters: Record<string, number> = {};
    for (const p of plans) {
      const raw = cell(g[p.index]);
      if (!raw) continue;
      const s = num(raw);
      if (s == null || s < 1 || s > 12 || !Number.isInteger(s)) {
        warnings.push(`Fila ${r + 1} (${code}): "${raw}" en ${p.header} no es un semestre (1–12) — se ignora.`);
        continue;
      }
      semesters[p.slug] = s;
    }
    const per = iPer >= 0 ? cell(g[iPer]) : "";
    if (/^\d{6}$/.test(per)) period ??= per;
    rows.push({
      rowNum: r + 1,
      code,
      normalizedCode: normalizeCode(code),
      name: iName >= 0 ? cell(g[iName]) : "",
      credits: iCred >= 0 ? num(g[iCred]) : null,
      prereqText: iPre >= 0 ? cell(g[iPre]) : "",
      coreqText: iCo >= 0 ? cell(g[iCo]) : "",
      restrictions: {
        periodo: iRPer >= 0 ? cell(g[iRPer]) : "",
        programa: iRProg >= 0 ? cell(g[iRProg]) : "",
        nivel: iRNiv >= 0 ? cell(g[iRNiv]) : "",
      },
      tipo: iTipo >= 0 ? cell(g[iTipo]) : "",
      semesters,
      period: per,
    });
  }

  // companions → parent's coreq (they share the parent's semester in every plan)
  const companions: Record<string, string[]> = {};
  const byCode = new Map(rows.map((x) => [x.normalizedCode, x]));
  for (const x of rows) {
    if (!isCompanion(x.code, x.name, x.credits)) continue;
    const parent =
      [x.coreqText, x.prereqText.replace(/\*/g, "")]
        .map((t) => normalizeCode(t.split(/\s+(?:Y|O)\s+/)[0]))
        .find((c) => c && byCode.has(c) && !isCompanion(byCode.get(c)!.code, byCode.get(c)!.name, byCode.get(c)!.credits)) ??
      x.normalizedCode.replace(/[LTPC]$/, "");
    (companions[parent] ??= []).push(x.normalizedCode);
  }

  const courses: Record<string, ParsedPlanCourse[]> = {};
  for (const p of plans) courses[p.slug] = [];
  const categoriesSeen = new Set<CourseCategory>();
  for (const x of rows) {
    if (isCompanion(x.code, x.name, x.credits)) continue;
    const spec = slotSpec(x.code, x.name);
    // TIPO is the map group: the four generic values or the PDF's categories
    const category = parseCategory(x.tipo);
    const typeFromFile = TIPO[foldAccents(x.tipo).toUpperCase()] ?? (category ? courseTypeOfCategory(category) : undefined);
    if (x.tipo && !category) warnings.push(`Fila ${x.rowNum} (${x.code}): TIPO "${x.tipo}" desconocido — se usa el tipo por defecto.`);
    if (category) categoriesSeen.add(category);
    for (const p of plans) {
      const semester = x.semesters[p.slug];
      if (semester == null) continue;
      if (spec) {
        const total = x.credits ?? 0;
        const parts: number[] = [];
        if (spec.boxCredits && total > spec.boxCredits) {
          let left = total;
          while (left > 0) {
            parts.push(Math.min(spec.boxCredits, left));
            left -= spec.boxCredits;
          }
        } else parts.push(total);
        for (const credits of parts) {
          courses[p.slug].push({
            rowNum: x.rowNum,
            semester,
            displayCode: spec.displayCode,
            normalizedCode: normalizeCode(spec.displayCode),
            name: spec.name,
            credits,
            courseType: spec.kind === "CLE" ? "complementaria" : spec.courseType,
            category,
            isPlaceholder: true,
            placeholderKind: spec.kind,
            placeholderLabel: spec.name,
            prereqText: "",
            coreqText: "",
            notes: "",
          });
        }
        continue;
      }
      if (x.credits == null) warnings.push(`Fila ${x.rowNum} (${x.code}): sin créditos.`);
      courses[p.slug].push({
        rowNum: x.rowNum,
        semester,
        displayCode: displayCodeOf(x.code),
        normalizedCode: x.normalizedCode,
        name: x.name || x.code,
        credits: x.credits,
        courseType: typeFromFile ?? (/PROYECTO/i.test(x.name) ? "proyecto" : "nucleo"),
        category,
        isPlaceholder: false,
        prereqText: x.prereqText,
        coreqText: x.coreqText,
        notes: "",
      });
    }
  }
  // the generic Obligatorio shares the PDF teal family: mixing it with the PDF
  // categories makes the map ambiguous
  const cats = [...categoriesSeen];
  if (cats.some((c) => c === "obligatorio") && cats.some((c) => !GENERIC_CATEGORIES.has(c)))
    warnings.push(
      `TIPO mezcla "Obligatorio" con categorías del PDF (${cats.filter((c) => !GENERIC_CATEGORIES.has(c)).map((c) => CATEGORY_LABEL[c]).join(", ")}): usa una sola nomenclatura para que los colores del mapa se distingan.`
    );

  // stable order: semester, then file row order (already)
  for (const slug of Object.keys(courses)) courses[slug].sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0) || a.rowNum - b.rowNum);

  // one code twice in the same plan is a data error worth flagging
  for (const p of plans) {
    const seen = new Map<string, number>();
    for (const c of courses[p.slug]) {
      if (c.isPlaceholder) continue;
      if (seen.has(c.normalizedCode)) warnings.push(`${p.header}: ${c.displayCode} aparece dos veces (filas ${seen.get(c.normalizedCode)} y ${c.rowNum}).`);
      seen.set(c.normalizedCode, c.rowNum);
    }
  }

  const catalogs: ParsedCatalogMeta[] = plans.map((p) => ({
    slug: p.slug,
    programName: p.programName,
    variantLabel: p.variantLabel,
    term: period ?? "",
    status: p.status,
    accentColor: null,
    tagline: null,
  }));

  return {
    format: "matrix",
    period,
    plans: plans.map(({ index: _i, ...p }) => p),
    rows,
    companions,
    catalogs,
    courses,
    gradRequirements: [],
    requirementNodes: [],
    warnings,
  };
}
