# Archive UI Port → Next.js — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the archive's UI redesign + new features (editor undo/redo, /billing) onto the Next.js `ui-updates` branch, keeping all Next.js server-side code intact.

**Architecture:** Per-file category port (approach A). Client/UI files come from the archive (adapted TanStack→Next); server files, security, and serverless glue stay Next. Overlap files (`generation-context`, `auth-context`, `globals.css`) are merged to keep Next improvements.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/Radix, Supabase.

## Global Constraints

- **Framework stays Next.js.** Never reintroduce `@tanstack/*`, `vite`, `wrangler`, `import.meta.env`, `createFileRoute`, `src/routes/**`, `router.tsx`, `server.ts`, `start.ts`.
- **Do NOT modify server files** (see spec §4): `src/app/api/**`, `src/lib/history/{cardWriter,retentionWorker,uploadRetryWorker,aiNaming,queries}.ts`, `logger.ts`, `auth-server.ts`, `supabase/{admin,user-client,browser}.ts`, `safe-fetch.ts`, `rbac.ts`, `request-guard.ts`, `background.ts`, `generation-errors.ts`, `imageSizes.ts`, `ftp/*`, `instrumentation.ts`, `resize/ResizeResultsGrid.tsx`.
- **Preserve** `formatGenerationError` integration in `generation-context.tsx`.
- **Do NOT port** archive's `src/lib/{error-capture,error-page}.ts` (TanStack-only, unused in Next).
- **Env:** client Supabase must stay on `NEXT_PUBLIC_*` (keep Next `supabase/browser.ts`).
- **Archive source (read-only reference):** `C:\Users\user\Desktop\Archive (6)`.

**Adaptation rules (TanStack → Next), apply everywhere:**

| TanStack | Next |
|---|---|
| `import { Link } from "@tanstack/react-router"` | `import Link from "next/link"` |
| `<Link to="/x">` | `<Link href="/x">` |
| `useNavigate()` + `navigate({to:"/x"})` | `useRouter()` (`next/navigation`) + `router.push("/x")` |
| `useSearch()` / `Route.useSearch()` | `useSearchParams()` |
| `Route.useParams()` | `useParams()` (`next/navigation`) |
| `createFileRoute(...)({component, head})` page | `"use client"` + `export default function Page()`; `head.title` → `document.title` in a `useEffect` |
| `import x from "@/assets/y.jpg"` used as `src` | keep import; use `x.src` (StaticImageData) |
| `import.meta.env.VITE_FOO` | `process.env.NEXT_PUBLIC_FOO` |

**Per-task verification (no unit-test harness in repo — this is the gate):**
- `npx tsc --noEmit` → error count must not increase vs task start (target: 0 at milestones).
- At milestones: `npx next build` → success.
- Smoke: `npm run dev`, load the touched screen, check console has no runtime errors.

---

## Task 0: Baseline green + working branch check

**Files:** none (verification only).

- [ ] **Step 1:** Confirm on branch `ui-updates`, clean tree.
Run: `git branch --show-current && git status --porcelain`
Expected: `ui-updates`, no output.

- [ ] **Step 2:** Record baseline typecheck.
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0 (record any pre-existing errors as the baseline to not regress).

- [ ] **Step 3:** Record baseline build.
Run: `npx next build`
Expected: success. If it fails, stop and fix the environment before porting.

---

## Task 1: Design tokens + shared `ui/*` primitives

**Files:**
- Modify: `src/app/globals.css` (merge tokens from archive `src/styles.css`)
- Copy: `src/components/ui/{accordion,button,card,dialog,input,textarea}.tsx` from archive

**Interfaces:**
- Produces: updated CSS custom properties / Tailwind layers and restyled primitives consumed by every later screen.

- [ ] **Step 1:** Diff archive `src/styles.css` against `src/app/globals.css`; identify design tokens (`:root` vars, `@theme`/`@layer` blocks, color/radius/spacing) present in archive but missing in current.
Run: `diff --strip-trailing-cr "/c/Users/user/Desktop/Archive (6)/src/styles.css" src/app/globals.css | less`

- [ ] **Step 2:** Merge archive tokens into `globals.css`. Keep the Next Tailwind v4 `@import "tailwindcss";` and any `@custom-variant`/dark-mode setup already present; add the archive's design tokens and utility layers. Do not drop existing Next-only rules.

