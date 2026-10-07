// Phase B0 — batch-operation types shared by the canvas (client) and the B1
// batch endpoint (server). Types only; applying them is B1.

export type RequirementKind = "prereq" | "coreq";

export type MapOp =
  /** put a course in a semester at a row (`position` = 0-based row among that semester's other courses) */
  | { op: "move"; courseId: number; semester: number; position: number }
  /** replace one course's whole requirement; the server regenerates text + tree from the model */
  | { op: "setRequirement"; courseId: number; kind: RequirementKind; model: import("./model").ReqModel };

export interface MapBatch {
  catalogSlug: string;
  /** CatalogCourse.id -> rowVersion() the batch was built from (optimistic concurrency) */
  versions: Record<number, string>;
  /** orderVersion() of the plan; required when the batch contains a move */
  orderVersion?: string;
  ops: MapOp[];
  /** user confirmed codes outside the Registro dictionary */
  allowUnknown?: string[];
}
