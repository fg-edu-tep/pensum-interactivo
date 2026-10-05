# Docs

| Doc | What it covers |
|---|---|
| [`branches-and-releases.md`](branches-and-releases.md) | Which branch is for what (MySQL monolith = official release; `main`/Vercel = temporary preview), what differs between them, how to sync, env vars, runbooks |
| [`admin-auth.md`](admin-auth.md) | Admin panel authentication: DB-backed multi-user accounts, one-time setup, 12-word master secret + super-panel, password recovery, audit attribution |
| [`admin-registro-wizard.md`](admin-registro-wizard.md) | Registro import wizard (Phase A of the admin experience): reduce `Excel_Registro.xlsx` to the last 3 regular terms of the IELE/IELC department, resolve unmatched codes, link to the pensums, apply with exact undo. Measured facts, rules, bugs found, how it was verified |
| [`admin-discrepancies.md`](admin-discrepancies.md) | Discrepancy alerts: the "prefer API, fall back to the document" precedence, how admins are alerted when their edits / Registro imports differ from the official API data (Discrepancias page, catalog badge, editor, wizard), known inconsistencies in the student payload, real-data findings, verification |
| [`admin-visual-editor.md`](admin-visual-editor.md) | **Phase B visual pensum editor (built, B0–B6):** what an admin can do on `/administrador/catalogos/[slug]/mapa`, rules, the atomic/undoable write path, code map, how it was verified, bugs found |
| [`admin-visual-editor-plan.md`](admin-visual-editor-plan.md) | Plan and decision log for Phase B: why visual editing, measured ground truth, design, phases B0–B6 with results, risks |
| [`2026-10-design-pass.md`](2026-10-design-pass.md) | Engineering log of the October 2026 design pass: what changed, where, why, how to verify, local data actions, open items |
| [`user-flows.md`](user-flows.md) | The people we design for and the rationale behind each flow (Explorar, Mi avance, basket checkout) |
| [`../web/components/explorer/DESIGN.md`](../web/components/explorer/DESIGN.md) | CSS / design tokens / component states |

Also: [`../.claude/PROGRESS.md`](../.claude/PROGRESS.md) (running status log) and
[`../.claude/PLAN.md`](../.claude/PLAN.md) (approved plan).
