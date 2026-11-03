// Generalizes app/scripts/build-data.mjs's grid state-machine from one hardcoded
// sheet to all 5 recommended-pensum sheets in
//   "PENSUMS PREGRADO (DOCUMENTO BASE)) CBU3.xlsx"
//
// Each sheet -> one ParsedCatalog. Layout per sheet:
//   row 0 : program name in col 1
//   a "SEM 1 / SEM2 / ..." header row places the semester columns
//   a "Primer/Segundo/... Semestre" row precedes each semester block
//   course rows: col1 = code, col2 = name, col3 = credits, and the credit value
//                is repeated in that course's SEM<n> column
//   "Total Credit Hours:" rows are interleaved

import * as XLSX from "xlsx";
import type { CourseType } from "../types";
import { normalizeCode } from "./normalizeCode";
import { classifyCourse, type PlaceholderKind } from "./classifyPlaceholder";

export interface ParsedCourse {
  displayCode: string;
  normalizedCode: string;
  name: string;
  credits: number;
  semester: number;
  courseType: CourseType;
  /** map group (lib/courseCategory.ts), when the source file has one */
  category?: string | null;
  isPlaceholder: boolean;
  placeholderKind?: PlaceholderKind;
  placeholderLabel?: string;
  sortIndex: number;
}

export interface ParsedCatalog {
  slug: string;
  programCode: string;
  programName: string;
  variantLabel: string;
  sheetName: string;
  courses: ParsedCourse[];
  warnings: string[];
}

interface SheetMeta {
  slug: string;
  programCode: string;
  programName: string;
  variantLabel: string;
}

// Exact sheet names are stable in the source file.
const SHEET_META: Record<string, SheetMeta> = {
  "PLAN PENSUM IELE CBU3": {
    slug: "iele-cbu3",
    programCode: "IELE",
    programName: "Ingeniería Eléctrica",
    variantLabel: "",
  },
  "PLAN PENSUM IELE CBU3 PC": {
    slug: "iele-cbu3-pc",
    programCode: "IELE",
    programName: "Ingeniería Eléctrica",
    variantLabel: "con Precálculo",
  },
  "PLAN PENSUM IELC CBU3": {
    slug: "ielc-cbu3",
    programCode: "IELC",
    programName: "Ingeniería Electrónica",
    variantLabel: "",
  },
  "PLAN PENSUM IELC CBU3 PC": {
    slug: "ielc-cbu3-pc",
    programCode: "IELC",
    programName: "Ingeniería Electrónica",
    variantLabel: "con Precálculo",
  },
  "PLAN PENSUM DOBLE  CBU3": {
    slug: "doble-cbu3",
    programCode: "DOBLE",
    programName: "Doble programa Ing. Eléctrica y Electrónica",
    variantLabel: "Doble programa",
  },
};

const SEMESTER_HEADER_RE =
  /^(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|UND[ÉE]CIMO|DUOD[ÉE]CIMO|(D[ÉE]CIMO\s+(PRIMER|SEGUNDO))|ONCEAVO|DOCEAVO)\s+SEMESTRE$/i;

const NUM = (v: unknown): number =>
  Number.parseFloat(String(v ?? "").replace(",", ".").trim());

function metaForSheet(sheetName: string, firstRowText: string): SheetMeta {
  const exact = SHEET_META[sheetName];
  if (exact) return exact;
  // fallback: derive from tokens in the sheet name + row 0
  const up = sheetName.toUpperCase();
  const pc = up.includes("DOBLE")
    ? "DOBLE"
    : up.includes("IELC")
      ? "IELC"
      : "IELE";
  const programName =
    firstRowText.trim() ||
    (pc === "DOBLE"
      ? "Doble programa"
      : pc === "IELC"
        ? "Ingeniería Electrónica"
        : "Ingeniería Eléctrica");
  const variantLabel = /\bPC\b/.test(up) ? "con Precálculo" : pc === "DOBLE" ? "Doble programa" : "";
  const slug =
    sheetName
      .toLowerCase()
      .replace(/plan pensum /g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || pc.toLowerCase();
  return { slug, programCode: pc, programName, variantLabel };
}

/** colIndex -> semester number, read from the "SEM <n>" header row. */
function detectSemesterColumns(rows: unknown[][]): Map<number, number> {
  const map = new Map<number, number>();
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const m = /^SEM\s?0?(\d{1,2})$/i.exec(String(row[c] ?? "").trim());
      if (m) map.set(c, Number(m[1]));
    }
    if (map.size > 0) break; // header row found
  }
  return map;
}

export function parsePensumWorkbook(buffer: Buffer | ArrayBuffer): ParsedCatalog[] {
  const wb = XLSX.read(buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });
  const out: ParsedCatalog[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (rows.length === 0) continue;

    const firstRowText = String((rows[0] ?? [])[1] ?? "");
    const meta = metaForSheet(sheetName, firstRowText);
    const semCols = detectSemesterColumns(rows);
    const warnings: string[] = [];
    const courses: ParsedCourse[] = [];
    let currentSemester = 0;
    let sortIndex = 0;

    for (const row of rows) {
      const col1 = String(row[1] ?? "").trim();
      const col2 = String(row[2] ?? "").trim();
      const col3 = String(row[3] ?? "").trim();

      if (!col1 && !col2) continue;
      if (SEMESTER_HEADER_RE.test(col1)) {
        currentSemester += 1;
        continue;
      }
      if (!col1) continue;
      if (col2.toUpperCase().startsWith("TOTAL CREDIT HOURS")) continue;
      if (col1.toUpperCase() === "TOTAL") continue;

      const credits = NUM(col3);
      if (!Number.isFinite(credits)) continue; // not a course row

      // The "Primer/Segundo/... Semestre" section headers are authoritative for
      // every sheet. The SEM<n> grid columns agree with them in the base plans
      // but lag by one in the "con Precálculo" variants (the column markers were
      // never re-shifted when precálculo was inserted), so we only fall back to
      // the columns when no section header has been seen yet.
      let colSemester: number | null = null;
      for (const [colIdx, semNum] of semCols) {
        const v = NUM(row[colIdx]);
        if (Number.isFinite(v) && v !== 0) {
          colSemester = semNum;
          break;
        }
      }
      const semester = currentSemester || colSemester || 1;
      if (colSemester != null && currentSemester && colSemester !== currentSemester) {
        warnings.push(
          `${col1} "${col2}": la columna SEM${colSemester} no coincide con el encabezado "semestre ${currentSemester}" (se usa el encabezado)`
        );
      }

      const cls = classifyCourse(col1, col2);
      courses.push({
        displayCode: col1,
        normalizedCode: normalizeCode(col1),
        name: col2,
        credits,
        semester,
        courseType: cls.courseType,
        isPlaceholder: cls.isPlaceholder,
        placeholderKind: cls.placeholderKind,
        placeholderLabel: cls.placeholderLabel,
        sortIndex: sortIndex++,
      });
    }

    if (courses.length === 0) {
      warnings.push(`Hoja "${sheetName}" no produjo ningún curso (¿layout inesperado?)`);
    }

    out.push({
      slug: meta.slug,
      programCode: meta.programCode,
      programName: meta.programName,
      variantLabel: meta.variantLabel,
      sheetName,
      courses,
      warnings,
    });
  }

  return out;
}
