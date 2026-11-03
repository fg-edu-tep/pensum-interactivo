# MCP access for admins (course requirements)

An admin can let an AI assistant (Claude on the web or desktop, Google Antigravity, Claude Code)
read and change the **prerequisites and corequisites** of the pensum courses, in their name, through
an [MCP](https://modelcontextprotocol.io) endpoint. Built 2026-11-03 on `feat/mcp-course-tools`.

Scope is deliberately narrow: course-level requirement reads and edits only. No users, no imports,
no catalog structure, no super-panel. Every write lands in the audit log under the token's user.

## Tools

| Tool | Writes? | What it does |
|---|---|---|
| `list_plans` | no | Plan slugs, names, status, and the term whose API data each plan uses |
| `search_courses` | no | Find courses by code or name (accents ignored) |
| `get_course_requirements` | no | Per plan: the plan's own value (document), the API value, whether the override is on, the relation document ↔ API, and **what students actually see** |
| `set_prerequisites` | yes | Replace a course's prerequisites (all active plans, or `plans: [...]`); `override`, `dry_run` |
| `set_corequisites` | yes | Same for corequisites |
| `set_requirement_override` | yes | Turn the override on/off without touching the text |
| `list_requirement_differences` | no | Courses whose plan value differs from the API, plus every override (same data as **Discrepancias**) |

Requirement syntax is the Registro one: codes joined with `Y` / `O` and parentheses, `*` for "may be
taken at the same time" (`IELE 1010 Y (MATE 1203 O MATE 1214)`, `FISI 1018*`). Lowercase, `and`/`or`
and hyphenated lab codes (`IELE-1118L`) are accepted. `""` means "no requirement".

## Warning and override

Students see the **live API first**; the plan's own value is a fallback
([`admin-discrepancies.md`](admin-discrepancies.md)). The edit therefore works in two steps:

1. `set_prerequisites` / `set_corequisites` compares the new value with the API of each plan's term.
   If they differ (or the API confirms "none") and the call did not say `override`, **nothing is
   saved**: the result has `needsDecision: true` and lists, plan by plan, what the API says. The
   server instructions tell the assistant to show this to the admin and ask.
2. The admin decides:
   - `override: true` → saved, and students see this value instead of the API
     (`CatalogCourse.prereqOverride` / `coreqOverride`). With override on, an empty value means
     "no requirement" — the Registro and older terms are not consulted.
   - `override: false` → saved as a fallback only; where the API has data, students keep seeing it.

Values equal to the API, or for courses the API has no data for, save directly. `dry_run: true`
previews (parsed value, differences) without saving.

Refused before anything is written: unparseable text, any code the parser would drop (e.g. a missing
`Y`), a course requiring itself, a **prerequisite cycle** in any affected plan (same rule as the visual
editor — checked on the plans' own values; corequisites may be mutual), unknown course or plan.
Codes not in the database are saved but flagged as a possible typo.

The override lives in the one precedence function (`lib/requirementResolve.ts`, step 0), so the
student payload, the discrepancy report and the admin editor agree. The report shows overrides as a
new status **"Reemplaza a la API"** (info, not warning) while they differ from the API, and as a
plain match once the API catches up. Admins can also set or clear the override in the course editor
(checkbox under each requirement), where corequisites are now editable too.

## Access tokens

Each admin creates their own tokens in **Mi cuenta → Acceso para asistentes (MCP)**: a name, an
expiry (30 / 90 / 365 days or none), max 10 active. The secret (`pmcp_` + 43 chars, 256 random bits)
is shown **once**; only its SHA-256 is stored (`AdminApiToken`). The table shows prefix, last use,
expiry, status, and a **Revocar** button. A token stops working when it is revoked or expires, when
its user is disabled, or while the user has a pending password reset. Creating and revoking tokens
is audited (`token.create`, `token.revoke`).

Two ways to present it:

| Endpoint | Auth | For |
|---|---|---|
| `POST /api/mcp` | `Authorization: Bearer pmcp_…` | Antigravity, Claude Code, anything that sends headers |
| `POST /api/mcp/pmcp_…` | the token **is** the last path segment | Claude web / desktop custom connectors (they take only a URL) |

The URL form is a bearer secret in a URL: it can appear in request logs (Vercel's included). Treat
the URL like a password and revoke the token if it leaks. OAuth (which claude.ai also supports) was
considered and left out for now: it needs an authorization server for a single-department tool.

## Connecting a client

The token panel prints all three snippets with the real host after creating a token.

**Claude (web and desktop)** — Settings → Connectors → *Add custom connector*, paste
`https://<host>/api/mcp/<token>`, no OAuth fields. Custom connectors need a paid Claude plan; on a
Team / Enterprise workspace an owner may have to add it. Desktop and web share the connector.

**Google Antigravity** — Agent panel → *…* → MCP Servers → *Manage MCP Servers* → *View raw config*
(`mcp_config.json`):

```json
{
  "mcpServers": {
    "pensum": {
      "serverUrl": "https://<host>/api/mcp",
      "headers": { "Authorization": "Bearer pmcp_…" }
    }
  }
}
```

**Claude Code** —
`claude mcp add --transport http pensum https://<host>/api/mcp --header "Authorization: Bearer pmcp_…"`.

(Menu names as of November 2026; client UIs move.)

## Protocol

Streamable HTTP, **stateless**: each POST carries one JSON-RPC message (or a batch) and gets
`application/json` back; notifications get `202`; `GET`/`DELETE` → `405` (no server-initiated stream,
no sessions) — which is what fits Vercel functions. Methods: `initialize` (protocol versions
`2025-06-18`, `2025-03-26`, `2024-11-05`), `ping`, `tools/list`, `tools/call`. Tool results are JSON
text; failures return `isError: true` with a Spanish message for input problems, and a generic message
(logged server-side, not leaked) for anything else. A bad or missing token → `401` with
`WWW-Authenticate: Bearer`. No new dependencies: the handler is ~150 lines.

## Code map

| File | Role |
|---|---|
| `web/app/api/mcp/route.ts`, `web/app/api/mcp/[token]/route.ts` | The endpoint (header / URL token); outside `/api/admin` because the admin middleware only knows cookies |
| `web/lib/mcp/server.ts` | JSON-RPC dispatch + HTTP handling |
| `web/lib/mcp/tools.ts` | Tool definitions, argument validation, server instructions |
| `web/lib/courseRequirements.ts` | Read view, parse/validate, cycle check, the audited write, override toggle |
| `web/lib/auth/apiTokens.ts` | Token create / list / revoke / authenticate |
| `web/app/api/admin/account/tokens/**`, `web/app/administrador/(panel)/cuenta/ApiTokens.tsx` | Token panel |
| `web/lib/requirementResolve.ts` | Step 0: override |
| `web/lib/discrepancy/report.ts` | Status `overridden` |
| `web/components/admin/CourseRow.tsx`, `.../courses/[id]/route.ts` | Corequisite field + override checkboxes in the course editor |
| `web/prisma/migrations/20261104120000_mcp_tokens_requirement_override` | `AdminApiToken`, `CatalogCourse.prereqOverride/coreqOverride` |

**MySQL branch (`mysql-migration`)** — needs the same two schema changes as a MySQL migration
(two `BOOLEAN NOT NULL DEFAULT false` columns, the `AdminApiToken` table with a unique `tokenHash`),
along with the still-pending `CatalogCourse.category` column from the 2026-11-02 review.

## Verification (2026-11-03)

- Unit: resolver override (3), report `overridden` (3), input parsing and cycle path (9), protocol and
  tokens (8). Full suite 271 tests: 0 failures without a DB.
- On a scratch Postgres seeded from `datos/`, with a fake API value for MATE 1203: 29/29 end-to-end
  checks over real HTTP. They cover:
  - 401 without, with a wrong, or with a wrong URL token; 405 on GET;
  - `initialize` and `tools/list` with both auth styles;
  - search, view;
  - `needsDecision` with nothing saved;
  - parser drop, self-reference, cycle, unknown course/plan, missing `requirement` all refused;
  - `dry_run`; override true (the student payload changes, other plans don't); override false (the API still wins);
  - corequisites; toggling the override; the differences list.
- One audit row per actual write, actor = the token's user, `via: "mcp"`; none for refused or preview calls.
- Panel: create → use → listed without secret → revoke → `401`; tokens API needs a session. Screenshots of
  the token panel and of the editor showing an MCP override.
- DB suite on the same scratch DB: 270/271. `payloadEquivalence` passes with live overrides. The one failure
  is the map-editor test that needs an applied Registro import (not present in a fresh seed; unrelated).
- Two bugs found by the end-to-end run and fixed:
  - a call without `requirement` would have cleared the requirement;
  - prerequisite cycles were not checked (MATE 1203 ↔ MATE 1214).
