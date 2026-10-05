// Registro wizard: analysis (what needs a human decision) and link planning
// (what would change in each catalog course). Pure — the DB is read by the
// caller and passed in as CatalogInput[], so everything here is unit-testable.

import { parseRequirement } from "../import/requirementParser";
import { normalizeName, tokenSetRatio } from "../import/textMatch";
import {
  isTokenCode,
  parseCoreq,
  referencedCodes,
  renderRegistroExpr,
  rewriteTree,
  sameTree,
} from "./requirements";
import type {
  CatalogCourseInput,
  CatalogInput,
  DictionaryEntry,
  Resolution,
  UnresolvedItem,
} from "./types";

export type Resolutions = Record<string, Resolution>;

const uniq = <T,>(a: T[]) => [...new Set(a)];

interface Bound {
  slug: string;
  course: CatalogCourseInput;
}

function boundIndex(catalogs: CatalogInput[]): Map<string, Bound[]> {
  const m = new Map<string, Bound[]>();
  for (const cat of catalogs) {
    for (const c of cat.courses) {
      if (c.isPlaceholder || !c.code) continue;
      const list = m.get(c.code) ?? [];
      list.push({ slug: cat.slug, course: c });
      m.set(c.code, list);
    }
  }
  return m;
}

/** Nearest registro entries to a name — offered as suggestions for an orphaned code. */
function suggest(name: string, entries: Map<string, DictionaryEntry>, limit = 3) {
  return [...entries.values()]
    .map((e) => ({ code: e.code, displayCode: e.displayCode, name: e.name, score: tokenSetRatio(name, e.name) }))
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export function analyzeRegistro(
  entries: Map<string, DictionaryEntry>,
  catalogs: CatalogInput[]
): UnresolvedItem[] {
  const bound = boundIndex(catalogs);
  const items: UnresolvedItem[] = [];

  // 1. bound-missing
  for (const [code, uses] of bound) {
    if (entries.has(code)) continue;
    items.push({
      key: `bound-missing:${code}`,
      kind: "bound-missing",
      severity: "action",
      code,
      catalogs: uniq(uses.map((u) => u.slug)),
      detail: {
        name: uses[0].course.name,
        displayCode: uses[0].course.displayCode,
        suggestions: suggest(uses[0].course.name, entries),
      },
      allowed: ["keep", "rebind"],
    });
  }

  // 2. ref-missing + token-nocourse — only references made by courses that
  //    are actually bound in a catalog (others are noise for the pensum).
  //    A missing reference BLOCKS (severity "action") only when a department
  //    (core) course makes it; retired alternatives inside another department's
  //    expression (e.g. IIND2401 lists a dozen) are informational — keeping them
  //    verbatim is exactly what the registro says.
  const refMissing = new Map<string, Set<string>>();
  const tokens = new Map<string, Set<string>>();
  for (const code of bound.keys()) {
    const e = entries.get(code);
    if (!e) continue;
    for (const ref of referencedCodes(e.prereqText, e.coreqText)) {
      if (isTokenCode(ref)) {
        (tokens.get(ref) ?? tokens.set(ref, new Set()).get(ref)!).add(code);
      } else if (!entries.has(ref) && !bound.has(ref)) {
        (refMissing.get(ref) ?? refMissing.set(ref, new Set()).get(ref)!).add(code);
      }
    }
  }
  const slugsOf = (codes: Set<string>) => uniq([...codes].flatMap((c) => (bound.get(c) ?? []).map((u) => u.slug)));
  for (const [ref, by] of [...refMissing].sort(([a], [b]) => a.localeCompare(b))) {
    const coreBy = [...by].filter((c) => entries.get(c)?.isCore).sort();
    items.push({
      key: `ref-missing:${ref}`,
      kind: "ref-missing",
      severity: coreBy.length ? "action" : "info",
      code: ref,
      catalogs: slugsOf(by),
      detail: { referencedBy: [...by].sort(), coreReferencedBy: coreBy },
      allowed: ["keep", "replace", "drop"],
    });
  }
  for (const [tok, by] of [...tokens].sort(([a], [b]) => a.localeCompare(b))) {
    items.push({
      key: `token-nocourse:${tok}`,
      kind: "token-nocourse",
      severity: "info",
      code: tok,
      catalogs: slugsOf(by),
      detail: { referencedBy: [...by].sort() },
      allowed: ["accept"],
    });
  }

  // 3. drift (per code, across catalogs)
  for (const [code, uses] of [...bound].sort(([a], [b]) => a.localeCompare(b))) {
    const e = entries.get(code);
    if (!e) continue;
    const nameDiffs = uses.filter((u) => normalizeName(u.course.name) !== normalizeName(e.name));
    if (e.name && nameDiffs.length) {
      items.push({
        key: `name-drift:${code}`,
        kind: "name-drift",
        severity: "info",
        code,
        catalogs: uniq(nameDiffs.map((u) => u.slug)),
        detail: { registro: e.name, catalog: uniq(nameDiffs.map((u) => u.course.name)) },
        allowed: ["keep", "use-registro"],
      });
    }
    const credDiffs = uses.filter((u) => e.credits != null && u.course.credits !== e.credits);
    if (credDiffs.length) {
      items.push({
        key: `credits-drift:${code}`,
        kind: "credits-drift",
        severity: "info",
        code,
        catalogs: uniq(credDiffs.map((u) => u.slug)),
        detail: { registro: e.credits, catalog: uniq(credDiffs.map((u) => u.course.credits)) },
        allowed: ["keep", "use-registro"],
      });
    }
  }

  // 4. placeholder slots (informational, one per catalog)
  for (const cat of catalogs) {
    const ph = cat.courses.filter((c) => c.isPlaceholder);
    if (!ph.length) continue;
    const byKind: Record<string, number> = {};
    for (const p of ph) byKind[p.placeholderKind ?? "SLOT"] = (byKind[p.placeholderKind ?? "SLOT"] ?? 0) + 1;
    items.push({
      key: `placeholder-slot:${cat.slug}`,
      kind: "placeholder-slot",
      severity: "info",
      catalogs: [cat.slug],
      detail: { count: ph.length, byKind },
      allowed: ["keep"],
    });
  }

  return items;
}

/** The decision for an item: the admin's, else the first allowed action. */
export function effectiveResolution(item: UnresolvedItem, resolutions: Resolutions): Resolution {
  return resolutions[item.key] ?? ({ action: item.allowed[0] } as Resolution);
}

/** Action-severity items the admin has not decided yet. */
export function pendingDecisions(items: UnresolvedItem[], resolutions: Resolutions): UnresolvedItem[] {
  return items.filter((i) => i.severity === "action" && !resolutions[i.key]);
}

/** Checks resolutions against the items and dictionary; returns human-readable errors. */
export function validateResolutions(
  items: UnresolvedItem[],
  resolutions: Resolutions,
  entries: Map<string, DictionaryEntry>
): string[] {
  const errors: string[] = [];
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const [key, r] of Object.entries(resolutions)) {
    const item = byKey.get(key);
    if (!item) {
      errors.push(`Decisión para un elemento desconocido: ${key}`);
      continue;
    }
    if (!item.allowed.includes(r.action)) {
      errors.push(`${key}: la acción "${r.action}" no está permitida (${item.allowed.join(", ")}).`);
      continue;
    }
    if (r.action === "rebind" || r.action === "replace") {
      const target = r.code.toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚ]/g, "");
      if (!entries.has(target)) errors.push(`${key}: el código ${r.code} no existe en el diccionario del registro.`);
      else if (target === item.code) errors.push(`${key}: el código destino es el mismo.`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- link plan

export type LinkField = "prereqText" | "coreqText" | "name" | "credits" | "binding";

export interface LinkChange {
  field: LinkField;
  before: string | number | null;
  after: string | number | null;
  /** the admin deliberately deviated from the registro here (replace / drop /
   * rebind) — apply pins the field in lockedFields so a later run can't undo it */
  override?: true;
}

export interface CourseLinkPlan {
  slug: string;
  catalogCourseId: number;
  displayCode: string;
  code: string;
  /** code the slot will be bound to after apply (differs only for rebinds) */
  targetCode: string;
  changes: LinkChange[];
  /** fields that would change but were held back */
  skipped: { fields: LinkField[]; reason: "manuallyEdited" | "locked" } | null;
  /** no dictionary entry and no rebind: nothing to link */
  noRegistro: boolean;
}

export interface LinkPlan {
  courses: CourseLinkPlan[];
  perCatalog: Record<
    string,
    { linked: number; changed: number; unchanged: number; skipped: number; noRegistro: number }
  >;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const codeKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚ]/g, "");

function expressionFor(
  registroText: string,
  parse: (t: string) => ReturnType<typeof parseRequirement>,
  replace: Map<string, string>,
  drop: Set<string>
) {
  const tree = parse(registroText);
  const codes = new Set<string>();
  const walk = (n: typeof tree) => {
    if (!n) return;
    if (n.op === "COURSE") n.code && codes.add(n.code);
    else n.items?.forEach(walk);
  };
  walk(tree);
  const touched = [...codes].some((c) => replace.has(c) || drop.has(c));
  if (!touched) return { text: registroText, tree, touched: false };
  const next = rewriteTree(tree, replace, drop);
  return { text: renderRegistroExpr(next), tree: next, touched: true };
}

export function planLinks(
  entries: Map<string, DictionaryEntry>,
  catalogs: CatalogInput[],
  items: UnresolvedItem[],
  resolutions: Resolutions,
  opts: { force?: boolean; slugs?: string[] } = {}
): LinkPlan {
  const replace = new Map<string, string>();
  const drop = new Set<string>();
  const rebind = new Map<string, string>();
  const useRegistro = new Set<string>(); // "name:CODE" | "credits:CODE"
  for (const it of items) {
    const r = effectiveResolution(it, resolutions);
    if (it.kind === "ref-missing" && it.code) {
      if (r.action === "replace") replace.set(it.code, codeKey(r.code));
      else if (r.action === "drop") drop.add(it.code);
    } else if (it.kind === "bound-missing" && it.code && r.action === "rebind") {
      rebind.set(it.code, codeKey(r.code));
    } else if ((it.kind === "name-drift" || it.kind === "credits-drift") && it.code && r.action === "use-registro") {
      useRegistro.add(`${it.kind === "name-drift" ? "name" : "credits"}:${it.code}`);
    }
  }

  const courses: CourseLinkPlan[] = [];
  const perCatalog: LinkPlan["perCatalog"] = {};
  const wanted = opts.slugs ? new Set(opts.slugs) : null;

  for (const cat of catalogs) {
    if (wanted && !wanted.has(cat.slug)) continue;
    const sum = (perCatalog[cat.slug] = { linked: 0, changed: 0, unchanged: 0, skipped: 0, noRegistro: 0 });

    for (const c of cat.courses) {
      if (c.isPlaceholder || !c.code) continue;
      const targetCode = rebind.get(c.code) ?? c.code;
      const e = entries.get(targetCode);
      if (!e) {
        courses.push({
          slug: cat.slug, catalogCourseId: c.id, displayCode: c.displayCode, code: c.code,
          targetCode, changes: [], skipped: null, noRegistro: true,
        });
        sum.noRegistro++;
        continue;
      }
      sum.linked++;

      const changes: LinkChange[] = [];
      if (targetCode !== c.code) changes.push({ field: "binding", before: c.code, after: targetCode, override: true });

      const pre = expressionFor(e.prereqText, parseRequirement, replace, drop);
      if (!sameTree(parseRequirement(c.prereqText), pre.tree)) {
        changes.push({
          field: "prereqText", before: norm(c.prereqText) || null, after: norm(pre.text) || null,
          ...(pre.touched ? { override: true as const } : {}),
        });
      }
      const co = expressionFor(e.coreqText, parseCoreq, replace, drop);
      if (!sameTree(parseCoreq(c.coreqText), co.tree)) {
        changes.push({
          field: "coreqText", before: norm(c.coreqText) || null, after: norm(co.text) || null,
          ...(co.touched ? { override: true as const } : {}),
        });
      }
      if (useRegistro.has(`name:${c.code}`) && e.name && normalizeName(e.name) !== normalizeName(c.name)) {
        changes.push({ field: "name", before: c.name, after: e.name });
      }
      if (useRegistro.has(`credits:${c.code}`) && e.credits != null && e.credits !== c.credits) {
        changes.push({ field: "credits", before: c.credits, after: e.credits });
      }

      let skipped: CourseLinkPlan["skipped"] = null;
      let applicable = changes;
      if (changes.length && !opts.force) {
        // the editor pins a slot's code as "displayCode" (see the courses PATCH route)
        const lockedHit = changes.filter((ch) => c.lockedFields.includes(ch.field === "binding" ? "displayCode" : ch.field));
        if (c.manuallyEdited) {
          skipped = { fields: changes.map((ch) => ch.field), reason: "manuallyEdited" };
          applicable = [];
        } else if (lockedHit.length) {
          skipped = { fields: lockedHit.map((ch) => ch.field), reason: "locked" };
          applicable = changes.filter((ch) => !lockedHit.includes(ch));
        }
      }

      if (skipped) sum.skipped++;
      if (applicable.length) sum.changed++;
      else if (!skipped) sum.unchanged++;

      courses.push({
        slug: cat.slug, catalogCourseId: c.id, displayCode: c.displayCode, code: c.code,
        targetCode, changes: applicable, skipped, noRegistro: false,
      });
    }
  }
  return { courses, perCatalog };
}
