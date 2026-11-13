# F00 — Fresh setup on a disposable Supabase project

## Purpose and safety
This procedure provisions a **new, empty test Supabase project**, not the live database. The verified schema snapshot is a consolidated **current-state baseline**. Never apply it to an existing database; do not apply historical migrations 003–005 after it.

## 1. Database
1. Create a new separate Supabase project; record the project name and project reference without committing credentials.
2. Open its SQL Editor and run `database/001_current_state_baseline_VERIFIED_ON_TEST.sql` **once**.
3. Run `database/seed/001_roles.sql`.
4. Run `database/verification/verify_baseline.sql`; expect 12 public tables and the three roles.
5. Open `database/seed/002_demo_catalog_TEST_ONLY.sql`; review the active Supabase project. **Uncomment its `SELECT set_config(...)` line deliberately**, then run the whole SQL script in one execution. The guard blocks accidental execution otherwise.
6. Run `database/verification/verify_demo_catalog.sql`. Expect at least 3 roles, 7 categories, 3 locations and 15 product SKUs. Immediately after the seed, expect zero inventory and stock movement rows.

Do not run the demo seed against production; the opt-in guard is a last check, not a complete substitute for verifying your connection.

## 2. Private local configuration
- In `backend/`, create a **local** `.env` from the documented examples with `DATABASE_URL` for the **disposable** project and the required mail/session settings. Never commit it.
- If `backend/src/db/pool.ts` uses a local CA file, keep that public certificate in the expected `backend/certs/prod-ca-2021.crt` path or configure `DATABASE_CA_CERT` locally.
- `frontend/.env.local`: set `VITE_API_URL=http://localhost:5000` (no `/api` suffix). Use same-origin Vercel rewrite in production as previously configured.
- Do not restore old `JWT_SECRET`/legacy login imports if the currently deployed custom auth flow no longer uses them.

## 3. Build and start (PowerShell, separate terminals)
```powershell
cd backend
npm ci
npm run build
npm run dev
```
```powershell
cd frontend
npm ci
npx tsc -b
npm run build
npm run dev
```
Verify `http://localhost:5000/health` and front-end login. The original repository ZIP predates F00 Stage 1 and may not include the latest auth cleanup; use your current working branch.

## 4. Test accounts and inventory: no SQL shortcuts
- The catalogue seed intentionally **does not** create user credentials, email verification tokens, sessions, inventory balances or stock movements.
- Public registration is disabled by Stage 1. For test-only account onboarding, use an explicitly reviewed, **local-only** registration workflow if available; otherwise implement an audited admin-only test-account provisioning command before claiming a full one-command seed. Do not directly insert active users without secure password hashing and verification handling.
- After real test users can authenticate, create opening stock **through the authenticated adjustment/receipt workflow** so stock movement rows are created atomically. Never `INSERT` directly into `inventory` to simulate stock.
- Test Manager / Inventory Staff / Viewer permissions using three independently controlled test accounts.

## 5. Final verification checklist
- [ ] Fresh schema and catalogue seed pass their read-only checks.
- [ ] Backend starts locally against *test* DB; no JWT legacy import failures.
- [ ] Product and location lists show seed values.
- [ ] Test users can authenticate; Viewer cannot perform writes.
- [ ] An adjustment creates an inventory quantity **and** corresponding movement.
- [ ] An ineligible/inactive location request is rejected.
- [ ] A second run of reference/catalogue seeds introduces no duplicate rows.
- [ ] Frontend and backend builds and relevant tests pass.
- [ ] Deployed app is independently regression tested.

## Current limitation
This is a documented repeatable **schema + reference/catalogue seed**, not a fully automated five-user seeded application. Completion of F00 still needs secure test-account provisioning, a clean-slate backend regression test and migration history approval.
