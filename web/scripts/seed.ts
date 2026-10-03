// Populates a fresh DB from the two source spreadsheets. Replaces the old
// app/scripts/build-data.mjs. Idempotent: re-running upserts catalogs/courses
// and recreates catalog_course rows.
//
//   SEED_DIR=..  npm run seed          (local dev, files at repo root)
//   docker compose run --rm seed        (container: SEED_DIR=/repo)

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Load web/.env for local runs. In the container, env comes from the process
// environment (docker-compose env_file), so a missing .env file is fine.
try {
  if (!process.env.DATABASE_URL) process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* no .env file — rely on process env */
}
import { parsePensumWorkbook } from "../lib/import/parsePensumWorkbook";
import { parsePrereqExport } from "../lib/import/parsePrereqExport";
import { persistParsedCatalog } from "../lib/import/persistCatalog";
import { parseElectivesWorkbook } from "../lib/import/parseElectivesWorkbook";
import { identityForSlug } from "../lib/catalogIdentity";
import { rulesForSlug } from "../lib/catalogRules";
import { requirementNodesForSlug } from "../lib/requirementNodes";
import { OfferingsCache } from "../lib/pairing/offeringsCache";
import { prisma, applySqlitePragmas } from "../lib/db";
import { resolveOfferingTerm } from "../lib/termResolve";

function findFile(dir: string, re: RegExp): string {
  const hits = readdirSync(dir).filter((f) => re.test(f));
  if (!hits.length) throw new Error(`No file matching ${re} in ${dir}`);
  if (hits.length > 1) {
    // Directory listing order isn't a reliable tie-breaker across filesystems
    // — pick deterministically (prefer "Excel_Registro", the canonical master
    // export) and say so loudly rather than silently depending on FS order.
    const preferred = hits.find((f) => /^Excel_Registro/i.test(f)) ?? hits.sort()[0];
    console.warn(
      `  ! multiple files match ${re} in ${dir}: ${hits.join(", ")} — using "${preferred}". ` +
        `Remove the stale one(s) to silence this.`
    );
    return join(dir, preferred);
  }
  return join(dir, hits[0]);
}

