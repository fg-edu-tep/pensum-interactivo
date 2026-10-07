// Append-only audit trail for admin mutations. Call after a successful write.
//
// Actor resolution: if the caller doesn't pass an explicit `actor`, we read the
// logged-in username from the signed session cookie (currentActor). This keeps
// every existing call site attributing to the real user with no change needed.
// Routes that act before/without a session (login, setup) pass `actor` directly.

import { prisma } from "./db";
import { currentActor } from "./auth/actor";

export async function writeAudit(entry: {
  actor?: string;
  action: string; // "catalog.update" | "course.update" | "import.apply" | ...
  entityType: string; // "Catalog" | "CatalogCourse" | "AdminUser" | ...
  entityId: string | number;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const actor = entry.actor ?? (await currentActor());
    await prisma.auditLog.create({
      data: {
        actor,
        action: entry.action,
        entityType: entry.entityType,
        entityId: String(entry.entityId),
        before: (entry.before ?? undefined) as object | undefined,
        after: (entry.after ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    // never let audit failure break the mutation it records
    console.error("writeAudit failed", err);
  }
}
