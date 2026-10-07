// Reads Excel_Registro.xlsx (sheet "Export") into clean RegistroRow[].
//
// Deliberately NOT a copy of lib/import/parsePrereqExport.ts: that one reduces to
// a single term for the seed. The wizard needs every row first (the term window
// is computed from the data), so parsing and reducing are separate steps.
//
// Known landmines handled here (all seen on the real file):
//  - a trailing footer row "Filtros aplicados: …" sits in the Periodo column
//  - cells may hold " " / "-" for empty
//  - header text is matched accent/case-insensitively and by name, never by index
//  - some readers return ragged rows (trailing empty cells omitted)

import * as XLSX from "xlsx";
import { normalizeCode } from "../import/normalizeCode";
import { foldAccents } from "../import/textMatch";
import type { ParseStats, RegistroRow } from "./types";

const REQUIRED = ["Periodo", "Materia", "Nombre curso", "Departamento"] as const;

const COLS = {
  periodo: "Periodo",
  nivel: "Nivel",
  facultad: "Facultad",
  departamento: "Departamento",
  estado: "Estado",
  materia: "Materia",
  creditos: "Créditos",
  nombre: "Nombre curso",
  pre: "Código prerrequisito",
  co: "Código correquisito",
} as const;

const RESTRICTION_COLS: Record<string, string> = {
  periodo: "Restricción de periodo",
  programa: "Restricción de programa",
  nivel: "Restricción de nivel",
  grado: "Restricción de grado",
  departamento: "Restricción de departamento",
  facultad: "Restricción de facultad",
  campo: "Restricción de campo de estudios",
  atributosAlumno: "Restricción de atributos alumno",
};

export class RegistroFormatError extends Error {}

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "-" ? "" : s;
}

const key = (s: string) => foldAccents(s).replace(/\s+/g, " ").trim();

export function parseRegistroWorkbook(buffer: Buffer | ArrayBuffer): {
  rows: RegistroRow[];
  stats: ParseStats;
} {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });
  } catch (e) {
    throw new RegistroFormatError("No se pudo leer el archivo como .xlsx: " + (e as Error).message);
  }
  const ws = wb.Sheets["Export"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new RegistroFormatError("El libro no tiene hojas.");

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  if (data.length < 2) throw new RegistroFormatError("La hoja no tiene filas de datos.");

  const header = (data[0] as unknown[]).map((h) => key(String(h ?? "")));
  const idx = (name: string) => header.indexOf(key(name));

  const missing = REQUIRED.filter((n) => idx(n) < 0);
  if (missing.length) {
    throw new RegistroFormatError(
      `Faltan columnas obligatorias: ${missing.join(", ")}. ¿Es el export de Registro (hoja "Export")?`
    );
  }

  const i = {
    periodo: idx(COLS.periodo),
    nivel: idx(COLS.nivel),
    facultad: idx(COLS.facultad),
    departamento: idx(COLS.departamento),
    estado: idx(COLS.estado),
    materia: idx(COLS.materia),
    creditos: idx(COLS.creditos),
    nombre: idx(COLS.nombre),
    pre: idx(COLS.pre),
    co: idx(COLS.co),
  };
  const restrIdx = Object.entries(RESTRICTION_COLS)
    .map(([k, col]) => [k, idx(col)] as const)
    .filter(([, n]) => n >= 0);

  const at = (row: unknown[], n: number) => (n >= 0 ? clean(row[n]) : "");

  const stats: ParseStats = { totalRows: 0, keptRows: 0, droppedBadPeriod: 0, droppedNoCode: 0 };
  const rows: RegistroRow[] = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r] as unknown[];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    stats.totalRows++;

    const period = at(row, i.periodo);
    if (!/^\d{6}$/.test(period)) {
      stats.droppedBadPeriod++;
      continue;
    }
    const rawMateria = at(row, i.materia);
    const code = normalizeCode(rawMateria);
    if (!code) {
      stats.droppedNoCode++;
      continue;
    }

    const creditsRaw = i.creditos >= 0 ? Number.parseFloat(at(row, i.creditos).replace(",", ".")) : NaN;
    const restrictions: Record<string, string> = {};
    for (const [k, n] of restrIdx) {
      const v = at(row, n);
      if (v) restrictions[k] = v;
    }

    rows.push({
      period,
      nivel: at(row, i.nivel).toUpperCase(),
      facultad: at(row, i.facultad),
      departamento: at(row, i.departamento),
      estado: at(row, i.estado).toUpperCase(),
      code,
      displayCode: rawMateria.replace(/-/g, " ").replace(/\s+/g, " ").trim(),
      name: at(row, i.nombre),
      credits: Number.isFinite(creditsRaw) ? creditsRaw : null,
      prereqText: at(row, i.pre),
      coreqText: at(row, i.co),
      restrictions,
    });
    stats.keptRows++;
  }

  if (rows.length === 0) {
    throw new RegistroFormatError(
      `No se encontró ninguna fila válida (${stats.totalRows} leídas, ${stats.droppedBadPeriod} sin periodo de 6 dígitos, ${stats.droppedNoCode} sin código).`
    );
  }
  return { rows, stats };
}
