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
const MAX_CODES = 12;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: CourseSections | null }>();

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

async function lookup(code: string, term: string): Promise<SectionInfo[] | null> {
  const key = `${term}:${code}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value ? hit.value.sections : null;
  try {
    const rows = await fetchSections(urlByCourse(code, term), { timeoutMs: 8000, retries: 1 });
    // nameInput matches loosely — keep exact "<class><course>" only (drops labs like 1002L)
    const exact = rows.filter((r) => `${r.class}${r.course}`.toUpperCase() === code);
    const sections = exact.map(toSection);
    cache.set(key, { at: Date.now(), value: { term, requestedTerm: term, isReference: false, sections } });
    return sections;
  } catch {
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

  const out: SectionsResponse = { courses: {}, failed: [] };
  await Promise.all(
    codes.map(async (code) => {
      let sections = await lookup(code, requestedTerm);
      let term = requestedTerm;
      if (sections && sections.length === 0) {
        referenceTerm ??= (await resolveOfferingTerm()).term;
        if (referenceTerm !== requestedTerm) {
          const ref = await lookup(code, referenceTerm);
          if (ref && ref.length > 0) {
            sections = ref;
            term = referenceTerm;
          }
        }
      }
      if (sections === null) {
        out.failed.push(code);
        return;
      }
      out.courses[code] = { term, requestedTerm, isReference: term !== requestedTerm, sections };
    })
  );
  return NextResponse.json(out, { headers: { "Cache-Control": "private, max-age=120" } });
}
