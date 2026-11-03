// The department's elective bag (BOLSAS_<term>.xlsx, from 2026-11): the Registro
// columns for each course plus, per program, an "X" for each attribute and the
// projected next offering:
//
//   … | IELE OBLIGATORIA | IELE ELECTIVA | IELE CINTEGRAD | IELC OBLIGATORIA |
//   IELC ELECTIVA | IELC CINTEGRAD | MIELE OBLIGATORIA | MIELE PROFUND |
//   MIELC OBLIGATORIA | MIELC PROFUND | PROXIMO
//
// The three undergraduate attributes are independent (agreed 2026-10-29): a
// course can be electiva AND integrador, integrador only (Práctica profesional),
// or obligatoria in one program and electiva in the other (Electrónica de
// potencia). PROXIMO (Mauricio, 2026-10-29):
//   a period (202810)  the next period it is expected to be taught
//   SEM                taught every semester
//   NODEF              not known yet
//   blank              most likely not offered again
// Codes are the identity: nothing here is matched by name. Pure.

import * as XLSX from "xlsx";
import { normalizeCode } from "../normalizeCode";
import { foldAccents } from "../textMatch";
import { cell } from "./planesMatrix";

export type ProgramKey = "IELE" | "IELC" | "MIELE" | "MIELC";

export interface ProgramAttrs {
  obligatoria: boolean;
  electiva: boolean;
  integrador: boolean;
  /** master's "PROFUND" (profundización) */
  profundizacion: boolean;
}

export type Projection =
  | { kind: "term"; term: string }
  | { kind: "sem" }
  | { kind: "nodef" }
  | { kind: "none" };

export interface BolsaRow {
  rowNum: number;
  code: string; // "IELE-3338"
  normalizedCode: string;
  name: string;
  credits: number | null;
  level: string; // Nivel: PREG | POST
  period: string;
  prereqText: string;
  coreqText: string;
  restrictions: { periodo: string; programa: string; nivel: string };
  attrs: Record<ProgramKey, ProgramAttrs>;
  projected: Projection;
  projectedRaw: string;
}

export interface ParsedBolsas {
  period: string | null;
  rows: BolsaRow[];
  warnings: string[];
}

const PROGRAMS: ProgramKey[] = ["IELE", "IELC", "MIELE", "MIELC"];

export function parseProjection(raw: string): Projection {
  const s = foldAccents(raw).toUpperCase().replace(/[\s-]/g, "");
  if (!s) return { kind: "none" };
  if (/^\d{6}$/.test(s)) return { kind: "term", term: s };
  if (/^\d{4}(1|2)$/.test(s)) return { kind: "term", term: `${s.slice(0, 4)}${s.endsWith("1") ? "10" : "20"}` };
  if (s.startsWith("SEM")) return { kind: "sem" };
  if (s.startsWith("NODEF") || s === "ND") return { kind: "nodef" };
  return { kind: "nodef" };
}

const truthy = (v: unknown) => /^(X|SI|SÍ|1|TRUE|S)$/i.test(cell(v));

export function emptyAttrs(): Record<ProgramKey, ProgramAttrs> {
  const a = {} as Record<ProgramKey, ProgramAttrs>;
  for (const p of PROGRAMS) a[p] = { obligatoria: false, electiva: false, integrador: false, profundizacion: false };
  return a;
}

