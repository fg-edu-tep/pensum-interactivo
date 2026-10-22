// GET /api/sections?codes=IELE1002,MATE1203&term=202710
//
// Live sections (teachers, schedules, seats) for the basket checkout modal.
// Server-side because the Uniandes API sends no CORS headers (and sits behind
// Cloudflare). A term that isn't published yet (the planner targets NEXT
// semester, whose offering usually opens late) falls back to the term
// Uniandes is currently offering, flagged `isReference` so the UI can say so.

import { NextResponse } from "next/server";
import { fetchSections, urlByCourse } from "@/lib/shared-oferta/fetcher";
import type { SeccionAPI } from "@/lib/shared-oferta/ofertaDeCursosAPI";
import { parseTerm, planTerm } from "@/lib/term";
import { resolveOfferingTerm } from "@/lib/termResolve";
import {
  parseHHMM,
  type CourseSections,
  type DayIndex,
  type Meeting,
  type SectionInfo,
  type SectionsResponse,
} from "@/lib/sections";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Z]{2,6}\d{3,4}[A-Z]?$/;
const MAX_CODES = 30;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Map<string, SectionInfo[]> | null }>();

const DAY_KEYS = ["l", "m", "i", "j", "v", "s", "d"] as const;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toSection(r: SeccionAPI): SectionInfo {
  const meetings: Meeting[] = [];
  for (const h of r.schedules ?? []) {
    DAY_KEYS.forEach((k, i) => {
      if (h[k]) {
        meetings.push({
          day: i as DayIndex,
          start: parseHHMM(h.time_ini),
          end: parseHHMM(h.time_fin),
          room: String(h.classroom ?? "").replace(/^\./, ""),
          building: String((h as { building?: string }).building ?? "").replace(/^\./, ""),
        });
      }
    });
  }
  const raw = r as unknown as Record<string, unknown>;
  const max = num(r.maxenrol);
  const enrolled = num(r.enrolled);
  return {
    nrc: String(r.nrc),
    section: String(r.section ?? ""),
    instructors: (r.instructors ?? []).map((p) => String(p.name)).filter(Boolean),
    seatsMax: max,
    seatsEnrolled: enrolled,
    seatsAvail: raw.seatsavail != null ? num(raw.seatsavail) : max - enrolled,
    campus: String(r.campus ?? ""),
    periodDesc: String(raw.ptrmdesc ?? r.ptrm ?? ""),
    meetings,
  };
}

/** Sections of `code` and of its companions — the same code plus one letter
 * (IELE2100L laboratorio, MATE1203C complementaria, …P práctica, …T taller).
 * nameInput matches loosely, so one call returns both. Keyed by exact code;
 * `code` itself is always present (possibly empty). */
async function lookup(code: string, term: string): Promise<Map<string, SectionInfo[]> | null> {
  const key = `${term}:${code}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const rows = await fetchSections(urlByCourse(code, term), { timeoutMs: 8000, retries: 1 });
    const byCode = new Map<string, SectionInfo[]>([[code, []]]);
    const companionRe = new RegExp(`^${code}[A-Z]$`);
    for (const r of rows) {
      const c = `${r.class}${r.course}`.toUpperCase();
      if (c !== code && !companionRe.test(c)) continue;
      if (!byCode.has(c)) byCode.set(c, []);
      byCode.get(c)!.push(toSection(r));
    }
    cache.set(key, { at: Date.now(), value: byCode });
    return byCode;
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const codes = [
    ...new Set(
      (searchParams.get("codes") ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => CODE_RE.test(c))
    ),
  ].slice(0, MAX_CODES);
  if (codes.length === 0) return NextResponse.json({ error: "missing or invalid codes" }, { status: 400 });

  const asked = searchParams.get("term") ?? "";
  const requestedTerm = parseTerm(asked) ? asked : planTerm();
  // resolved lazily: only needed when the requested term has no rows
  let referenceTerm: string | null = null;

  const out: SectionsResponse = { courses: {}, failed: [], companions: {} };
  await Promise.all(
    codes.map(async (code) => {
      let found = await lookup(code, requestedTerm);
      let term = requestedTerm;
      if (found && (found.get(code) ?? []).length === 0) {
        referenceTerm ??= (await resolveOfferingTerm()).term;
        if (referenceTerm !== requestedTerm) {
          const ref = await lookup(code, referenceTerm);
          if (ref && (ref.get(code) ?? []).length > 0) {
            found = ref;
            term = referenceTerm;
          }
        }
      }
      if (found === null) {
        out.failed.push(code);
        return;
      }
      for (const [c, sections] of found) {
        // an explicitly requested code wins over the same code seen as a companion
        if (c !== code && out.courses[c] && codes.includes(c)) continue;
        out.courses[c] = { term, requestedTerm, isReference: term !== requestedTerm, sections };
      }
      const comps = [...found.keys()].filter((c) => c !== code);
      if (comps.length) out.companions![code] = comps;
    })
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "private, max-age=120" } });
}
