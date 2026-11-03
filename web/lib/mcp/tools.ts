// The MCP tools: course-level reads and requirement edits, nothing else (no
// users, no imports, no super-panel). Every write goes through
// lib/courseRequirements.ts, which audits it under the token's user.

import { prisma } from "../db";
import {
  getCourseRequirements,
  searchCourses,
  setCourseRequirement,
  setRequirementOverride,
  type ReqField,
} from "../courseRequirements";
import { buildDiscrepancyReports } from "../discrepancy/service";

export interface ToolContext {
  /** admin username the token belongs to (audit actor) */
  actor: string;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

export class ToolInputError extends Error {}

const SYNTAX =
  'Requirement syntax: course codes like "IELE 1010" joined with Y (and) / O (or) and parentheses, ' +
  'e.g. "IELE 1010 Y (MATE 1203 O MATE 1214)". A trailing * marks a requirement that may be taken at the same time ("FISI 1018*"). ' +
  "Lowercase and AND/OR are accepted. An empty string means no requirement.";

const PLANS_PROP = {
  type: "array",
  items: { type: "string" },
  description: "Plan slugs to change (see list_plans). Omit to apply to every active plan that contains the course.",
};

function str(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (v == null || v === "") {
    if (required) throw new ToolInputError(`Falta el parámetro "${key}".`);
    return "";
  }
  if (typeof v !== "string") throw new ToolInputError(`"${key}" debe ser texto.`);
  return v;
}

function plans(args: Record<string, unknown>): string[] | undefined {
  const v = args.plans;
  if (v == null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ToolInputError(`"plans" debe ser una lista de slugs.`);
  return v.length ? (v as string[]) : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (v == null) return undefined;
  if (typeof v !== "boolean") throw new ToolInputError(`"${key}" debe ser true o false.`);
  return v;
}

/** "" is a real value (no requirement), so a missing key must not read as one. */
function requirementArg(args: Record<string, unknown>): string {
  const v = args.requirement;
  if (typeof v !== "string") throw new ToolInputError(`Falta el parámetro "requirement" (usa "" para dejar el curso sin requisito).`);
  return v;
}

function setTool(field: ReqField): ToolDef {
  const noun = field === "prereq" ? "prerequisites" : "corequisites";
  return {
    name: field === "prereq" ? "set_prerequisites" : "set_corequisites",
    title: field === "prereq" ? "Cambiar prerrequisitos" : "Cambiar correquisitos",
    description:
      `Replace a course's ${noun} in its pensum plans. ${SYNTAX}\n` +
      "If the new value differs from the official Uniandes API and `override` is not given, NOTHING is saved: the result has " +
      "needsDecision=true and the differences. Show them to the user and ask whether students should see this value instead " +
      "of the API (override=true) or whether it is only a fallback while the API keeps priority (override=false). " +
      "Use dry_run=true to preview without saving. Every change is recorded in the admin audit log under the token's user.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: 'Course code, e.g. "IELE 2100".' },
        requirement: { type: "string", description: `The new ${noun} expression ("" = none).` },
        plans: PLANS_PROP,
        override: {
          type: "boolean",
          description: "true: students see this value even when the API says otherwise. false: the API keeps priority. Omit to keep each plan's current setting.",
        },
        dry_run: { type: "boolean", description: "Preview only: parse, compare with the API, save nothing." },
      },
      required: ["code", "requirement"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: (args, ctx) =>
      setCourseRequirement({
        code: str(args, "code"),
        field,
        text: requirementArg(args),
        plans: plans(args),
        override: bool(args, "override"),
        dryRun: bool(args, "dry_run") ?? false,
        actor: ctx.actor,
        via: "mcp",
      }),
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_plans",
    title: "Planes",
    description: "List the pensum plans (slug, name, status, the term whose API data they use).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () =>
      prisma.catalog.findMany({
        orderBy: { slug: "asc" },
        select: { slug: true, programName: true, variantLabel: true, status: true, term: true },
      }),
  },
  {
    name: "search_courses",
    title: "Buscar cursos",
    description: "Find courses of the pensum plans by code or name (accents ignored). Returns code, name and the plans that contain it.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: 'Code or part of the name, e.g. "IELE 21" or "señales".' } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (args) => searchCourses(str(args, "query")),
  },
  {
    name: "get_course_requirements",
    title: "Ver requisitos de un curso",
    description:
      "A course's prerequisites and corequisites in every plan that contains it: the plan's own value (document), the official " +
      "Uniandes API value for the plan's term, whether an admin override is on, and what students actually see. " +
      "Students see the API first; the document is only a fallback unless override is on. Call this before changing anything.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: 'Course code, e.g. "IELE 2100".' }, plans: PLANS_PROP },
      required: ["code"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const code = str(args, "code");
      return (await getCourseRequirements(code, plans(args))) ?? { error: `El curso ${code} no está en ningún plan activo.` };
    },
  },
  setTool("prereq"),
  setTool("coreq"),
  {
    name: "set_requirement_override",
    title: "Reemplazo de la API",
    description:
      "Turn the admin override on or off without changing the text. On: students see the plan's own value instead of the " +
      "official API (an empty value then means no requirement). Off: the API has priority again. Audited.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: 'Course code, e.g. "IELE 2100".' },
        field: { type: "string", enum: ["prereq", "coreq"], description: "prereq = prerequisites, coreq = corequisites." },
        enabled: { type: "boolean" },
        plans: PLANS_PROP,
      },
      required: ["code", "field", "enabled"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: (args, ctx) => {
      const field = str(args, "field");
      if (field !== "prereq" && field !== "coreq") throw new ToolInputError(`"field" debe ser "prereq" o "coreq".`);
      const enabled = bool(args, "enabled");
      if (enabled === undefined) throw new ToolInputError(`Falta el parámetro "enabled".`);
      return setRequirementOverride({ code: str(args, "code"), field, enabled, plans: plans(args), actor: ctx.actor, via: "mcp" });
    },
  },
  {
    name: "list_requirement_differences",
    title: "Diferencias con la API",
    description:
      "Courses whose plan value differs from the official API (warnings), plus courses with an admin override. " +
      "Same data as the Discrepancias page of the admin panel.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "One plan slug; omit for all plans." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const plan = str(args, "plan", false);
      const reports = await buildDiscrepancyReports(plan ? [plan] : undefined);
      return reports.map((r) => ({
        plan: r.slug,
        term: r.term,
        courses: r.courses.flatMap((c) =>
          [c.prereq, c.coreq]
            .filter((f) => f.severity === "warn" || f.status === "overridden")
            .map((f) => ({
              code: c.displayCode,
              name: c.name,
              field: f.field,
              status: f.status,
              document: f.documentText,
              api: f.apiText,
              studentsSee: f.visibleText,
            }))
        ),
      }));
    },
  },
];