- [ ] **Step 3:** Copy the 6 `ui/*` files verbatim from archive (no router usage in them):
Run: `for f in accordion button card dialog input textarea; do cp "/c/Users/user/Desktop/Archive (6)/src/components/ui/$f.tsx" "src/components/ui/$f.tsx"; done`

- [ ] **Step 4:** Verify imports still resolve (these use `@/lib/utils` `cn` — present in Next).
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0.

- [ ] **Step 5:** Commit.
Run: `git add src/app/globals.css src/components/ui && git commit -m "port: archive design tokens + ui primitives"`

---

## Task 2: Editor undo/redo (`editor-history`) + provider mount

**Files:**
- Copy: `src/lib/editor-history.tsx` from archive
- Modify: `src/app/providers.tsx` (mount provider)

**Interfaces:**
- Produces: `EditorHistoryProvider` (wrap children) and `useEditorHistory()` returning `{ canUndo, canRedo, undo, redo, register, record }`. Consumed by AppHeader (Task 4) and ImageGenApp (Task 5).

- [ ] **Step 1:** Copy the file (pure React context, no router):
Run: `cp "/c/Users/user/Desktop/Archive (6)/src/lib/editor-history.tsx" src/lib/editor-history.tsx`

- [ ] **Step 2:** In `src/app/providers.tsx`, import `EditorHistoryProvider` and wrap the app subtree that contains both AppHeader and page content (same level the archive mounted it in `__root.tsx`). Keep existing QueryClient/Auth/Generation providers.

- [ ] **Step 3:** Verify types + provider ordering.
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0.

- [ ] **Step 4:** Commit.
Run: `git add src/lib/editor-history.tsx src/app/providers.tsx && git commit -m "port: editor undo/redo history context + provider mount"`

---

## Task 3: Simple components (copy-as-is)

**Files:**
- Copy from archive: `src/components/PresetSidebar.tsx`, `src/components/resize/ResizeBatchPanel.tsx`, `src/components/ModelToggle.tsx`, `src/components/AspectRatioPicker.tsx`
- Copy if differing/new: `src/assets/*`

**Interfaces:**
- Consumes: `ui/*` (Task 1). Produces: restyled panels used by ImageGenApp (Task 5).

- [ ] **Step 1:** Copy the 4 components:
Run: `A="/c/Users/user/Desktop/Archive (6)"; cp "$A/src/components/PresetSidebar.tsx" src/components/; cp "$A/src/components/resize/ResizeBatchPanel.tsx" src/components/resize/; cp "$A/src/components/ModelToggle.tsx" src/components/; cp "$A/src/components/AspectRatioPicker.tsx" src/components/`

- [ ] **Step 2:** Sync new/changed assets (compare first, then copy only differing):
Run: `diff -rq --strip-trailing-cr "/c/Users/user/Desktop/Archive (6)/src/assets" src/assets`
Copy any archive-only/differing asset into `src/assets/`.

- [ ] **Step 3:** Fix asset usage if any component imports an image and passes it directly to `src=`: change to `img.src` (StaticImageData). Grep for raw asset imports in the copied files.
Run: `grep -nE "from \"@/assets|from '@/assets" src/components/PresetSidebar.tsx`

- [ ] **Step 4:** Typecheck.
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0 (if PresetSidebar/ResizeBatchPanel reference generation-context APIs that change in Task 5, note the errors — they resolve after Task 5; otherwise fix now).

- [ ] **Step 5:** Commit.
Run: `git add src/components src/assets && git commit -m "port: restyled PresetSidebar, ResizeBatchPanel, ModelToggle, AspectRatioPicker"`

---

## Task 4: AppHeader (router adaptation + undo/redo buttons)

**Files:**
- Modify: `src/components/AppHeader.tsx` (base = archive version, adapted)

**Interfaces:**
- Consumes: `useEditorHistory()` (Task 2) for undo/redo buttons; `next/link`, `next/navigation`.

- [ ] **Step 1:** Copy archive AppHeader as the base:
Run: `cp "/c/Users/user/Desktop/Archive (6)/src/components/AppHeader.tsx" src/components/AppHeader.tsx`

