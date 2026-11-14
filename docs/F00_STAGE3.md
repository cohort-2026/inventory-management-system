# F00 — Stage 3: Integration and security gate

## Scope
This is a fast **release gate**, not a declaration that F00 is complete. It does not modify your existing backend controllers, routes, frontend pages, or database. The `f00-smoke-test.cjs` script sends only GET requests and deliberately invalid POST requests that must fail authorization or registration checks; it never submits valid stock changes. **Run against your local server using the disposable Supabase project, never your production DB.**

## 1. Prepare environment
- Keep the Stage 1 corrected imports and transfer `status` row type fix already made locally.
- Ensure old JWT config imports/routes are removed consistently, as reported by the team; don't copy the original `index.ts` over the current one.
- Backend `.env`: configure the disposable project's database URL, frontend origin, any SMTP configuration required by startup. Keep secrets out of Git.
- Set `NODE_ENV=development` or leave unset, but public registration must remain blocked when testing. `ALLOW_PUBLIC_REGISTRATION` must NOT be `true`.
- Start backend: `cd backend; npm run dev`; test `http://localhost:5000/health`.

## 2. Run builds
PowerShell, separately from repository root:
```powershell
cd backend
npm run build
cd ../frontend
npx tsc -b
npm run build
npm run lint
```
Lint acceptance is not met until lint passes; existing unrelated errors must be listed, not quietly ignored.

## 3. Smoke test
Run in PowerShell from `backend/`:
```powershell
$env:IMS_TEST_API_URL = 'http://localhost:5000'
$env:IMS_EXPECT_PUBLIC_REGISTRATION_BLOCKED = 'YES'
node scripts/f00-smoke-test.cjs
```
For full role coverage, set optional environment variables `IMS_MANAGER_EMAIL`, `IMS_MANAGER_PASSWORD`, `IMS_STAFF_EMAIL`, `IMS_STAFF_PASSWORD`, `IMS_VIEWER_EMAIL`, `IMS_VIEWER_PASSWORD` **in the current shell only**; don't put credentials in the script or console logs. The script checks `/me`, role-based reading, Viewer denied mutations, Staff denied count finalization. It does not test Manager writes because those would change inventory.

Expected: all executed checks PASS and process exit code 0. `SKIP` means untested, **not passed**.

## 4. Manual browser regression (disposable DB)
- Login/logout for each role, protected route redirect after logout.
- Dashboard, inventory, products, locations, counts and history load.
- Staff can open/create draft count; Manager finalizes only on **disposable data**.
- Adjustment and transfer still work on an active location; inactive location rejected.
- Mobile viewport 390px; keyboard navigation; loading/error/empty states.
- Confirm no development showcase links or dead Reports link.
- Refresh after authentication does not log user out.

## 5. Known gap and merge gate
- Latest live branch is **not** included in the prior repository archive; it predates the local fixes for `ProtectedRoutes.tsx` and `inventoryTransferController.ts`, and deletion of legacy `config.ts`. Thus this package cannot certify current build success.
- Previously identified registration, archive and count permission fixes must be confirmed on current branch, not inferred from patch files.
- Fresh baseline schema was tested in a separate project according to user report; successful deterministic seed and five-user login + opening stock have not been independently verified in this environment.
- CSRF protection: the `customAuthRoutes` origin/content-type guard is not a comprehensive cross-route CSRF strategy. Keep as a separate security follow-up; do not claim CSRF is solved.
- Old backend package declares `jsonwebtoken`/`bcrypt` and `@supabase/supabase-js`; determine actual imports before pruning; removing unused route imports does not prove packages are unused.
- SSL/connection pooling, app status guards, migration history and full security CI still require verification.

## Hand-off decision
A teammate can begin **a separate F1 feature branch** once local backend + frontend builds pass, login works, and required role/security regression checks pass. F00 stays **open** for unresolved acceptance criteria. This avoids misrepresenting a partial foundations milestone as complete.
