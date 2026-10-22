// Parses the "BOLSA DE ELECTIVAS" spreadsheets in Custom_Pensum/electivas/.
//
// These sheets carry NO course codes — only long course names plus, per program
// (Eléctrica / Electrónica) and per pensum era (DESDE 2024-I / HASTA 2023-II), a
// role word: OBLIGATORIA | ELECTIVA | AREA MAYOR | C. INTEGRADOR | ... | blank.
// A blank cell means "not valid for that program in that era".
//
// Sheets handled (by fuzzy name):
//   "ELECTIVAS IEE"      full grid, PREGRADO + MAESTRIA sections, 4 role columns
//   "MATERIAS MAESTRIA"  name + "Ciclo"; adds ciclo metadata, level = maestria
//   "202620"             curated subset offered that term, same 4 role columns
//   "MAESTRIA 202620"    curated maestria subset offered that term, name only
//
// Optional columns, found by header text in the full grid and the maestría
// catalogue (like "ES CURSO INTEGRADOR"); a blank cell means "derive it":
//   "CÓDIGO"     the course code (e.g. IELE 3336) — otherwise matched by name
//                against the Registro export at seed time
//   "SE DICTA"   when it is usually taught: 1 / PRIMER SEMESTRE (…-1),
//                2 / SEGUNDO SEMESTRE (…-2), AMBOS, CADA DOS AÑOS —
//                otherwise derived from the Registro period history

import * as XLSX from "xlsx";
import { foldAccents, normalizeName } from "./textMatch";
import { normalizeCode } from "./normalizeCode";

export type RoleNorm =
  | "obligatoria"
  | "electiva"
  | "area_mayor"
  | "curso_integrador"
  | "proy_grado"
  | "cle"
  | "practica"
  | "pasantia"
  | "maestria"
  | null;

/** When an elective is usually taught. */
export type Frequency = "s1" | "s2" | "both" | "biennial";

export function parseFrequency(raw: unknown): Frequency | null {
  const s = foldAccents(String(raw ?? "")).trim().toUpperCase();
  if (!s) return null;
  if (s.includes("DOS ANOS") || s.includes("BIENAL") || s.includes("CADA 2")) return "biennial";
  if (s.includes("AMBOS") || s.includes("TODOS") || s.includes("SIEMPRE") || /1\s*(Y|,|\/)\s*2/.test(s)) return "both";
  if (s.includes("PRIMER") || /(^|[^0-9])-?1([^0-9]|$)/.test(s)) return "s1";
  if (s.includes("SEGUNDO") || /(^|[^0-9])-?2([^0-9]|$)/.test(s)) return "s2";
  return null;
}

export interface RoleCell {
  norm: RoleNorm;
  raw: string;
}

export interface ParsedElective {
  name: string;
  normalizedName: string;
  level: "pregrado" | "maestria" | "other";
  ciclo: string | null;
  roles: {
    eleFrom2024: RoleCell;
    elcFrom2024: RoleCell;
    eleUntil2023: RoleCell;
    elcUntil2023: RoleCell;
  };
  /** "ES CURSO INTEGRADOR" column in the full grid — only a subset qualifies */
  isCursoIntegrador: boolean;
  /** "CÓDIGO" column, normalized ("IELE3336"); null when blank/absent */
  code: string | null;
  /** "SE DICTA" column; null when blank/absent */
  frequency: Frequency | null;
  offeredTerms: string[];
  sourceFiles: string[];
}

export interface ElectivesInput {
  name: string;
  buffer: Buffer | ArrayBuffer;
}

const EMPTY: RoleCell = { norm: null, raw: "" };

function normalizeRole(raw: string): RoleNorm {
  const s = foldAccents(raw).trim();
  if (!s) return null;
  if (s.includes("OBLIGATORIA")) return "obligatoria";
  if (s.includes("AREA MAYOR")) return "area_mayor";
  if (s.includes("INTEGRADOR")) return "curso_integrador";
  if (s.includes("PROY GRADO") || s.includes("PROYECTO DE GRADO")) return "proy_grado";
  if (s.includes("PASANT")) return "pasantia";
  if (s.includes("PRACTICA")) return "practica";
  if (s.includes("CLE")) return "cle";
  if (s.includes("ELECTIVA")) return "electiva";
  return null;
}