- [ ] **Step 2:** Apply adaptation rules: replace `@tanstack/react-router` imports with `next/link` + `next/navigation`; `<Link to>`→`href`; `useNavigate`/`navigate({to})`→`useRouter().push`. Ensure `"use client"` is the first line.
Run (find sites): `grep -nE "tanstack|useNavigate|navigate\(|<Link|to=" src/components/AppHeader.tsx`

- [ ] **Step 3:** Confirm the undo/redo buttons wire to `useEditorHistory()` (`canUndo/canRedo/undo/redo`). Keep the balance + failed-uploads badge + GenerationIndicator behavior from the archive header.

- [ ] **Step 4:** Typecheck.
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0.

- [ ] **Step 5:** Commit.
Run: `git add src/components/AppHeader.tsx && git commit -m "port: AppHeader (Next router + editor undo/redo)"`

---

## Task 5: ImageGenApp + client-lib merges

**Files:**
- Modify: `src/components/ImageGenApp.tsx` (base = archive, adapted)
- Merge: `src/lib/generation-context.tsx` (archive UI changes + keep `formatGenerationError`)
- Merge: `src/lib/imageGen.ts`, `src/lib/bannerSizes.ts`, `src/lib/auth-context.tsx`

**Interfaces:**
- Consumes: `useEditorHistory().register/record` (Task 2). Produces: generation-context API used by PresetSidebar/ResizeBatchPanel/AppHeader.

- [ ] **Step 1:** Merge `generation-context.tsx`: start from archive version, then re-add `import { formatGenerationError } from "./generation-errors";` and its use (`errorMsg: formatGenerationError(...)`) exactly as in current (current lines ~30 and ~330). Diff the two versions to place the archive's UI/state changes without dropping the error formatting.
Run: `diff --strip-trailing-cr "/c/Users/user/Desktop/Archive (6)/src/lib/generation-context.tsx" src/lib/generation-context.tsx | less`

- [ ] **Step 2:** Merge `imageGen.ts` (20-line diff) and `bannerSizes.ts` (10-line diff): take archive client changes; verify no server-only/`import.meta` usage introduced.
Run: `diff --strip-trailing-cr "/c/Users/user/Desktop/Archive (6)/src/lib/imageGen.ts" src/lib/imageGen.ts`

- [ ] **Step 3:** Merge `auth-context.tsx`: take archive version; ensure it imports the Next `supabase/browser` client and uses `next/navigation` (not TanStack), no `import.meta`.
Run: `grep -nE "tanstack|import\.meta|next/navigation|supabase/browser" src/lib/auth-context.tsx`

- [ ] **Step 4:** Copy + adapt `ImageGenApp.tsx`: `cp` from archive, apply router adaptation rules, wire `useEditorHistory().register(...)` + `record()` on edits (mirror archive), fix asset `.src` usage. Keep `"use client"`.
Run: `grep -nE "tanstack|useNavigate|useSearch|<Link|to=|@/assets" src/components/ImageGenApp.tsx`

- [ ] **Step 5:** Typecheck the whole client surface (this is where client↔server boundary mismatches surface).
Run: `npx tsc --noEmit; echo "exit=$?"`
Expected: exit=0 (fix signature mismatches against the kept Next server/api).

- [ ] **Step 6:** Build.
Run: `npx next build`
Expected: success.

- [ ] **Step 7:** Commit.
Run: `git add src/components/ImageGenApp.tsx src/lib/generation-context.tsx src/lib/imageGen.ts src/lib/bannerSizes.ts src/lib/auth-context.tsx && git commit -m "port: ImageGenApp + editor wiring; merge generation-context/imageGen/auth-context (keep humanized errors)"`

---

## Task 6: Pages (routes → app), simplest first

Port each archive `src/routes/*.tsx` into the existing Next `src/app/**/page.tsx`, applying page-level adaptation rules (`createFileRoute`→default export + `"use client"`; `head.title`→`document.title` effect; router/search/params hooks). Do one page per step-group, typecheck after each.

**Files (base = archive route → target Next page):**
- `routes/index.tsx` → `src/app/page.tsx`
- `routes/login.tsx` → `src/app/login/page.tsx`
- `routes/reset-password.tsx` → `src/app/reset-password/page.tsx`
- `routes/account.tsx` → `src/app/account/page.tsx` (add `/billing` link on the "Пополнить" button)
- `routes/history/index.tsx` → `src/app/history/page.tsx`
- `routes/history/$cardId.tsx` → `src/app/history/[cardId]/page.tsx` (params via `useParams()`)
- `routes/admin.tsx` → `src/app/admin/page.tsx` (largest; most router calls)

