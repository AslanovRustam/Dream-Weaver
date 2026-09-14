# GenGO — Dream Weaver Studio

AI creative-generation platform for iGaming. It turns a short brief into finished
ad creatives: static banners, interactive landing pages, playable ads, video
scenes and marketing emails — with a credit ledger, a generation history and an
admin back office around them.

Built with Next.js 16 (App Router) + React 19, Supabase (Postgres, Auth, RLS),
and OpenAI / OpenRouter image and text models. Generated assets are stored on an
external FTP host, not in the database.

---

## Contents

- [Stack](#stack)
- [Product sections](#product-sections)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Credits and pricing](#credits-and-pricing)
- [Background jobs and retention](#background-jobs-and-retention)
- [API surface](#api-surface)
- [Build and deploy](#build-and-deploy)
- [One-off scripts](#one-off-scripts)
- [Known gaps](#known-gaps)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.9, App Router, `output: "standalone"` |
| UI | React 19.2, TypeScript 5, Tailwind CSS 4, Radix UI primitives (shadcn-style), lucide icons |
| Data fetching | TanStack Query 5 |
| Backend | Next.js Route Handlers (Node.js runtime) |
| Database / Auth | Supabase — Postgres, GoTrue Auth (email+password and Google OAuth), Row Level Security |
| Asset storage | FTP (`basic-ftp`), served over HTTP from `FTP_BASE_URL` |
| AI | OpenAI direct (images, `gpt-4o-mini`) and OpenRouter (vision passes) |

Roughly 50k lines of TypeScript: 36 API routes, 26 pages, 49 feature components
plus 48 UI primitives, 62 library modules, 7 SQL migrations.

## Product sections

Eight sections share one shell (`AppShell`, `AppHeader`, `AppSidebar`). Each has
working UI; how much real AI sits behind it varies.

| Section | Route | Backend |
|---|---|---|
| Banner generator | `/banner` | **Real.** Full pipeline: prompt build → image model → FTP upload → history card |
| Landing generator | `/landing` | **Real** for the interactive templates (wheel / slot / crash): AI characters, backgrounds and symbols; the page HTML is assembled client-side |
| Playable ads | `/playable` | Client-side. Self-contained interactive HTML built from form input |
| Video constructor | `/video` | Mock. Mirrors the other generators' shape so a real backend can slot in |
| Email generator | `/email` | **Real.** LLM copy + AI hero image |
| Ad accounts | `/ads` | Mock. Connections in localStorage, stats from a seeded PRNG |
| Statistics | `/stats` | Mock, same seeded-PRNG approach |
| Mailings | `/mailing` | Mock. The seam for a real ESP is `sendCampaign` in `src/lib/mailing.ts` |

History (`/history`) is real throughout — it reads and edits `generation_cards`
through `/api/history`.

**MVP gate.** `src/lib/mvp.ts` is the single source of truth for what is
reachable during demos: only `/`, `/banner`, `/landing` and `/history`.
Everything else renders greyed-out "Скоро" and must not navigate.

## Architecture

**Routing.** App Router. Pages are client components (`"use client"`); all
server work lives in route handlers under `src/app/api/**`. Every route runs on
the Node.js runtime — never Edge — because `basic-ftp` needs real sockets.

**Auth.** The browser holds a Supabase session and sends
`Authorization: Bearer <access_token>` on protected calls. The server validates
that token with `auth.getUser()` and never trusts client-supplied identity
(`src/lib/auth-server.ts`). Three Supabase clients, deliberately separated:

- `supabase/browser.ts` — anon key, RLS enforced, browser only
- `supabase/user-client.ts` — per-request client built from the caller's JWT, RLS enforced
- `supabase/admin.ts` — service role, **bypasses RLS**, server only

**Authorisation.** Two orthogonal axes in `src/lib/rbac.ts`: `role` is staff
capability (`user` → `tester` → `support` → `moderator` → `admin` →
`superadmin`), `tier` is billing entitlement (`regular` / `pro` / `corporate`).
13 named capabilities are checked at the server boundary; `src/lib/roles.ts` is
a UI-facing view (guest / user / admin) over the same data.

**Generation flow (banner).** Form state → prompt assembly → image model →
credit charge via the `spend_credits` RPC → FTP upload → `generation_cards` row
→ optional AI naming. Generation state lives in a global context
(`src/lib/generation-context.tsx`) so it survives route navigation.

**Resizes.** `src/lib/resizePlan.ts` turns an arbitrary list of exact banner
sizes (including extreme IAB formats like 728×90) into a small set of source
images the model can actually produce, plus a crop spec that carves each exact
size out of its source. Cheap crops run client-side via `smartcrop`.

**Hardening.** `src/lib/safe-fetch.ts` is an SSRF guard that allowlists the
image host origin; `src/lib/request-guard.ts` does in-process rate limiting and
inbound payload-size checks; `src/lib/visionSafety.ts` scrubs vision-model
output before it reaches a strict-moderation image generator.

**Observability.** `src/lib/logger.ts` writes structured rows into
`system_logs`, visible in `/admin` → Логи. Security- and billing-relevant
actions additionally write `audit_logs`.

## Project layout

```
src/
  app/
    api/            36 route handlers (admin, auth, generation, history, cron)
    <section>/      26 pages — banner, landing, playable, video, email,
                    ads, stats, mailing, history, admin, account, billing, …
    layout.tsx      fonts + metadata
    providers.tsx   QueryClient, Auth, Workspace, Generation, Locale, Toaster
    globals.css     design tokens (dark-first palette, radius/elevation ladders)
  components/       49 feature components + 48 UI primitives in ui/
  lib/
    supabase/       three clients (browser / user / admin)
    history/        card writer, queries, retention + upload-retry workers
    ftp/            low-level uploader and high-level storage layer
    i18n/           UI locale (RU source of truth, EN and UK typed against it)
    *.ts            domain modules: rbac, credit-estimate, resizePlan,
                    imageGen, landingGen, playableGen, videoGen, mailing, ads…
  instrumentation.ts  boots background workers once per server process
supabase/migrations/  7 SQL migrations (schema, RLS, RPCs)
scripts/              one-off maintenance and asset scripts
```

## Getting started

**Prerequisites.** Node.js 20.9+ (developed on 24), npm, and a Supabase project.

```bash
npm install
# create .env from the table below
npm run dev          # http://localhost:3000
```

**Database.** Apply `supabase/migrations/*.sql` in order via the Supabase
dashboard (SQL Editor) or the CLI. `BACKEND_SETUP.md` walks through the first
migration and the Auth settings step by step.

Scripts: `npm run dev`, `npm run build`, `npm run start`. There is no lint or
test script in `package.json` today; `npx tsc --noEmit` is the type gate.

## Environment variables

Server-side variables are read from `process.env` in route handlers. Only
`NEXT_PUBLIC_*` reaches the browser, inlined at build time.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server) |
| `SUPABASE_ANON_KEY` | Anon key (server-side user-scoped client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — bypasses RLS. Server only, never expose |
| `NEXT_PUBLIC_SUPABASE_URL` | Same URL, for the browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same anon key, for the browser client |
| `OPENAI_API_KEY` | Image generation and `gpt-4o-mini` text calls |
| `OPENROUTER_API_KEY` | Vision passes (brief parsing, brand lookup, master extraction) |
| `FTP_HOST` / `FTP_PORT` / `FTP_USER` / `FTP_PASS` | Asset storage credentials |
| `FTP_BASE_PATH` | Upload root on the FTP host |
| `FTP_BASE_URL` | Public HTTP origin the uploads are served from (also the SSRF allowlist) |
| `CRON_SECRET` | Bearer secret for `/api/cron/retention`. Unset = endpoint refuses every call |
| `WORKERS_IN_PROCESS` | Set to `false` to disable in-process workers and drive retention by external cron instead |

No `.env.example` is committed; `.env*` is gitignored.

## Database

Ten tables, all under RLS:

| Table | Holds |
|---|---|
| `profiles` | User profile, `credits_balance`, `role`, `tier`. Created by a signup trigger |
| `credit_transactions` | Immutable ledger of every balance change |
| `pricing_coefficients` | Per `(model, quality)` credit cost multiplier |
| `generations` | Per-call AI usage ledger — tokens and dollar self-cost |
| `generation_cards` | A history card: master image, resizes, form snapshot, soft-delete state |
| `templates` | Editable template catalogue (staff-managed) |
| `app_settings` | Runtime configuration as JSONB, editable in the admin UI |
| `system_logs` | Structured application logs |
| `audit_logs` | Security, admin and billing audit trail (long retention) |
| `notifications` | Per-user notifications, including admin broadcasts |

Business rules that matter live in Postgres functions, not in the app, so they
stay atomic and auditable: `spend_credits`, `admin_grant_credits`,
`admin_set_user_role`, `admin_set_setting`, `soft_delete_card`, `restore_card`,
`hard_delete_card`, `touch_card_activity`, `cleanup_expired_logs`.

Tunable `app_settings` keys include `retention_cards_months` (default 12),
`retention_logs_days` (90), `retention_audit_days` (-1 = never),
`card_delete_grace_hours` (24), `ftp_retry_max_attempts`, `bulk_zip_max_cards`
and `ai_naming_enabled` / `ai_naming_model`.

## Credits and pricing

The user-facing unit is a credit, pinned to self-cost: **$1 = 100 credits**
(`src/lib/credit-estimate.ts`).

| Action | Credits |
|---|---|
| Banner (master) | 30 |
| Each resize format | 2 |
| Landing character / slot symbol set / crash rocket | 23 (one flat model call each) |
| Landing from an approved banner | 15 |

The charge is applied by `spend_credits` before the image is returned: if the
balance cannot cover the actual cost, the image is not delivered. A coarse
minimum-balance floor stops a near-empty account from burning provider calls in
the first place.

Image engines: `gpt-image-2.5-sunburst` for masters and characters,
`gpt-image-2.5-flare` for resizes and reframes (both OpenAI-direct),
`gpt-4o-mini` for copy, brief parsing and vision passes.

## Background jobs and retention

`src/instrumentation.ts` starts two workers once per server process, on the
Node.js runtime only:

- **uploadRetryWorker** — every 2 minutes, retries FTP uploads that failed or
  were interrupted mid-flight (crash-recoverable by design)
- **retentionWorker** — every 6 hours, hard-deletes expired cards past their
  grace window and trims the log tables

On a long-lived host that is all you need. On serverless there is no process for
`setInterval` to live on, so the same retention logic is exposed at
`GET /api/cron/retention`, guarded by `CRON_SECRET`, and driven by an external
scheduler — `vercel.json` runs it daily at 03:00. The instrumentation hook skips
itself automatically when `VERCEL` is set.

## API surface

All routes are Node runtime and expect `Authorization: Bearer <token>` unless
noted.

**Generation** — `generate-image`, `generate-character`, `generate-slot-symbols`,
`generate-crash-rocket`, `generate-email-content`, `generate-email-hero`,
`landing-suggest`, `analyze-banner-for-landing`, `extract-master`,
`fetch-master`, `parse-brief`, `brand-lookup`, `remove-bg`

**History** — `history` (list), `history/[cardId]` (detail / rename / soft
delete), `history/[cardId]/resize-tile`, `history/bulk-delete`,
`history/bulk-zip` (streams a ZIP), `history/clone-card`, `history/restore`,
`history/upload-status`

**Account** — `me`, `auth/change-password`, `auth/forgot-password`,
`notifications`

**Admin** (capability-gated) — `admin/users`, `admin/credits`, `admin/role`,
`admin/history`, `admin/logs`, `admin/pricing`, `admin/settings`,
`admin/templates`, `admin/usage`, `admin/notifications`

**Scheduled** — `cron/retention` (Bearer `CRON_SECRET`, not a user token)

## Build and deploy

```bash
npm run build        # Turbopack; emits .next/standalone/
```

**Vercel.** Deploys as-is. `maxDuration = 300` on the generation and retention
routes covers slow image calls; `vercel.json` registers the retention cron.

**Self-hosted Node (VPS).** `output: "standalone"` is already configured:

```bash
npm ci && npm run build
# copy public/ and .next/static/ next to .next/standalone/server.js
node .next/standalone/server.js
```

Standalone does not bundle `public/` or `.next/static/` — copy both. Keep
`WORKERS_IN_PROCESS` unset so the in-process workers run instead of the cron
endpoint, and raise the reverse proxy's read timeout above 300s, or long
generations and `bulk-zip` will be cut off mid-response.

## One-off scripts

Not part of the build; run manually.

| Script | Does |
|---|---|
| `scripts/gen-previews.mjs` | Generates a 3:2 preview banner per template via the images API |
| `scripts/compress-previews.mjs` | Converts `public/previews/*.png` to sized WebP and drops the PNGs |
| `scripts/remap-user-ids.mjs` | Rewrites old `auth.users` UUIDs after a Supabase project migration |
| `scripts/test-ftp.mjs` | FTP connectivity check |
| `scripts/check-api-calls.ts` | Counts yesterday's image-generation calls |

## Known gaps

- **`npm run build` currently fails.** `/api/parse-brief` imports `mammoth`
  (.docx) and `pdfjs-dist` (.pdf), neither of which is in `package.json`.
  Install both, or gate that route, before deploying. `npx tsc --noEmit` reports
  the same two module-resolution errors and nothing else.
- **Mocked domains.** Ad accounts, statistics, mailings, video generation and
  workspaces are client-side mocks backed by localStorage and a seeded PRNG.
  Each module names its integration seam in a header comment.
- **BYO credentials** (`src/lib/credentials.ts`) are kept in localStorage,
  per-browser. They belong server-side before any real integration ships.
- **Billing is UI-only.** `/billing` renders plans; payment and credit granting
  are not implemented.
- **Rotate every key before a public deploy** — the keys in the working `.env`
  were carried over from the source project (see `MIGRATION_NOTES.md`).

## Related documents

- `BACKEND_SETUP.md` — Supabase setup, migration and Auth configuration, step by step
- `MIGRATION_NOTES.md` — the TanStack Start → Next.js port: what changed and why
- `HANDOVER.md` — feature-level handover notes
- `supabase/NEW_ACCOUNT_MIGRATION.md` — moving to a different Supabase project