async function main() {
  const seedDir = resolve(process.cwd(), process.env.SEED_DIR ?? "..");
  const resolved = await resolveOfferingTerm();
  const term = resolved.term;
  if (resolved.source !== "env" && term !== resolved.dateTerm) {
    console.warn(`  ! API offering term ${term} differs from the calendar's ${resolved.dateTerm} (next term's registration is probably open).`);
  }
  const pair = process.env.SEED_SKIP_PAIRING !== "1";
  const fetchDetails = pair && process.env.SEED_SKIP_DETAILS !== "1";
  // A plain re-seed is now non-destructive: it will NOT overwrite Catalog.rules /
  // identity / requirement nodes, nor rebuild CatalogCourse rows, once a catalog
  // exists. Force with these when you really mean to re-derive from the Excel.
  const resetMeta = process.env.SEED_RESET_META === "1";
  const rebuildCourses = process.env.SEED_REBUILD_COURSES === "1";

  const pensumPath = findFile(seedDir, /^PENSUMS.*\.xlsx$/i);
  // "Excel_Registro.xlsx" is the canonical Banner/Registro master export as of
  // 2026-09; "PRERREQUISITOS*.xlsx" is the older pre-filtered single-term name
  // — both match so a re-export under either naming convention still seeds.
  const prereqPath = findFile(seedDir, /^(PRERREQUISITOS|Excel_Registro).*\.xlsx$/i);
  console.log(`seed dir : ${seedDir}`);
  console.log(`pensum   : ${pensumPath}`);
  console.log(`prereqs  : ${prereqPath}`);
  console.log(
    `term     : ${term} (${resolved.source})   pairing: ${pair ? "on" : "off"}   courseDetails: ${
      fetchDetails ? "on" : "off"
    }`
  );
  console.log(
    `mode     : ${
      resetMeta || rebuildCourses
        ? `re-derive from Excel (${[resetMeta && "meta", rebuildCourses && "courses"]
            .filter(Boolean)
            .join("+")})`
        : "bootstrap only (existing catalogs left untouched)"
    }`
  );

  await applySqlitePragmas();

  const catalogs = parsePensumWorkbook(readFileSync(pensumPath));
  const prereqMap = parsePrereqExport(readFileSync(prereqPath), term);
  console.log(`\nparsed ${catalogs.length} catalogs, ${prereqMap.size} prereq rows\n`);

  const cache = new OfferingsCache();
  for (const parsed of catalogs) {
    if (parsed.warnings.length) {
      console.log(`  ! ${parsed.slug} warnings:`);
      for (const w of parsed.warnings.slice(0, 10)) console.log(`      - ${w}`);
    }
    const maxSemester = parsed.courses.reduce((m, c) => Math.max(m, c.semester), 0);
    const id = identityForSlug(parsed.slug);
    const res = await persistParsedCatalog(parsed, prereqMap, {
      status: "published",
      term,
      sourceFilename: pensumPath.split("/").pop(),
      pair,
      fetchDetails,
      cache,
      identity: {
        accentColor: id.accentColor,
        tagline: id.tagline,
        imagePath: id.imagePath,
        subtitle: maxSemester ? `CBU3 · ${maxSemester} semestres` : "CBU3",
      },
      rules: rulesForSlug(parsed.slug),
      requirementNodes: requirementNodesForSlug(parsed.slug),
      resetMeta,
      rebuildCourses,
    });
    console.log(
      `  ✓ ${res.slug.padEnd(14)} ${String(res.courseCount).padStart(3)} courses` +
        `${res.rebuilt ? "" : " (kept)"}  ` +
        `auto=${res.pairing.auto_paired} not_offered=${res.pairing.not_offered} ` +
        `manual=${res.pairing.needs_manual} pool=${res.pairing.placeholder_pool} ` +
        `sync_failed=${res.pairing.sync_failed} details=${res.detailsPaired}` +
        (res.apiFailureRate > 0 ? `  (api fail ${(res.apiFailureRate * 100).toFixed(0)}%)` : "")
    );
  }

  // ---- electives bag (Custom_Pensum/electivas/*.xlsx) ----
  const electivesDir = resolve(seedDir, process.env.ELECTIVAS_DIR ?? "electivas");
  let electiveFiles: string[] = [];
  try {
    electiveFiles = readdirSync(electivesDir)
      .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"))
      .map((f) => join(electivesDir, f));
  } catch {
    console.log(`\nno electives dir at ${electivesDir} — skipping electives`);
  }

  if (electiveFiles.length) {
    console.log(`\nelectives dir : ${electivesDir}`);
    const parsedElectives = parseElectivesWorkbook(
      electiveFiles.map((p) => ({ name: p.split("/").pop() ?? p, buffer: readFileSync(p) }))
    );
    let withTerm = 0;
    for (const e of parsedElectives) {
      if (e.offeredTerms.includes(term)) withTerm += 1;
      await prisma.elective.upsert({
        where: { normalizedName: e.normalizedName },
        create: {
          name: e.name,
          normalizedName: e.normalizedName,
          level: e.level,
          ciclo: e.ciclo,
          roles: e.roles as object,
          isCursoIntegrador: e.isCursoIntegrador,
          offeredTerms: e.offeredTerms,
          sourceFiles: e.sourceFiles,
        },
        update: {
          name: e.name,
          level: e.level,
          ciclo: e.ciclo,
          roles: e.roles as object,
          // the integrador flag is admin-editable — Excel only sets it on first
          // insert (or with SEED_RESET_META=1)
          ...(resetMeta ? { isCursoIntegrador: e.isCursoIntegrador } : {}),
          offeredTerms: e.offeredTerms,
          sourceFiles: e.sourceFiles,
        },
      });
    }
    console.log(
      `  ✓ ${String(parsedElectives.length).padStart(3)} electives  (${withTerm} ofertadas en ${term})`
    );
  }

  console.log("\ndone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
