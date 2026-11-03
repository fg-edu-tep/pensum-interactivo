// Electives not offered this term: what the full Banner/Registro export says
// about them (every period back to ~2004, one row per course per period it was
// taught). Used by the seed to fill Elective.code / lastOfferedTerm /
// frequency / registro* when the bag Excel leaves them blank.
//
// The bag Excel has no codes (unless its "CÓDIGO" column is filled), so a code
// is found by name: an exact accent/space-insensitive match first, then an
// abbreviation-aware one — Registro truncates names to ~30 characters
// ("AUTOMAT SISTEMAS DISTRIBUCION"), so every Registro word must be the start
// of a word of the bag name and most of the bag name must be covered. Only
// engineering subjects (I…) are considered, preferring the department's own
// (IELE) and the most recently taught code. Names that don't match stay
// without a code; the "CÓDIGO" column is the fix for those.

import * as XLSX from "xlsx";
import { normalizeCode } from "./normalizeCode";
import { foldAccents, normalizeName } from "./textMatch";
import type { Frequency } from "./parseElectivesWorkbook";
import { restrictionToCredits } from "./restrictionCredits";

/** Newest row at or before `term`. */
export function latestRow(history: RegistroHistory, code: string, term: string): HistoryRow | null {
  return (history.get(code) ?? []).find((r) => r.period <= term) ?? null;
}

/** Codes with no row in the window [fromTerm, term] — for the department's coverage check. */
export function coverageGaps(history: RegistroHistory, codes: string[], fromTerm: string, term: string): string[] {
  return [...new Set(codes)].filter((c) => !(history.get(c) ?? []).some((r) => r.period >= fromTerm && r.period <= term)).sort();
}

export interface HistoryRow {
  period: string;
  name: string;
  credits: number | null;
  prereqText: string;
  /** "Restricción de periodo" (e.g. "EXCLUYE INGRESA A PRIMER SEMESTRE & …") */
  restriction: string;
  /** "Restricción de nivel" (e.g. "INCLUYE MAGISTER") */
  level: string;
}

/** normalizedCode → rows, newest period first. */
export type RegistroHistory = Map<string, HistoryRow[]>;

export function parseRegistroHistory(buffer: Buffer | ArrayBuffer): RegistroHistory {
  const wb = XLSX.read(buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });
  const ws = wb.Sheets["Export"] ?? wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  const out: RegistroHistory = new Map();
  if (grid.length < 2) return out;
  const header = (grid[0] as unknown[]).map((h) => String(h ?? "").trim());
  const iPer = header.indexOf("Periodo");
  const iMat = header.indexOf("Materia");
  const iCred = header.indexOf("Créditos");
  const iName = header.indexOf("Nombre curso");
  const iPre = header.indexOf("Código prerrequisito");
  const iRes = header.indexOf("Restricción de periodo");
  const iLvl = header.indexOf("Restricción de nivel");
  if (iPer < 0 || iMat < 0) return out;
  const clean = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s === "-" ? "" : s;
  };
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    const period = clean(row[iPer]);
    if (!/^\d{6}$/.test(period)) continue; // footer "Filtros aplicados: …"
    const code = normalizeCode(row[iMat]);
    if (!code) continue;
    const credits = iCred >= 0 ? Number.parseFloat(clean(row[iCred]).replace(",", ".")) : NaN;
    const list = out.get(code) ?? [];
    list.push({
      period,
      name: iName >= 0 ? clean(row[iName]) : "",
      credits: Number.isFinite(credits) ? credits : null,
      prereqText: iPre >= 0 ? clean(row[iPre]) : "",
      restriction: iRes >= 0 ? clean(row[iRes]) : "",
      level: iLvl >= 0 ? clean(row[iLvl]) : "",
    });
    out.set(code, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.period.localeCompare(a.period));
  return out;
}

/** Name index: normalized latest name → codes (built once per seed). */
export function nameIndex(history: RegistroHistory): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const [code, rows] of history) {
    for (const n of new Set(rows.map((r) => normalizeName(r.name)).filter(Boolean))) {
      const l = idx.get(n) ?? [];
      l.push(code);
      idx.set(n, l);
    }
  }
  return idx;
}

function rank(code: string, history: RegistroHistory): [number, string] {
  return [code.startsWith("IELE") ? 0 : 1, history.get(code)?.[0]?.period ?? ""];
}