function cell(raw: unknown): RoleCell {
  const text = String(raw ?? "").trim();
  const norm = normalizeRole(text);
  return norm || text ? { norm, raw: text } : EMPTY;
}

function levelFromSection(section: string): ParsedElective["level"] {
  const s = foldAccents(section);
  if (s.includes("MAESTRIA")) return "maestria";
  if (s.includes("PREGRADO")) return "pregrado";
  return "other";
}

/** priority for merging conflicting `level` values across sheets */
const LEVEL_RANK: Record<ParsedElective["level"], number> = {
  pregrado: 2,
  maestria: 1,
  other: 0,
};

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
}

function headerRowIndex(grid: unknown[][]): number {
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    const c1 = foldAccents(String(grid[r]?.[1] ?? ""));
    if (c1.includes("NOMBRE LARGO CURSO")) return r;
  }
  return 0;
}

function detectTerm(grid: unknown[][]): string | null {
  const c0 = String(grid[0]?.[0] ?? "").trim();
  return /^\d{6}$/.test(c0) ? c0 : null;
}

/** Column index of the "ES CURSO INTEGRADOR" flag in a full-grid sheet, or -1. */
function integradorColIndex(grid: unknown[][]): number {
  for (let r = 0; r < Math.min(grid.length, 4); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (foldAccents(String(row[c] ?? "")).includes("CURSO INTEGRADOR")) return c;
    }
  }
  return -1;
}

/** Column index of an optional header (accent/case-insensitive), or -1. */
function headerColIndex(grid: unknown[][], test: (folded: string) => boolean): number {
  for (let r = 0; r < Math.min(grid.length, 4); r++) {
    const row = grid[r] ?? [];
    for (let c = 2; c < row.length; c++) {
      if (test(foldAccents(String(row[c] ?? "")).trim().toUpperCase())) return c;
    }
  }
  return -1;
}
const codeCol = (g: unknown[][]) => headerColIndex(g, (h) => h === "CODIGO" || h.startsWith("CODIGO "));
const frequencyCol = (g: unknown[][]) => headerColIndex(g, (h) => h.includes("SE DICTA") || h.includes("FRECUENCIA"));

function codeCell(raw: unknown): string | null {
  const c = normalizeCode(raw);
  return /^[A-Z]{3,5}\d{4}[A-Z]?$/.test(c) ? c : null;
}

/** A flag cell counts as "yes" for 1 / X / SI / VERDADERO / TRUE. */
function truthyFlag(raw: unknown): boolean {
  const s = foldAccents(String(raw ?? "")).trim().toUpperCase();
  return s === "1" || s === "X" || s === "SI" || s === "VERDADERO" || s === "TRUE";
}

/** Full role-grid sheet: "ELECTIVAS IEE" and the term subset "202620". */
function parseGrid(
  grid: unknown[][],
  fileName: string,
  markTerm: string | null,
  out: Map<string, ParsedElective>
) {
  const start = headerRowIndex(grid) + 1;
  const integCol = integradorColIndex(grid);
  const cCol = codeCol(grid);
  const fCol = frequencyCol(grid);
  let section = "PREGRADO";
  for (let r = start; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const c0 = String(row[0] ?? "").trim();
    const name = String(row[1] ?? "").trim();
    if (c0) section = c0;
    if (!name) continue;
    merge(out, {
      name,
      normalizedName: normalizeName(name),
      level: levelFromSection(section),
      ciclo: null,
      roles: {
        eleFrom2024: cell(row[2]),
        elcFrom2024: cell(row[3]),
        eleUntil2023: cell(row[4]),
        elcUntil2023: cell(row[5]),
      },
      isCursoIntegrador: integCol >= 0 && truthyFlag(row[integCol]),
      code: cCol >= 0 ? codeCell(row[cCol]) : null,
      frequency: fCol >= 0 ? parseFrequency(row[fCol]) : null,
      offeredTerms: markTerm ? [markTerm] : [],
      sourceFiles: [fileName],
    });
  }
}

