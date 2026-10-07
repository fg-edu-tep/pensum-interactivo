// Test helpers: build an in-memory Excel_Registro-shaped workbook.
import * as XLSX from "xlsx";

export const HEADER = [
  "Periodo", "Nivel", "Facultad", "Departamento", "Estado", "Materia", "Créditos",
  "Nombre curso", "Código prerrequisito", "Nombre prerrequisito", "Código correquisito",
  "Nombre correquisito", "Restricción de periodo", "Restricción de programa",
  "Restricción de nivel", "Restricción de grado", "Restricción de departamento",
  "Restricción de facultad", "Restricción de campo de estudios", "Restricción de atributos alumno",
];

export interface Row {
  periodo: string;
  nivel?: string;
  dept?: string;
  estado?: string;
  materia: string;
  credits?: number | string;
  nombre?: string;
  pre?: string;
  co?: string;
  programa?: string;
}

export const EE = "INGEN. ELECTRICA Y ELECTRONICA";

export function toRow(r: Row): unknown[] {
  const a: unknown[] = new Array(HEADER.length).fill("");
  a[0] = r.periodo; a[1] = r.nivel ?? "PREG"; a[2] = "INGENIERÍA"; a[3] = r.dept ?? EE;
  a[4] = r.estado ?? "ACTIVO"; a[5] = r.materia; a[6] = r.credits ?? 3; a[7] = r.nombre ?? r.materia;
  a[8] = r.pre ?? ""; a[10] = r.co ?? ""; a[13] = r.programa ?? "";
  return a;
}

export function workbookBuffer(rows: Row[], opts: { footer?: boolean; sheet?: string; header?: string[] } = {}): Buffer {
  const aoa: unknown[][] = [opts.header ?? HEADER, ...rows.map(toRow)];
  if (opts.footer !== false) aoa.push(["Filtros aplicados: \nDESCRIPCION_ESTADO_DEL_CURSO es ACTIVO"]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheet ?? "Export");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
