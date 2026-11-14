# F00 repository audit — stage 1

## Confirmed from the uploaded repository

- Express already calls `app.listen` in `backend/src/index.ts`; the briefing's claim that no local entry point exists is outdated.
- Authenticated inventory mutations generally use `requireSession` plus `customRequireRole`.
- Missing migrations: repository contains `003_custom_auth_storage.sql`, `004_detach_supabase_auth.sql`, `005_case_insensitive_user_emails.sql` but no initial schema migration (001/002). **Do not run these migrations against an empty database yet.** Export and review the actual Supabase schema first.
- Registration originally created an `active` Viewer immediately, pending email verification; after verification it could log in without manager approval. Stage 1 blocks public registration in production and by default in development. The full invitation/approval workflow is a separate feature.
- Archive originally allowed Inventory Staff; Stage 1 enforces Manager-only.
- Inventory Count controller contained a fail-open role fallback; Stage 1 uses the role already resolved by route middleware.
- Stock adjustments, transfers and count creation did not verify active location status. Stage 1 rejects inactive locations.
- UI sidebar linked to nonexistent `/reports`; showcase routes were exposed. Stage 1 removes those links/routes, not the source files.
- Shared UI state components introduced; migrate individual screens incrementally rather than rewrite all existing pages.

## Pending F00 work requiring schema/integration evidence

1. Reconstruct `001_initial_schema.sql` from a **schema-only** dump of the actual Supabase database; validate on a separate empty PostgreSQL database. Never guess live table constraints.
2. Build deterministic demo seed (roles, users, locations, products, movements) after agreeing IDs and safe password creation; never ship real credentials.
3. Audit DB constraints and movement arithmetic for each-based integer quantities and non-null reorder level; use safe migrations.
4. Review legacy JWT route/files, proxy trust and CSRF security; avoid removal without a full dependency search and tests.
5. Review account approval/invite path and provision manager-controlled onboarding (F15) before reopening registration.
6. Fix existing TypeScript/lint issues and add automated tests for 401/403, inactive locations and registration.
7. Test production after deployment, including registration 403, archiving staff 403, and stock operations at inactive locations 400.

## Local tests

- Backend: `npm ci`, `npm run build`, `npm run dev` (requires DB and env).
- Frontend: `npm ci`, `npx tsc -b`, `npm run build`, `npm run lint`.

Do not merge without testing existing adjustment, transfer, count and location flows.
