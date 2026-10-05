// Phase B0 — validation of a whole plan's requirement graph (pure).
//
// Reject (breaks the student view): prerequisite cycles, self-reference,
// semester < 1, sortIndex collisions.
// Warn (may be legitimate): unknown code (not a plan course, not in the Registro
// dictionary), a prerequisite placed in a later semester than its dependent.

import { isTokenCode } from "../registro/requirements";

/**
 * Is this code acceptable without asking the admin? A plan course, a Registro
 * dictionary entry, an exam/equivalence token (ENGL7), or a lab/practice companion
 * ("FISI1518P") whose base course is known.
 */
export function isKnownCode(code: string, inPlan: ReadonlySet<string>, dictionary: ReadonlySet<string> | null | undefined): boolean {
  if (inPlan.has(code) || isTokenCode(code)) return true;
  if (!dictionary) return true; // nothing to validate against
  if (dictionary.has(code)) return true;
  const base = /^([A-ZÑ]+\d{3,4})[A-Z]$/.exec(code)?.[1];
  return !!base && (inPlan.has(base) || dictionary.has(base));
}

export interface PlanNode {
  /** normalised code; placeholders have none and take no part in the graph */
  code: string;
  semester: number;
  prereqs: string[];
  coreqs: string[];
}

export interface Issue {
  severity: "error" | "warning";
  kind:
    | "cycle"
    | "self-reference"
    | "bad-semester"
    | "sort-collision"
    | "unknown-code"
    | "prereq-after-dependent";
  code?: string;
  message: string;
  /** for cycles: the path A -> B -> ... -> A */
  path?: string[];
}

/** First prerequisite cycle found, as a closed path, or null. Iterative DFS. */
export function findPrereqCycle(nodes: PlanNode[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.code, n.prereqs);
  const state = new Map<string, 0 | 1 | 2>(); // 1 = on stack, 2 = done
  for (const start of adj.keys()) {
    if (state.get(start)) continue;
    const stack: { code: string; next: number }[] = [{ code: start, next: 0 }];
    const path: string[] = [start];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const out = adj.get(top.code) ?? [];
      if (top.next >= out.length) {
        state.set(top.code, 2);
        stack.pop();
        path.pop();
        continue;
      }
      const to = out[top.next++];
      if (!adj.has(to)) continue; // external code: no outgoing edges
      const s = state.get(to);
      if (s === 1) return [...path.slice(path.indexOf(to)), to];
      if (!s) {
        state.set(to, 1);
        stack.push({ code: to, next: 0 });
        path.push(to);
      }
    }
  }
  return null;
}

/** Would adding "dependent requires prereq" close a cycle? Returns the path or null. */
export function wouldCreateCycle(nodes: PlanNode[], dependent: string, prereq: string): string[] | null {
  if (dependent === prereq) return [dependent, dependent];
  return findPrereqCycle(
    nodes.map((n) => (n.code === dependent ? { ...n, prereqs: [...n.prereqs, prereq] } : n))
  );
}

export interface ValidateOptions {
  /** codes known to the Registro dictionary (null = no dictionary available) */
  dictionary?: ReadonlySet<string> | null;
  /** (catalogId-scoped) sortIndex per row, to catch collisions */
  sortIndexes?: number[];
}

export function validatePlan(nodes: PlanNode[], opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const inPlan = new Set(nodes.map((n) => n.code));
  const semOf = new Map(nodes.map((n) => [n.code, n.semester]));

  for (const n of nodes) {
    if (!Number.isInteger(n.semester) || n.semester < 1)
      issues.push({ severity: "error", kind: "bad-semester", code: n.code, message: `${n.code}: semestre inválido (${n.semester})` });
    for (const [list, label] of [[n.prereqs, "prerrequisito"], [n.coreqs, "correquisito"]] as const) {
      for (const c of list) {
        if (c === n.code)
          issues.push({ severity: "error", kind: "self-reference", code: n.code, message: `${n.code} es su propio ${label}` });
        else if (!isKnownCode(c, inPlan, opts.dictionary))
          issues.push({ severity: "warning", kind: "unknown-code", code: c, message: `${c} (${label} de ${n.code}) no está en el plan ni en el Registro` });
      }
    }
    for (const c of n.prereqs) {
      const s = semOf.get(c);
      if (s !== undefined && c !== n.code && s > n.semester)
        issues.push({ severity: "warning", kind: "prereq-after-dependent", code: n.code, message: `${c} (sem ${s}) es prerrequisito de ${n.code} (sem ${n.semester})` });
    }
  }

  const cycle = findPrereqCycle(nodes.map((n) => ({ ...n, prereqs: n.prereqs.filter((c) => c !== n.code) })));
  if (cycle) issues.push({ severity: "error", kind: "cycle", path: cycle, message: `Ciclo de prerrequisitos: ${cycle.join(" → ")}` });

  if (opts.sortIndexes) {
    const seen = new Set<number>();
    for (const s of opts.sortIndexes) {
      if (seen.has(s)) issues.push({ severity: "error", kind: "sort-collision", message: `sortIndex repetido: ${s}` });
      seen.add(s);
    }
  }
  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");
