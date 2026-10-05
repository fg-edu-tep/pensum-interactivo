# Admin authentication

How the `/administrador` panel authenticates. Replaces the old single
`ADMIN_PASSWORD` env with **DB-backed multi-user accounts**, a **one-time setup
flow**, and a **super-panel** gated by a **12-word master secret**. Designed for
the Docker monolith deployment (app + MySQL in one stack, not on OTUS).

## Model at a glance

| Concept | What it is | Where |
|---|---|---|
| **Admin user** | A username/password account. Every user has identical **full access** — there are no roles. | `AdminUser` table |
| **Session** | Signed cookie `pensum_admin` proving "logged in as `<username>`" (12h). | `lib/auth/session.ts` |
| **Master secret** | A **12-word BIP39 mnemonic** generated at setup. Unlocks the super-panel. Stored only as a scrypt hash. | `AdminSetting` rows `master_secret_hash` / `_salt` |
| **Super session** | Signed cookie `pensum_super` proving "unlocked the super-panel" (30 min). Required *in addition* to a normal session for the super area. | `lib/auth/session.ts` |
| **Setup state** | `AdminSetting` row `setup_completed_at`. Its presence (or any existing user) closes the setup URL permanently. | `AdminSetting` |

Passwords and the mnemonic are hashed with **scrypt** (`node:crypto`, N=2¹⁵,
per-secret random salt) — see `lib/auth/password.ts`. The master secret is a real
checksummed BIP39 phrase (128-bit entropy + 4-bit SHA-256 checksum → 12 words
from the canonical 2048-word English list, bundled at `lib/auth/bip39Wordlist.ts`).

## First-run setup (one-time, first-visitor-wins)

On a fresh deployment there are **no users** and `setup_completed_at` is unset, so
the app is *uninitialized*. While uninitialized:

1. `/administrador/setup` is **public**. The first person to reach it creates the
   first admin user (username + password + optional display name).
2. The server generates the **12-word master secret**, shows it **once**, and
   requires the operator to confirm they saved it. It is never stored in cleartext
   and cannot be recovered — only rotated (see below).
3. `setup_completed_at` is written. From then on `/administrador/setup` redirects
   to the login page and the setup API returns `409`. **The window closes for good.**

> **First-visitor-wins** means: in the Docker monolith, whoever hits `/administrador/setup`
> first after the container starts owns the instance. Reach it yourself immediately
> after first boot, before exposing the app publicly. There is no `SETUP_TOKEN` gate
> (chosen for operational simplicity on a trusted single-tenant deployment). If you
> ever need to re-run setup, clear the three `master_secret_*` / `setup_completed_at`
> `AdminSetting` rows and all `AdminUser` rows (see "Recovery" below).

## Logging in

`/administrador/login` — username + password. Usernames are **case-insensitive**
(stored lowercased). A correct login mints the `pensum_admin` cookie. If the
account was password-reset by a super-admin (`mustReset`), the user is routed to
`/administrador/cuenta` to set a new password.

The Edge middleware (`middleware.ts`) gates everything under `/administrador/*`
and `/api/admin/*`, redirecting unauthenticated page requests to the login page
and returning `401` for unauthenticated API calls. Public exceptions: login,
logout, and the setup endpoints. The middleware only *verifies the signed cookie*
(Web Crypto, Edge-safe) — it never touches the DB or hashes passwords.

## Super-panel (`/administrador/super`)

User management + password recovery, gated by the master secret **on top of** a
normal login:

- Visiting `/administrador/super` with no super session shows the **unlock** form.
  Entering the 12 words mints the `pensum_super` cookie (30 min, re-enter after
  inactivity).
- Unlocked, it lists users and offers:
  - **Create user** (username + password + optional name).
  - **Reset a user's password** — the super-admin sets a temporary password and
    hands it to the user out-of-band; the account is flagged `mustReset`.
  - **Enable / disable** a user.
  - **Delete** a user.
  - **Rotate the master secret** — generates a fresh 12-word phrase (shown once);
    the old phrase stops working immediately.
- **Lockout guards:** you cannot delete the last user, nor disable the last active
  user (that would lock everyone out).

