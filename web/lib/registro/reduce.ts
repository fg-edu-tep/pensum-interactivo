// Reduces the full Registro row set to the wizard's dictionary:
//   1. term window   — the N newest REGULAR terms that have in-scope rows
//   2. core scope    — department + level (+ active) rows inside the window
//   3. closure       — codes referenced by core rows or bound by a catalog, any
//                      department, if they have an in-window row
//   4. newest wins   — per code, the newest in-window period (the master file is
//                      newest-first per code, so "last row wins" would be wrong)
//
// Pure: no I/O, no clock. Same input -> same output.

import { foldAccents } from "../import/textMatch";
import { isTokenCode, referencedCodes } from "./requirements";
import type {
  DictionaryEntry,
  ReduceResult,
  RegistroRow,
  ScopeOptions,
  TermWindow,
} from "./types";

const deptKey = (s: string) => foldAccents(s).replace(/\s+/g, " ").trim();

/** 10 = 1st semester, 20 = 2nd semester. 19 (inter) and 11–18 sub-terms are not "regular". */
export function isRegularTerm(period: string): boolean {
  return /^\d{4}(10|20)$/.test(period);
}

function isCoreRow(r: RegistroRow, depts: Set<string>, levels: Set<string>): boolean {
  if (!depts.has(deptKey(r.departamento))) return false;
  if (levels.size && !levels.has(r.nivel)) return false;
  if (r.estado && r.estado !== "ACTIVO") return false;
  return true;
}

/** Which regular terms exist for the scope, and which of them form the window. */
export function computeTermWindow(rows: RegistroRow[], opts: ScopeOptions): TermWindow | null {
  const depts = new Set(opts.departments.map(deptKey));
  const levels = new Set(opts.levels.map((l) => l.toUpperCase()));
  const regular = new Set<string>();
  for (const r of rows) {
    if (isRegularTerm(r.period) && isCoreRow(r, depts, levels)) regular.add(r.period);
  }
  const availableRegular = [...regular].sort().reverse();
  if (availableRegular.length === 0) return null;

  const wanted = opts.selectedRegularTerms?.length
    ? availableRegular.filter((t) => opts.selectedRegularTerms!.includes(t))
    : availableRegular.slice(0, Math.max(1, opts.regularTermCount));
  if (wanted.length === 0) return null;

  const sorted = [...wanted].sort();
  return {
    availableRegular,
    selectedRegular: [...wanted].sort().reverse(),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function toEntry(r: RegistroRow, isCore: boolean): DictionaryEntry {
  return {
    code: r.code,
    displayCode: r.displayCode,
    name: r.name,
    credits: r.credits,
    departamento: r.departamento,
    nivel: r.nivel,
    period: r.period,
    prereqText: r.prereqText,
    coreqText: r.coreqText,
    restrictions: r.restrictions,
    isCore,
  };
}

/**
 * @param extraCodes codes that must be looked up even if nothing in scope
 *   references them (e.g. every code bound in a catalog)
 */
export function reduceRegistro(
  rows: RegistroRow[],
  opts: ScopeOptions,
  extraCodes: Iterable<string> = []
): ReduceResult {
  const window = computeTermWindow(rows, opts);
  const empty: ReduceResult = {
    window: null,
    entries: new Map(),
    stats: { rowsConsidered: rows.length, rowsInWindow: 0, coreCodes: 0, closureCodes: 0, closureMisses: 0 },
  };
  if (!window) return empty;

  const depts = new Set(opts.departments.map(deptKey));
  const levels = new Set(opts.levels.map((l) => l.toUpperCase()));

  // one pass: newest in-window row per code, overall and for core rows
  const newestCore = new Map<string, RegistroRow>();
  const newestAny = new Map<string, RegistroRow>();
  let rowsInWindow = 0;
  for (const r of rows) {
    if (r.period < window.min || r.period > window.max) continue;
    rowsInWindow++;
    if (!r.estado || r.estado === "ACTIVO") {
      const a = newestAny.get(r.code);
      if (!a || r.period > a.period) newestAny.set(r.code, r);
    }
    if (isCoreRow(r, depts, levels)) {
      const c = newestCore.get(r.code);
      if (!c || r.period > c.period) newestCore.set(r.code, r);
    }
  }

  const entries = new Map<string, DictionaryEntry>();
  for (const [code, r] of newestCore) entries.set(code, toEntry(r, true));
  const coreCodes = entries.size;

  // closure: one level — what core rows reference, plus the caller's extras
  const wanted = new Set<string>(extraCodes);
  for (const e of entries.values()) {
    for (const c of referencedCodes(e.prereqText, e.coreqText)) wanted.add(c);
  }
  let closureMisses = 0;
  for (const code of wanted) {
    if (entries.has(code) || isTokenCode(code)) continue;
    const r = newestAny.get(code);
    if (r) entries.set(code, toEntry(r, false));
    else closureMisses++;
  }

  return {
    window,
    entries,
    stats: {
      rowsConsidered: rows.length,
      rowsInWindow,
      coreCodes,
      closureCodes: entries.size - coreCodes,
      closureMisses,
    },
  };
}