/** "MATERIAS MAESTRIA": name + Ciclo, no role columns. */
function parseMaestriaCatalogue(
  grid: unknown[][],
  fileName: string,
  out: Map<string, ParsedElective>
) {
  const start = headerRowIndex(grid) + 1;
  const cCol = codeCol(grid);
  const fCol = frequencyCol(grid);
  for (let r = start; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = String(row[1] ?? "").trim();
    if (!name) continue;
    const ciclo = String(row[2] ?? "").trim() || null;
    merge(out, {
      name,
      normalizedName: normalizeName(name),
      level: "maestria",
      ciclo,
      roles: {
        eleFrom2024: { norm: "maestria", raw: "Electiva de maestría" },
        elcFrom2024: { norm: "maestria", raw: "Electiva de maestría" },
        eleUntil2023: EMPTY,
        elcUntil2023: EMPTY,
      },
      isCursoIntegrador: false,
      code: cCol >= 0 ? codeCell(row[cCol]) : null,
      frequency: fCol >= 0 ? parseFrequency(row[fCol]) : null,
      offeredTerms: [],
      sourceFiles: [fileName],
    });
  }
}

/** "MAESTRIA 202620": name only, flags the term. */
function parseTermNameOnly(
  grid: unknown[][],
  fileName: string,
  term: string,
  out: Map<string, ParsedElective>
) {
  for (let r = 1; r < grid.length; r++) {
    const name = String(grid[r]?.[1] ?? "").trim();
    if (!name) continue;
    merge(out, {
      name,
      normalizedName: normalizeName(name),
      level: "maestria",
      ciclo: null,
      roles: {
        eleFrom2024: { norm: "maestria", raw: "Electiva de maestría" },
        elcFrom2024: { norm: "maestria", raw: "Electiva de maestría" },
        eleUntil2023: EMPTY,
        elcUntil2023: EMPTY,
      },
      isCursoIntegrador: false,
      code: null,
      frequency: null,
      offeredTerms: [term],
      sourceFiles: [fileName],
    });
  }
}

function mergeRole(a: RoleCell, b: RoleCell): RoleCell {
  if (a.norm) return a; // first non-null wins
  if (b.norm) return b;
  return a.raw ? a : b;
}

function merge(out: Map<string, ParsedElective>, incoming: ParsedElective) {
  const key = incoming.normalizedName;
  const cur = out.get(key);
  if (!cur) {
    out.set(key, incoming);
    return;
  }
  cur.level = LEVEL_RANK[incoming.level] > LEVEL_RANK[cur.level] ? incoming.level : cur.level;
  cur.ciclo = cur.ciclo || incoming.ciclo;
  cur.roles.eleFrom2024 = mergeRole(cur.roles.eleFrom2024, incoming.roles.eleFrom2024);
  cur.roles.elcFrom2024 = mergeRole(cur.roles.elcFrom2024, incoming.roles.elcFrom2024);
  cur.roles.eleUntil2023 = mergeRole(cur.roles.eleUntil2023, incoming.roles.eleUntil2023);
  cur.roles.elcUntil2023 = mergeRole(cur.roles.elcUntil2023, incoming.roles.elcUntil2023);
  cur.isCursoIntegrador = cur.isCursoIntegrador || incoming.isCursoIntegrador;
  cur.code = cur.code || incoming.code;
  cur.frequency = cur.frequency || incoming.frequency;
  cur.offeredTerms = [...new Set([...cur.offeredTerms, ...incoming.offeredTerms])].sort();
  cur.sourceFiles = [...new Set([...cur.sourceFiles, ...incoming.sourceFiles])].sort();
}

export function parseElectivesWorkbook(files: ElectivesInput[]): ParsedElective[] {
  const out = new Map<string, ParsedElective>();

  for (const file of files) {
    const wb = XLSX.read(file.buffer, {
      type: file.buffer instanceof Buffer ? "buffer" : "array",
    });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const grid = rows(ws);
      if (grid.length === 0) continue;
      const upper = foldAccents(sheetName).trim();

      if (upper.includes("MATERIAS MAESTRIA")) {
        parseMaestriaCatalogue(grid, file.name, out);
      } else if (upper.includes("MAESTRIA") && /\d{6}/.test(upper)) {
        const term = (upper.match(/\d{6}/) ?? ["202620"])[0];
        parseTermNameOnly(grid, file.name, term, out);
      } else if (/\d{6}/.test(upper)) {
        const term = detectTerm(grid) ?? (upper.match(/\d{6}/) ?? ["202620"])[0];
        parseGrid(grid, file.name, term, out);
      } else {
        // "ELECTIVAS IEE" or any other full-grid sheet
        parseGrid(grid, file.name, null, out);
      }
    }
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