Deeper super routes (`/administrador/super/*`, `/api/admin/super/*` except
`unlock`) require the `pensum_super` cookie — middleware returns `403` / redirects
to the unlock form otherwise.

## Self-service

`/administrador/cuenta` — any logged-in user changes their **own** password after
re-entering the current one. Clears the `mustReset` flag. There is no email-based
reset (no SMTP in this deployment); a locked-out user is recovered by the
**super-admin** via the super-panel.

## Audit trail

`writeAudit()` (`lib/audit.ts`) auto-resolves the actor from the session cookie
(`currentActor()` in `lib/auth/actor.ts`) when the caller doesn't pass one, so
every mutation across the panel is attributed to the real username. Auth-specific
actions recorded: `auth.setup`, `auth.login`, `user.create`, `user.disable` /
`user.enable`, `user.delete`, `user.reset_password`, `user.change_password`,
`super.unlock` / `super.unlock.fail`, `super.rotate_master_secret`. Viewable at
`/administrador/auditoria`.

## Environment

| Var | Meaning |
|---|---|
| `SESSION_SECRET` | Signs the `pensum_admin` and `pensum_super` cookies (HMAC-SHA256). **>= 16 chars**; use a long random string in production. |

`ADMIN_PASSWORD` is **removed** — it is no longer read anywhere.

## Data model

```prisma
model AdminUser {
  id, username (unique, lowercased), displayName?, passwordHash, passwordSalt,
  disabled, mustReset, lastLoginAt?, createdAt, updatedAt
}
model AdminSetting { key (PK), value, updatedAt }   // master_secret_hash|_salt, setup_completed_at
model PasswordResetToken { id, userId, tokenHash, expiresAt, usedAt?, createdBy?, createdAt }
```

Migration: `web/prisma/migrations/20261003221513_add_admin_auth`.

> `PasswordResetToken` is in place for a future token-link reset flow; today
> recovery goes through the super-panel, so no tokens are minted yet.

## Code map

```
web/lib/auth/
  session.ts        signed cookies (admin + super), Edge-safe HMAC, readToken/username helpers
  password.ts       scrypt hashSecret/verifySecret, passwordPolicyError
  mnemonic.ts       BIP39 generate/normalize/validate (12 words)
  bip39Wordlist.ts  canonical 2048-word English list (bundled)
  users.ts          AdminUser + AdminSetting data access; setup, auth, CRUD, master-secret
  actor.ts          currentActor() — username from the session cookie, for audit
web/middleware.ts   gates /administrador/* + /api/admin/*; super-area super-cookie gate
web/app/administrador/
  setup/            one-time bootstrap page (+ SetupForm, mnemonic reveal)
  login/            username+password login
  (panel)/super/    super-panel: unlock + user management (SuperUnlock, SuperPanel)
  (panel)/cuenta/   self-service change password
web/app/api/admin/
  setup/ , setup/state/        bootstrap API + initialized check
  login/ , logout/             session cookie lifecycle
  super/unlock/                master-secret → super cookie
  super/users/ , .../[id]/ , .../[id]/reset-password/   user CRUD + recovery
  super/master-secret/         rotate the master secret
  account/password/            self-service change password
```

## Recovery runbook

- **Lost a user's password:** super-admin → `/administrador/super` → Restablecer
  contraseña. Hand the temp password to the user; they change it on next login.
- **Lost the master secret, but still have a logged-in admin:** you cannot read the
  old phrase (hash only). Clear the `master_secret_*` rows and re-seed them — the
  simplest path is to rotate once you can unlock, otherwise reset via SQL:
  delete the `master_secret_hash` / `master_secret_salt` `AdminSetting` rows, then
  the next super-unlock will fail until a new secret is set. (A small admin script
  or `completeSetup`-style helper can re-mint it.)
- **Lost everything (no admin can log in):** with DB access, delete all `AdminUser`
  rows and the `setup_completed_at` + `master_secret_*` `AdminSetting` rows. The app
  returns to *uninitialized* and `/administrador/setup` reopens (first-visitor-wins).
