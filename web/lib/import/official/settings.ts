// AdminSetting keys written by the official load (lib/import/official/apply.ts).

import { prisma } from "../../db";

export const PLANNING_TERM_KEY = "planning_term";
export const OFFICIAL_LOAD_KEY = "official_load_last";

/** The declared planning period, or null before the first official load. */
export async function planningTermSetting(): Promise<string | null> {
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: PLANNING_TERM_KEY } });
    return row?.value && /^\d{6}$/.test(row.value) ? row.value : null;
  } catch {
    return null;
  }
}

export interface OfficialLoadSummary {
  jobId: number;
  appliedAt: string;
  actor: string;
  planningTerm: string;
  currentTerm: string;
  files: { planes: string; bolsas: string; requisitos: string };
}

export async function lastOfficialLoad(): Promise<OfficialLoadSummary | null> {
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: OFFICIAL_LOAD_KEY } });
    return row ? (JSON.parse(row.value) as OfficialLoadSummary) : null;
  } catch {
    return null;
  }
}
