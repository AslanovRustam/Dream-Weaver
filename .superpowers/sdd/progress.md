# SDD Progress — Archive UI Port to Next.js

Plan: docs/superpowers/plans/2026-07-10-archive-ui-port-to-nextjs.md
Branch: ui-updates
Archive source: C:\Users\user\Desktop\Archive (6)

## Task ledger
- Task 0: complete (baseline tsc clean exit=0; full build deferred to Task 8 to avoid dev-server .next conflict)
- Task 1: complete (commit f6d222b, review clean — tokens merged, Tailwind v4 header intact, no server files touched)
- Task 2: complete (commit d10acc8, review clean — useEditorHistory {canUndo,canRedo,undo,redo,register,record,reset}, mounted inside GenerationProvider)
- Task 3: complete (commit 4b8e2ee — 4 components + assets; PresetSidebar .src fixes; 1 EXPECTED carried tsc error ImageGenApp.tsx:1233 missing tiles/batchStatus props → clears in Task 5)
- Task 4: complete (commit f786c7d, review clean — 9 Link href + 3 useRouter + usePathname; undo/redo wired; GenerationIndicator kept; only known 1233 error remains)
- Task 5: complete (commit 22eb34e, tsc=0, review clean & verified — ImageGenApp ported + editor wired + tiles/batchStatus passed (1233 cleared); generation-context/imageGen/auth-context correctly KEPT current (archive deltas were dev-sim/dev-auth-bypass; current error handling is a superset); formatGenerationError preserved; bannerSizes UI-copy applied; DEV_PREVIEW_RESULT=false)
- Task 6a: complete (NO-OP — home/login/reset-password already byte-identical to archive markup + routing already adapted at migration e4402b0; tsc=0; auth wiring intact)
- Task 6b: complete (commit 05a1e31, tsc=0, verified — account redesign + change-password preserved + billing links + /api/me GET/PATCH kept; history list visual; history detail already ported)
- Task 6c: complete (NO-OP verified — archive admin has NO redesign delta; current admin already = archive + RBAC (RoleDialog/ROLES/TIERS//api/admin/role all present); tsc=0)
- Task 6: COMPLETE (all pages). Real work was 6b only (account/history). 6a/6c already ported at migration e4402b0.
- Task 7: complete (commit 783caad, tsc=0 — /billing page created + wired)
- Task 8: complete — full tsc=0, next build SUCCESS (31 routes incl /billing, /api/admin/role, /api/auth/change-password), no TanStack/vite leaks.
- FINAL WHOLE-BRANCH REVIEW (opus): 1 Critical + 4 Minor.
  - CRITICAL (FIXED, commit 1974191): generation errors swallowed — runMaster returns null (no throw), unconditional setStatus("success") masked errors, GenerationErrorCard unreachable. Fixed: drive error branch off gen.status/gen.errorMsg; setStatus(img?"success":"idle"). Rebuilt clean.
  - MINOR (open, for user triage — NOT blocking):
    1. Dead code in ImageGenApp: onModelChange (unused after ModelToggle removed) + write-only history/setHistory state.
    2. AppHeader shows placeholder identity "John Doe"/"john.doe@example.com" + fake "8/10" credits when /api/me is null/slow/failed. UX risk.
    3. Resize batch running modal has no in-modal cancel (only header GenerationIndicator ✕).
    4. editor-history: stray undo snapshot possible after navigating away and back (provider never unmounts). Cosmetic.
- STATUS: PORT COMPLETE. All verification green. Awaiting user smoke + decision to push (deploy).
- MERGE NOTES (current-only features to PRESERVE):
  - admin (Task 6c): RBAC — import {ROLES,TIERS} from @/lib/rbac, RoleDialog component, /api/admin/role calls, "Роль · Тариф" column. Archive lacks these.
  - account (Task 6b): /api/auth/change-password password-change feature. Archive lacks it.
