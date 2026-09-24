// Ported from app/src/lib/persistence.ts. Progress state stays client-side only
// (no accounts, no server storage). Now namespaced per catalog slug so a student
// can track several pensums independently.

import type { ElectiveAssignment } from "./types";

function storageKey(slug: string) {
  return `pensum:${slug}:approved`;
}
function electivesKey(slug: string) {
  return `pensum:${slug}:electivas`;
}
function attestKey(slug: string) {
  return `pensum:${slug}:requisitos`;
}
function plannedKey(slug: string) {
  return `pensum:${slug}:plan`;
}

/** courseId -> term code ("202710"). New-design-only (§9 planner); the
 * legacy explorer never reads or writes this key. */
export type PlannedByTerm = Record<string, string>;

export function loadPlannedFromStorage(slug: string): PlannedByTerm {
  try {
    const raw = localStorage.getItem(plannedKey(slug));
    return raw ? (JSON.parse(raw) as PlannedByTerm) : {};
  } catch {
    return {};
  }
}

export function savePlannedToStorage(slug: string, planned: PlannedByTerm) {
  try {
    localStorage.setItem(plannedKey(slug), JSON.stringify(planned));
  } catch {
    /* storage unavailable */
  }
}

export function loadApprovedFromStorage(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveApprovedToStorage(slug: string, approved: Set<string>) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify([...approved]));
  } catch {
    // storage unavailable (private mode, etc.) - state just won't persist
  }
}

export type ElectiveAssignments = Record<string, ElectiveAssignment>;

export function loadElectivesFromStorage(slug: string): ElectiveAssignments {
  try {
    const raw = localStorage.getItem(electivesKey(slug));
    return raw ? (JSON.parse(raw) as ElectiveAssignments) : {};
  } catch {
    return {};
  }
}

export function saveElectivesToStorage(slug: string, assignments: ElectiveAssignments) {
  try {
    localStorage.setItem(electivesKey(slug), JSON.stringify(assignments));
  } catch {
    /* storage unavailable */
  }
}

export function loadAttestationsFromStorage(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(attestKey(slug));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function saveAttestationsToStorage(slug: string, ids: Set<string>) {
  try {
    localStorage.setItem(attestKey(slug), JSON.stringify([...ids]));
  } catch {
    /* storage unavailable */
  }
}

/** Wipe all progress for one plan (approved courses + elective picks + requisitos). */
export function resetProgress(slug: string) {
  for (const k of [storageKey(slug), electivesKey(slug), attestKey(slug), plannedKey(slug)]) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** The slug already lives in the path, so the hash only carries the state. */
export function loadApprovedFromHash(): Set<string> | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const csv = params.get("aprobadas");
  if (csv == null) return null;
  try {
    return new Set(csv ? decodeURIComponent(csv).split(",") : []);
  } catch {
    return null;
  }
}

export function loadElectivesFromHash(): ElectiveAssignments | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const raw = params.get("electivas");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as ElectiveAssignments;
  } catch {
    return null;
  }
}

export function loadAttestationsFromHash(): Set<string> | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const raw = params.get("requisitos");
  if (raw == null) return null;
  try {
    return new Set(raw ? decodeURIComponent(raw).split(",") : []);
  } catch {
    return null;
  }
}

export function buildShareUrl(
  approved: Set<string>,
  assignments: ElectiveAssignments,
  attestations: Set<string>
): string {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set("aprobadas", encodeURIComponent([...approved].join(",")));
  if (Object.keys(assignments).length > 0) {
    params.set("electivas", btoa(unescape(encodeURIComponent(JSON.stringify(assignments)))));
  }
  if (attestations.size > 0) {
    params.set("requisitos", encodeURIComponent([...attestations].join(",")));
  }
  url.hash = params.toString();
  return url.toString();
}
