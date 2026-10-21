// DB glue for lib/requirementResolve.ts: turns the rows the student payload and
// the discrepancy report already load into RequirementCandidates, and loads the
// Registro dictionary (the third source in the priority). Read-only.

import { prisma } from "./db";
import type { ReqNode } from "./types";
import type { ApiDetails, RegistroEntry, RequirementCandidates } from "./requirementResolve";

interface OfferingRow {
  term: string;
  detailsSyncedAt: Date | string | null;
  detailsError: string | null;
  apiPrereqText: string | null;
  apiPrereqTree: unknown;
  apiCoreqTree: unknown;
}

interface DocumentRow {
  prereqText: string | null;
  prereqTree: unknown;
  coreqText: string | null;
  coreqTree: unknown;
}

export function apiDetailsOf(o: OfferingRow): ApiDetails {
  return {
    term: o.term,
    detailsSyncedAt: o.detailsSyncedAt,
    detailsError: o.detailsError,
    apiPrereqText: o.apiPrereqText,
    apiPrereqTree: (o.apiPrereqTree as ReqNode | null) ?? null,
    apiCoreqTree: (o.apiCoreqTree as ReqNode | null) ?? null,
  };
}

export function requirementCandidates(
  doc: DocumentRow,
  current: OfferingRow | null,
  registro: RegistroEntry | null,
  history: OfferingRow[]
): RequirementCandidates {
  return {
    current: current ? apiDetailsOf(current) : null,
    document: {
      prereqText: doc.prereqText,
      prereqTree: (doc.prereqTree as ReqNode | null) ?? null,
      coreqText: doc.coreqText,
      coreqTree: (doc.coreqTree as ReqNode | null) ?? null,
    },
    registro,
    history: history.map(apiDetailsOf),
  };
}

/** The Registro upload whose dictionary is live: the latest applied one, or —
 * before any was applied — the latest one not discarded. */
export async function liveRegistroImportId(): Promise<number | null> {
  try {
    const applied = await prisma.registroImport.findFirst({
      where: { status: "applied" },
      orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (applied) return applied.id;
    const open = await prisma.registroImport.findFirst({
      where: { status: { not: "discarded" } },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return open?.id ?? null;
  } catch {
    // table missing on an old database: this source is simply unavailable
    return null;
  }
}

/** normalizedCode → Registro entry, for the given codes. */
export async function loadRegistroDictionary(codes: string[]): Promise<Map<string, RegistroEntry>> {
  const out = new Map<string, RegistroEntry>();
  if (codes.length === 0) return out;
  const importId = await liveRegistroImportId();
  if (importId == null) return out;
  try {
    const rows = await prisma.registroCourse.findMany({
      where: { importId, normalizedCode: { in: [...new Set(codes)] } },
      select: { normalizedCode: true, period: true, prereqText: true, coreqText: true },
    });
    for (const r of rows) out.set(r.normalizedCode, { period: r.period, prereqText: r.prereqText, coreqText: r.coreqText });
  } catch {
    /* unavailable source */
  }
  return out;
}
