// Shared types for the Registro import wizard (docs/admin-registro-wizard.md).
// Pure data shapes only — no I/O — so they are safe to import from client code.

/** One cleaned data row of Excel_Registro.xlsx ("Export" sheet). */
export interface RegistroRow {
  /** Banner term, always 6 digits ("202620"). Rows without one are dropped. */
  period: string;
  nivel: string; // PREG | POST | EDCO
  facultad: string;
  departamento: string;
  estado: string;
  /** normalizeCode(Materia): "IELE-2100" -> "IELE2100" */
  code: string;
  /** "IELE-2100" -> "IELE 2100" (the way the pensum sheets print it) */
  displayCode: string;
  name: string;
  credits: number | null;
  prereqText: string;
  coreqText: string;
  restrictions: Record<string, string>;
}

export interface ParseStats {
  /** data rows seen (excluding the header) */
  totalRows: number;
  /** rows kept */
  keptRows: number;
  /** footer/junk rows whose Periodo is not a 6-digit term */
  droppedBadPeriod: number;
  /** rows with no Materia code */
  droppedNoCode: number;
}

export interface ScopeOptions {
  /** Departamento values (compared accent/case-insensitively) that define the core scope */
  departments: string[];
  /** Nivel values kept for core rows; closure rows ignore this */
  levels: string[];
  /** how many of the newest REGULAR terms (YYYY10 / YYYY20) form the window */
  regularTermCount: number;
  /** explicit override of the regular terms to use (e.g. admin unticked one) */
  selectedRegularTerms?: string[];
}

/** IELE and IELC share one department and the IELE prefix (verified on the real file). */
export const DEFAULT_SCOPE: ScopeOptions = {
  departments: ["INGEN. ELECTRICA Y ELECTRONICA", "INGENIERIA ELECTRONICA"],
  levels: ["PREG"],
  regularTermCount: 3,
};

export interface TermWindow {
  /** every regular term that has core-scope rows, newest first */
  availableRegular: string[];
  /** the regular terms actually in use, newest first */
  selectedRegular: string[];
  /** inclusive bounds of the window (6-digit strings compare lexicographically) */
  min: string;
  max: string;
}

/** The reduced dictionary row: the newest in-window record of one course code. */
export interface DictionaryEntry {
  code: string;
  displayCode: string;
  name: string;
  credits: number | null;
  departamento: string;
  nivel: string;
  period: string;
  prereqText: string;
  coreqText: string;
  restrictions: Record<string, string>;
  /** true = matched the department/level scope; false = pulled in only because
   * something in scope (or a catalog) references it */
  isCore: boolean;
}

export interface ReduceStats {
  rowsConsidered: number;
  rowsInWindow: number;
  coreCodes: number;
  closureCodes: number;
  /** codes we looked for (referenced / bound) but found no in-window row for */
  closureMisses: number;
}

export interface ReduceResult {
  window: TermWindow | null;
  entries: Map<string, DictionaryEntry>;
  stats: ReduceStats;
}

// ---------- analysis / resolution ----------

export type ItemKind =
  | "bound-missing"
  | "ref-missing"
  | "token-nocourse"
  | "name-drift"
  | "credits-drift"
  | "placeholder-slot";

export type Resolution =
  | { action: "keep" } // leave the catalog data as it is
  | { action: "rebind"; code: string } // bound-missing: bind the slot to another registro code
  | { action: "replace"; code: string } // ref-missing: substitute the token in expressions
  | { action: "drop" } // ref-missing: remove the token from expressions
  | { action: "accept" } // token-nocourse: keep verbatim
  | { action: "use-registro" }; // drift: take the registro value

export interface UnresolvedItem {
  /** stable key, used to store the admin's decision */
  key: string;
  kind: ItemKind;
  /** needs an explicit decision before apply (vs informational) */
  severity: "action" | "info";
  code?: string;
  /** catalog slugs affected */
  catalogs: string[];
  /** human context: which courses reference it, old/new values, … */
  detail: Record<string, unknown>;
  /** actions the UI may offer, first = default */
  allowed: Resolution["action"][];
}

/** A catalog course as the analyzer sees it (DB-independent). */
export interface CatalogCourseInput {
  id: number;
  displayCode: string;
  /** normalizedCode of the bound Course; null for placeholders/unbound */
  code: string | null;
  name: string;
  credits: number;
  isPlaceholder: boolean;
  placeholderKind: string | null;
  prereqText: string | null;
  coreqText: string | null;
  manuallyEdited: boolean;
  lockedFields: string[];
}

export interface CatalogInput {
  slug: string;
  courses: CatalogCourseInput[];
}