export function isBolsasWorkbook(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const head = ((XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" })[0] ?? []) as unknown[]).map((h) =>
    cell(h).toUpperCase()
  );
  return head.includes("PROXIMO") || head.some((h) => /^(IELE|IELC) (ELECTIVA|CINTEGRAD)$/.test(h));
}

export function parseBolsas(buffer: Buffer | ArrayBuffer): ParsedBolsas {
  const wb = XLSX.read(buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const header = ((grid[0] ?? []) as unknown[]).map((h) => foldAccents(cell(h)).toUpperCase());
  const col = (name: string) => header.indexOf(foldAccents(name).toUpperCase());
  const warnings: string[] = [];
  const iMat = col("Materia");
  if (iMat < 0) throw new Error('BOLSAS: falta la columna "Materia".');
  const attrCols: { program: ProgramKey; attr: keyof ProgramAttrs; index: number }[] = [];
  header.forEach((h, index) => {
    const m = /^(IELE|IELC|MIELE|MIELC) (OBLIGATORIA|OBLIGATORIO|ELECTIVA|CINTEGRAD|C\.? ?INTEGRADOR|INTEGRADOR|PROFUND|PROFUNDIZACION)$/.exec(h);
    if (!m) return;
    const attr: keyof ProgramAttrs = m[2].startsWith("OBLIG")
      ? "obligatoria"
      : m[2] === "ELECTIVA"
        ? "electiva"
        : m[2].startsWith("PROFUND")
          ? "profundizacion"
          : "integrador";
    attrCols.push({ program: m[1] as ProgramKey, attr, index });
  });
  if (attrCols.length === 0) warnings.push("BOLSAS: no se encontraron columnas de atributos (IELE ELECTIVA, IELC CINTEGRAD, …).");
  const iProx = header.findIndex((h) => h === "PROXIMO" || h === "PROXIMA OFERTA" || h === "PERIODO PROYECTADO");
  if (iProx < 0) warnings.push('BOLSAS: falta la columna "PROXIMO" (periodo proyectado).');
  const at = (r: unknown[], name: string) => {
    const i = col(name);
    return i >= 0 ? cell(r[i]) : "";
  };

  const rows: BolsaRow[] = [];
  const seen = new Map<string, number>();
  let period: string | null = null;
  for (let r = 1; r < grid.length; r++) {
    const g = grid[r] as unknown[];
    const code = cell(g[iMat]);
    if (!code) continue;
    const normalizedCode = normalizeCode(code);
    if (seen.has(normalizedCode)) {
      warnings.push(`Fila ${r + 1}: ${code} repetido (ya en la fila ${seen.get(normalizedCode)}) — se usa la primera.`);
      continue;
    }
    seen.set(normalizedCode, r + 1);
    const attrs = emptyAttrs();
    for (const c of attrCols) if (truthy(g[c.index])) attrs[c.program][c.attr] = true;
    const projectedRaw = iProx >= 0 ? cell(g[iProx]) : "";
    const projected = parseProjection(projectedRaw);
    if (projectedRaw && projected.kind === "nodef" && !/NODEF/i.test(projectedRaw))
      warnings.push(`Fila ${r + 1} (${code}): PROXIMO "${projectedRaw}" no reconocido — se toma como NODEF.`);
    const per = at(g, "Periodo");
    if (/^\d{6}$/.test(per)) period ??= per;
    const credits = Number.parseFloat(at(g, "Créditos").replace(",", "."));
    rows.push({
      rowNum: r + 1,
      code,
      normalizedCode,
      name: at(g, "Nombre curso") || code,
      credits: Number.isFinite(credits) ? credits : null,
      level: at(g, "Nivel"),
      period: per,
      prereqText: at(g, "Código prerrequisito"),
      coreqText: at(g, "Código correquisito"),
      restrictions: {
        periodo: at(g, "Restricción de periodo"),
        programa: at(g, "Restricción de programa"),
        nivel: at(g, "Restricción de nivel"),
      },
      attrs,
      projected,
      projectedRaw,
    });
  }
  return { period, rows, warnings };
}

/** Old `roles` JSON shape (ElectiveDTO.roles) from the per-program attributes. */
export function rolesFromAttrs(a: Record<ProgramKey, ProgramAttrs>) {
  const role = (p: ProgramAttrs, master: ProgramAttrs[]) =>
    p.obligatoria
      ? { norm: "obligatoria", raw: "Obligatoria" }
      : p.electiva
        ? { norm: "electiva", raw: p.integrador ? "Electiva + integrador" : "Electiva" }
        : p.integrador
          ? { norm: "curso_integrador", raw: "Curso integrador" }
          : master.some((m) => m.profundizacion || m.obligatoria)
            ? { norm: "maestria", raw: "Curso de maestría" }
            : { norm: null, raw: "" };
  const master = [a.MIELE, a.MIELC];
  return {
    eleFrom2024: role(a.IELE, master),
    elcFrom2024: role(a.IELC, master),
    eleUntil2023: { norm: null, raw: "" },
    elcUntil2023: { norm: null, raw: "" },
  };
}
