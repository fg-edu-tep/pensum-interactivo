# Branches, databases and releases

> **Release target:** the **MySQL monolith** (`mysql-migration`), packaged with
> Docker, is what will officially ship (university IT requirement).
> **`main` on Vercel/Neon (Postgres) is temporary** — it exists only so Mauricio
> can preview the app. Treat `mysql-migration` as the source of truth; `main`
> follows it minus the database layer.

## Branch roles

| Branch | Database | Role |
|---|---|---|
| `mysql-migration` | MySQL 8.4 | **Official release line.** Everything lands here first. |
| `main` | Postgres (Neon) | Temporary Vercel preview for Mauricio. Mirrors `mysql-migration` except the DB files below. |
| `design-proposals` | MySQL | Staging for design experiments; merged into `mysql-migration` when accepted (rollback = switch branch). |
| `ui-redesign`, `ui-redesign-phase2` | – | Historical, already merged into `main`. |

## What differs between `mysql-migration` and `main`

Only the database layer (everything else must be byte-identical):

| File / path | `mysql-migration` | `main` |
|---|---|---|
| `web/prisma/schema.prisma` | `provider = "mysql"`, single `DATABASE_URL`, `@db.Text` / `@db.VarChar(500)` on free-text fields | `provider = "postgresql"`, `DATABASE_URL` + `DIRECT_URL` (Neon pooled/direct) |
| `web/prisma/migrations/` | `20260924030026_init_mysql` (Postgres one archived as `_archive…`) | `20260907124923_init_postgres` |
| `web/prisma/migrations/migration_lock.toml` | `mysql` | `postgresql` |
| `docker-compose.yml` | `mysql:8.4` (`pensum`/`pensum`/`pensum`, root `pensum`, volume `pensum-mysqldata`) | `postgres:16-alpine` |
| `web/.env.example` | MySQL `DATABASE_URL` | Postgres `DATABASE_URL`/`DIRECT_URL` (+ `OFFERINGS_TERM="auto"`) |
| `web/scripts/inspect.ts` | MySQL raw-SQL syntax | Postgres syntax |
| `CLAUDE.md`, `.claude/PLAN.md`, `.claude/PROGRESS.md` | MySQL wording | Postgres/Neon wording |

The 2026-10 design pass touches **none** of the database layer (no schema or
migration changes), which is why it carries to `main` unchanged.

## Syncing the two branches

Direction is always **`mysql-migration` → `main`**.

1. Merge/fast-forward the work into `mysql-migration` first.
2. Create a branch from `main` and take the tree of `mysql-migration` **except**
   the database files in the table above:
   ```bash
   git switch -c main-sync main
   git checkout mysql-migration -- . ':!web/prisma' ':!docker-compose.yml' \
       ':!CLAUDE.md' ':!.claude' ':!web/scripts/inspect.ts' ':!web/.env.example'
   # then re-apply the intentional env.example differences by hand
   ```
   (deleted files need `git rm`; check `git status`). Never let `schema.prisma`,
   `migrations/` or `docker-compose.yml` cross over.
3. Verify the Postgres side in a **separate worktree with its own
   `node_modules`** — `prisma generate` writes into `node_modules/.prisma`, so
   running it on the Postgres schema in the shared checkout silently breaks the
   MySQL dev setup.
4. Merge `main-sync` into `main`. Pushing `main` is what triggers Vercel (the
   production project deploys from the `fg-edu-tep/pensum-interactivo` fork, via
   PR mirrored from `main`).

## MySQL release (monolith)

Local development
```bash
docker compose up -d db          # mysql:8.4, port 3306
cd web
cp .env.example .env             # DATABASE_URL="mysql://pensum:pensum@localhost:3306/pensum"
npm install && npx prisma generate
npm run db:deploy                # applies migrations/20260924030026_init_mysql
npm run seed                     # DB from the two .xlsx + live API (~60 s)
npm run scrape:desc              # course descriptions (smartcatalogiq)
npm run dev
```
Notes
- A database previously created with `prisma db push` has no `_prisma_migrations`
  history; either re-baseline or start from a fresh volume.
- Free-text columns are `VARCHAR(500)` / `TEXT` to avoid MySQL's default
  `VARCHAR(191)` truncation (real values exceed 191 characters).
- **Dockerfile + `web` service are not written yet** (plan item P3). The release
  needs: a multi-stage Node 22 image running `prisma migrate deploy` then
  `next start`, a compose `web` service depending on `db: service_healthy`, and a
  one-shot `seed` service. This is the main remaining work for the official
  release.

## Environment variables that matter

| Var | Meaning |
|---|---|
| `DATABASE_URL` | MySQL (release) or pooled Postgres (Vercel) |
| `DIRECT_URL` | Postgres/Neon only — direct connection for `prisma migrate` |
| `OFFERINGS_TERM` | `auto` (default: live API → calendar) or a pinned `YYYYPP`. **Vercel still pins `202620`.** |
| `SESSION_SECRET`, `ADMIN_PASSWORD` | admin panel auth |
| `UNIANDES_API_URL` | offering API (details URL derived from it) |
| `MIHORARIO_URL` | Mi Horario base URL for the "Armar horario" links |

## Operational runbooks

- **Term rollover:** the planner follows the calendar automatically; refresh
  offerings/prereqs with `npm run seed` (non-destructive) each term.
- **Course re-derive from Excel:** `SEED_REBUILD_COURSES=1 npm run seed` **discards
  manual slot rebinds** (see the Análoga note in
  [`2026-10-design-pass.md`](2026-10-design-pass.md) §8). Fix the pensum Excel first.
- **Descriptions:** `npm run scrape:desc` (or admin → Descripciones).
- **The Uniandes API:** `curl` is blocked by Cloudflare (403); Node `fetch` works.
  `term` blank returns the current offering term.

## Deploying `main` to Vercel (temporary preview)

- Postgres/Neon only; do **not** run `SEED_REBUILD_COURSES=1` against Neon without
  re-applying the 2026-09-24 hand patches (see `.claude/PROGRESS.md`).
- Set `OFFERINGS_TERM` to `auto` (or remove it) in Vercel to follow the API.
- Prod descriptions are empty until synced from the admin panel; the basket modal
  then shows "Aún no tenemos la descripción de este curso".
- The new `/api/sections` route calls the Uniandes API server-side; confirm it
  responds from Vercel's egress (the existing electives route already does).