- [ ] **Step 1 (index):** Port `app/page.tsx` (mostly renders `<ImageGenApp/>`). Typecheck. Commit `port: home page`.
Run: `npx tsc --noEmit; echo exit=$?`

- [ ] **Step 2 (login):** Port `app/login/page.tsx`; keep the existing Supabase OAuth `redirectTo`/`signInWithOAuth` logic already working in Next — merge archive's redesigned markup around it, don't replace the auth calls. Typecheck. Commit `port: login page`.

- [ ] **Step 3 (reset-password):** Port `app/reset-password/page.tsx`. Typecheck. Commit `port: reset-password page`.

- [ ] **Step 4 (account):** Port `app/account/page.tsx`; wire the "Пополнить"/top-up button to `router.push("/billing")` or `<Link href="/billing">`. Typecheck. Commit `port: account page + billing link`.

- [ ] **Step 5 (history list):** Port `app/history/page.tsx` (search/filters via `useSearchParams()`). Typecheck. Commit `port: history list page`.

- [ ] **Step 6 (history detail):** Port `app/history/[cardId]/page.tsx` (`const { cardId } = useParams()`). Typecheck. Commit `port: history detail page`.

- [ ] **Step 7 (admin):** Port `app/admin/page.tsx` (1720 lines). Convert all `Link`/`useNavigate`/`useSearch` sites; keep tab structure. Typecheck. Commit `port: admin page`.
Run (site inventory before editing): `grep -nE "tanstack|useNavigate|navigate\(|useSearch|<Link|to=" "/c/Users/user/Desktop/Archive (6)/src/routes/admin.tsx" | wc -l`

- [ ] **Step 8:** Full build after all pages.
Run: `npx next build`
Expected: success.

---

## Task 7: New `/billing` page

**Files:**
- Create: `src/app/billing/page.tsx` (from archive `routes/billing.tsx`)

**Interfaces:**
- Consumes: `AppHeader`, `useAuth`, `next/link`, `next/navigation`.

- [ ] **Step 1:** Create the page from archive `routes/billing.tsx`, applying page adaptation rules (`createFileRoute`→default export + `"use client"`; `Link to`→`href`; `useNavigate`→`useRouter`; `head.title`→`document.title` effect). Keep CTA stubs (UI-only) as-is.

- [ ] **Step 2:** Typecheck + build.
Run: `npx tsc --noEmit && npx next build; echo exit=$?`
Expected: exit=0, build success.

- [ ] **Step 3:** Commit.
Run: `git add src/app/billing/page.tsx && git commit -m "feat: /billing pricing page (UI-only)"`

---

## Task 8: Final verification + smoke

**Files:** none (verification).

- [ ] **Step 1:** Full typecheck + build.
Run: `npx tsc --noEmit && npx next build; echo exit=$?`
Expected: exit=0.

- [ ] **Step 2:** Confirm no TanStack/vite/wrangler leaked in.
Run: `grep -rnE "@tanstack/react-(router|start)|createFileRoute|import\.meta\.env|from \"vite\"" src || echo "clean"`
Expected: `clean`.

- [ ] **Step 3:** Dev smoke — `npm run dev`, then load each screen and watch the console:
`/` (generate a banner), `/history`, `/history/[id]`, `/account` (→ `/billing`), `/billing`, `/admin`, `/login`. Confirm undo/redo works in the editor header. No 404/500/runtime errors.

- [ ] **Step 4:** Push branch (triggers Vercel deploy).
Run: `git push origin ui-updates`

---

## Self-review notes
- Spec §1–§5 all mapped: styles+ui (T1), editor-history (T2), simple components (T3), AppHeader (T4), ImageGenApp+merges (T5), pages (T6), billing (T7), verify (T8). Server "do-not-touch" enforced via Global Constraints.
- No placeholders: each task names exact archive source path, target path, adaptation grep, and verification command.
- Type consistency: `useEditorHistory()` surface (`canUndo/canRedo/undo/redo/register/record`) defined in T2 and consumed identically in T4/T5.
