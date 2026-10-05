// Version hashes for optimistic concurrency (server + tests only: uses node:crypto).
import { createHash } from "node:crypto";
import { canon, type PlanRow } from "./plan";

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/** Version of everything a batch can change in one row. */
export function rowVersion(r: PlanRow): string {
  return sha(
    canon([r.semester, r.sortIndex, r.prereqText, r.coreqText, r.prereqTree, r.coreqTree, [...r.lockedFields].sort()])
  );
}

/** Version of the plan's layout (which row is where). */
export function orderVersion(rows: PlanRow[]): string {
  return sha(rows.map((r) => `${r.id}:${r.semester}:${r.sortIndex}`).sort().join("|"));
}
