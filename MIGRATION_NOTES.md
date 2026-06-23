# Dream Weaver Studio — TanStack Start → Next.js port

This project is a **framework migration** of `../ban_gen_web` (TanStack Start +
Vite + Cloudflare Workers) to **Next.js 16 (App Router) + React 19 + Tailwind 4**.
Business logic, UI, and the DB/auth/FTP/billing model are **unchanged** — only the
framework "glue" (routing, root document, navigation, config, server bootstrap)
was rewritten.

## What changed (framework glue only)
- **Routing.** `src/routes/**` (TanStack file routes) → `src/app/**` (App Router).
  - 21 API routes: `createFileRoute(...).server.handlers.METHOD` → `export async function METHOD(request: Request)`. Handler bodies copied **verbatim** (already Web `Request`/`Response`). Relative `../lib` imports → `@/lib` alias.
  - Dynamic params: `$cardId` → `[cardId]`; Next 16 params are async → `const params = await ctx.params;`.
  - 7 pages: `createFileRoute(...).component` → `export default`; `head` title → `document.title` effect; pages are `"use client"`.
- **Navigation.** `@tanstack/react-router` → `next/link` + `next/navigation`:
  `Link to=` → `href=`, `useNavigate()/navigate({to})` → `useRouter().push()`,
  `useSearch()` → `useSearchParams()`, `Route.useParams()` → `useParams()`.
- **Root.** `__root.tsx` → `app/layout.tsx` (server, metadata) + `app/providers.tsx`
  (`"use client"`: QueryClient + Auth + Generation) + `app/not-found.tsx` + `app/error.tsx`.
  Replaces `router.tsx`.
- **Background workers.** Old `server.ts` boot block → `src/instrumentation.ts`
  (`register()` runs once at server start, Node runtime only). The workers
  (`uploadRetryWorker` 2-min, `retentionWorker` 6-h) are **unchanged**.
- **Client env.** Vite `import.meta.env.VITE_*` → Next `process.env.NEXT_PUBLIC_*`
  (only in `src/lib/supabase/browser.ts`). Server env stays `process.env.X`.
- **Static images.** `import x from "@/assets/y.jpg"` returns `StaticImageData` in
  Next → use `x.src` (only in `PresetSidebar.tsx`).
- **Config.** Vite/Lovable config dropped. `next.config.ts`: `output: "standalone"`,
  `serverExternalPackages: ["basic-ftp"]`. tsconfig `target` → `ES2022` (matches original).

## Environment (.env)
Server (unprefixed, used in route handlers): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `FTP_*`, model/API keys, etc. — loaded by Next automatically.
Client (must be `NEXT_PUBLIC_*`, inlined at build): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
> ⚠️ **Rotate ALL keys before deploy** (carried over from the source project).

## Run / build / deploy (ukraine.com.ua, Node host)
- Dev:   `npm run dev`
- Build: `npm run build`  (Turbopack; emits `.next/standalone/`)
- Prod (standalone): `node .next/standalone/server.js`
  - Copy `public/` and `.next/static/` next to the standalone server (Next standalone
    does not bundle them). Set env vars on the host. `next start` also works but warns.
- **Workers:** run in-process via `instrumentation.ts` on a long-lived Node process.
  For idle-prone / serverless hosts, set `WORKERS_IN_PROCESS=false` and drive the
  same logic via host cron hitting dedicated cron endpoints (not built yet — add if needed).

## Verification done
- `tsc --noEmit` → clean (0 errors).
- `next build` → success; 21 API + 7 pages mapped correctly.
- Runtime smoke (`next start -p 3100`): `/login` 200, `/` 200, `/api/me` 401 (auth guard),
  both workers boot from instrumentation.
- **Pending (final check):** full 4-preset no-regression generation run vs the original.

## Known follow-ups
- Rotate all secrets before deploy.
- `src/lib/error-capture.ts` + `src/lib/error-page.ts` are now unused (were `server.ts`-only) — safe to prune.
- Per-page `<meta description>` overrides not ported (titles are, via `document.title`); global metadata lives in `app/layout.tsx`.
- Title `"Lovable App"` in `app/layout.tsx` kept verbatim from source — rebrand when desired.
