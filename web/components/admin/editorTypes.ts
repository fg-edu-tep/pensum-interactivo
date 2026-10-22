import type { CatalogRules } from "@/lib/types";
import type { FieldAlertData } from "./DiscrepancyAlert";
import type { SyncedCourse } from "@/lib/pairing/syncCatalogCourses";

export interface EditorIdentity {
  programName: string;
  programCode: string;
  variantLabel: string;
  term: string;
  status: string;
  accentColor: string;
  tagline: string;
  subtitle: string;
  imagePath: string;
}

export interface EditorCourse {
  id: number;
  displayCode: string;
  normalizedCode: string | null;
  name: string;
  credits: number;
  suggestedSemester: number;
  courseType: string;
  isPlaceholder: boolean;
  placeholderKind: string;
  placeholderLabel: string;
  prereqText: string;
  pairingStatus: string;
  manuallyEdited: boolean;
  lockedFields: string[];
  description: string;
  descriptionSyncedAt: string | null;
  /** document-vs-API report for this row (null for rows without a real course) */
  discrepancy: { prereq: FieldAlertData; coreq: FieldAlertData } | null;
}

export interface EditorRequirementNode {
  id: number;
  key: string;
  label: string;
  description: string;
  infoUrl: string;
  semester: number;
  sortIndex: number;
  attestationId: string;
  autoLinkRegex: string;
  linkedCourseCodes: string;
}

export interface EditorData {
  slug: string;
  identity: EditorIdentity;
  courses: EditorCourse[];
  requirementNodes: EditorRequirementNode[];
  rules: CatalogRules;
}

export const COURSE_TYPES = [
  "nucleo",
  "electiva",
  "cbu",
  "complementaria",
  "proyecto",
] as const;

export const PLACEHOLDER_KINDS = [
  "CBU",
  "ELECTIVA",
  "EFI",
  "CLE",
  "DEPT",
  "CODEX",
  "CI",
] as const;

export const PAIRING_LABEL: Record<string, string> = {
  auto_paired: "auto",
  manual_resolved: "manual",
  not_offered: "no ofertado",
  needs_manual: "por revisar",
  placeholder_pool: "pool",
  sync_failed: "falló sync",
};

/** One-line Spanish outcome of an API re-sync for a single course. */
export function describeSync(s: SyncedCourse): string {
  if (s.pairingStatus === "sync_failed") return `falló la consulta a la API (${s.error ?? "sin respuesta"})`;
  if (!s.offered) return `la API no ofrece ${s.code} este semestre`;
  const secs = `${s.sectionCount} ${s.sectionCount === 1 ? "sección" : "secciones"}`;
  return s.details
    ? `datos de la API actualizados (${s.code}, ${secs})`
    : `la API ofrece ${s.code} (${secs}) pero falló la consulta de requisitos`;
}
