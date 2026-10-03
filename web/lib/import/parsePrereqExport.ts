// Parses the Banner/Registro requirements export (sheet "Export"). Historically
// this was a pre-filtered single-term dump ("PRERREQUISITOS TODOS <term>.xlsx",
// ~2900 rows); the canonical source is now the full multi-year "Excel_Registro"
// master export (~117k rows, every term back to ~2004, one row per course per
// term it was active in). Within that file, a course code's rows are NOT in
// chronological order — they're newest-period-first — so we filter to the
// requested `term` explicitly rather than assume "last row wins" picks the
// current data (it would silently pick the *oldest* period on the master file).
// Either file shape works: filtering by term is a no-op on the old single-term
// file since every row already matches it.

import * as XLSX from "xlsx";
import { normalizeCode } from "./normalizeCode";

export interface PrereqRow {
  normalizedCode: string;
  nameEs: string;
  credits: number | null;
  prereqText: string;
  coreqText: string;
  restrictions: {
    periodo?: string;
    programa?: string;
    nivel?: string;
    grado?: string;
    departamento?: string;
    facultad?: string;
    campo?: string;
    atributosAlumno?: string;
  };
}

const COL = {
  periodo: "Periodo",
  materia: "Materia",
  creditos: "Créditos",
  nombre: "Nombre curso",
  pre: "Código prerrequisito",
  co: "Código correquisito",
  rPeriodo: "Restricción de periodo",
  rPrograma: "Restricción de programa",
  rNivel: "Restricción de nivel",
  rGrado: "Restricción de grado",
  rDepartamento: "Restricción de departamento",
  rFacultad: "Restricción de facultad",
  rCampo: "Restricción de campo de estudios",
  rAtributos: "Restricción de atributos alumno",
} as const;

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "-" ? "" : s;
}

export function parsePrereqExport(
  buffer: Buffer | ArrayBuffer,
  term: string
): Map<string, PrereqRow> {
  const wb = XLSX.read(buffer, {
    type: buffer instanceof Buffer ? "buffer" : "array",
  });
  const ws = wb.Sheets["Export"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  if (rows.length < 2) return new Map();

  const header = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  const idx = (name: string) => header.indexOf(name);
  const iMateria = idx(COL.materia);
  if (iMateria < 0) return new Map();
  const iPeriodo = idx(COL.periodo);
  const iCred = idx(COL.creditos);
  const iNombre = idx(COL.nombre);
  const iPre = idx(COL.pre);
  const iCo = idx(COL.co);
  const iRPer = idx(COL.rPeriodo);
  const iRProg = idx(COL.rPrograma);
  const iRNiv = idx(COL.rNivel);
  const iRGra = idx(COL.rGrado);
  const iRDep = idx(COL.rDepartamento);
  const iRFac = idx(COL.rFacultad);
  const iRCam = idx(COL.rCampo);
  const iRAtr = idx(COL.rAtributos);

  const map = new Map<string, PrereqRow>();
  const bestPeriod = new Map<string, string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    // On the multi-year master export a code repeats once per term it was
    // active in, newest first — skip every row that isn't the requested term.
    // Courses not offered in `term` have no row for it; fall back to their
    // most recent EARLIER period (never a later one) so their requirements
    // still come from Registro rather than nowhere.
    const periodo = iPeriodo >= 0 ? clean(row[iPeriodo]) : term;
    if (periodo > term) continue;
    const code = normalizeCode(row[iMateria]);
    if (!code) continue;
    if ((bestPeriod.get(code) ?? "") > periodo) continue;
    bestPeriod.set(code, periodo);
    const creditsRaw = iCred >= 0 ? Number.parseFloat(String(row[iCred] ?? "").replace(",", ".")) : NaN;
    // last row wins if a code somehow repeats within the same term; that's
    // fine for our use (the master file has none, verified on iele-cbu3/ielc-cbu3)
    map.set(code, {
      normalizedCode: code,
      nameEs: iNombre >= 0 ? clean(row[iNombre]) : "",
      credits: Number.isFinite(creditsRaw) ? creditsRaw : null,
      prereqText: iPre >= 0 ? clean(row[iPre]) : "",
      coreqText: iCo >= 0 ? clean(row[iCo]) : "",
      restrictions: {
        periodo: iRPer >= 0 ? clean(row[iRPer]) || undefined : undefined,
        programa: iRProg >= 0 ? clean(row[iRProg]) || undefined : undefined,
        nivel: iRNiv >= 0 ? clean(row[iRNiv]) || undefined : undefined,
        grado: iRGra >= 0 ? clean(row[iRGra]) || undefined : undefined,
        departamento: iRDep >= 0 ? clean(row[iRDep]) || undefined : undefined,
        facultad: iRFac >= 0 ? clean(row[iRFac]) || undefined : undefined,
        campo: iRCam >= 0 ? clean(row[iRCam]) || undefined : undefined,
        atributosAlumno: iRAtr >= 0 ? clean(row[iRAtr]) || undefined : undefined,
      },
    });
  }
  return map;
}