/** Best code for an elective name, or null. */
export function matchCodeByName(name: string, history: RegistroHistory, index: Map<string, string[]>): string | null {
  const pick = (codes: string[]) =>
    [...codes].sort((a, b) => {
      const [pa, ta] = rank(a, history);
      const [pb, tb] = rank(b, history);
      return pa - pb || tb.localeCompare(ta);
    })[0] ?? null;
  const exact = index.get(normalizeName(name));
  if (exact?.length) return pick(exact);
  const words = significantWords(name);
  let best: { codes: string[]; score: number } | null = null;
  for (const [n, all] of index) {
    const codes = all.filter((c) => c.startsWith("I"));
    if (codes.length === 0) continue;
    const score = abbreviationScore(significantWords(n), words);
    if (score === 0) continue;
    if (!best || score > best.score) best = { codes, score };
    else if (score === best.score) best.codes = [...best.codes, ...codes];
  }
  return best ? pick(best.codes) : null;
}

const STOP = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "EN", "A", "AL", "PARA", "CON", "POR"]);

export function significantWords(s: string): string[] {
  return foldAccents(s)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** Registro words `abbr` vs bag words `full`: every Registro word (≥ 3
 * letters, or exact) must start a distinct bag word, covering ≥ 75 % of the
 * bag words. Returns the coverage, or 0 when it isn't a match. */
export function abbreviationScore(abbr: string[], full: string[]): number {
  if (abbr.length === 0 || full.length === 0) return 0;
  const used = new Set<number>();
  for (const a of abbr) {
    const i = full.findIndex((w, j) => !used.has(j) && (w === a || (a.length >= 3 && w.startsWith(a))));
    if (i < 0) return 0;
    used.add(i);
  }
  const coverage = used.size / full.length;
  return coverage >= 0.75 ? coverage : 0;
}

const regular = (p: string) => /^\d{4}(10|20)$/.test(p);

/** Usual offering from the regular periods of the last `years` years up to `term`. */
export function deriveFrequency(periods: string[], term: string, years = 8): Frequency | null {
  const fromYear = Number(term.slice(0, 4)) - years;
  const reg = [...new Set(periods.filter((p) => regular(p) && p <= term && Number(p.slice(0, 4)) > fromYear))].sort();
  if (reg.length === 0) return null;
  const has10 = reg.some((p) => p.endsWith("10"));
  const has20 = reg.some((p) => p.endsWith("20"));
  if (has10 && has20) return "both";
  const yrs = reg.map((p) => Number(p.slice(0, 4)));
  if (yrs.length >= 2) {
    const gaps = yrs.slice(1).map((y, i) => y - yrs[i]).sort((a, b) => a - b);
    if (gaps[Math.floor(gaps.length / 2)] >= 2) return "biennial";
  }
  return has10 ? "s1" : "s2";
}

export interface ElectiveHistoryInfo {
  code: string | null;
  codeSource: "excel" | "registro" | null;
  frequency: Frequency | null;
  frequencySource: "excel" | "registro" | null;
  lastOfferedTerm: string | null;
  registroName: string | null;
  registroCredits: number | null;
  registroPrereqText: string | null;
  /** "excluye semestres 1–n" at that period → 15 × n */
  minCredits: number | null;
  /** "Restricción de nivel" at that period */
  registroLevel: string | null;
}

/** Excel values win; blanks are filled from the Registro history. */
export function electiveHistory(
  e: { name: string; code: string | null; frequency: Frequency | null },
  history: RegistroHistory,
  index: Map<string, string[]>,
  term: string
): ElectiveHistoryInfo {
  const code = e.code ?? matchCodeByName(e.name, history, index);
  const rows = (code ? history.get(code) : undefined) ?? [];
  const last = rows.find((r) => r.period <= term) ?? null;
  const derived = deriveFrequency(rows.map((r) => r.period), term);
  return {
    code,
    codeSource: e.code ? "excel" : code ? "registro" : null,
    frequency: e.frequency ?? derived,
    frequencySource: e.frequency ? "excel" : derived ? "registro" : null,
    lastOfferedTerm: last?.period ?? null,
    registroName: last?.name || null,
    registroCredits: last?.credits ?? null,
    registroPrereqText: last?.prereqText || null,
    minCredits: restrictionToCredits(last?.restriction)?.minCredits ?? null,
    registroLevel: last?.level || null,
  };
}
