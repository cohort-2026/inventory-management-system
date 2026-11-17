# F06 — Integration and acceptance checklist

## Source audit (context(2).zip, 17 Nov 2026)

- No suppliers/receiving source files in the supplied snapshot; no supplier, receipt, purchase or delivery tables in the user's read-only database inventory.
- F01 service `backend/src/services/stockMovementService.ts` posts stock and ledger rows using the caller's `PoolClient` and `withTransaction`.
- Existing `RECEIPT` movements (2 in user SQL results) have **no** `reference_id`; leave those untouched. New formal GRNs use `reference_id = receipt_id` and `reference_no = GRN-xxxxxx`.
- `public.inventory` has a unique product/location pair and a nonnegative constraint.
- The snapshot omits `backend/src/index.ts`, middleware files, root `tsconfig.json`, deployment configuration, and the database folder. Therefore full build/integration results cannot be claimed from this archive alone.

## Integration steps — feature branch, not production-first

1. Checkout feature branch from latest `main`. Back up the database; test migration in a disposable Supabase project first.
2. **Important:** Check existing migration filenames. `007_f06_supplier_receiving.sql` is a suggested number; rename it to the next free migration version if necessary.
3. Apply `database/migrations/007_f06_supplier_receiving.sql` in the test project's SQL editor. The migration adds three RLS-enabled tables, indexes, GRN sequence and posted-document guards. It deliberately does **not** generate supplier seed records or alter existing stock.
4. Copy **new** files into matching `backend/src` and `frontend/src` directories. The four **existing** files (`stockMovementService.ts`, `App.tsx`, `SideBar.tsx`, `StockMovementHistory.tsx`) must be integrated using the accompanying `F06_existing_files_only.patch` after `git apply --check`, or by manually reviewing the changes. Do not blindly replace these files, and do not apply both the diff and a full-file replacement. Only the stock movement service's optional `reference_id` support is necessary in its existing file.
5. The upload does **not** contain `backend/src/index.ts`. Manually add route registration to the real server entry point (after JSON parser and before any 404 handler). Existing mounts must remain unchanged:

   ```ts
   import { supplierRouter, receiptRouter } from './routes/receiving';
   app.use('/api/suppliers', supplierRouter);
   app.use('/api/receipts', receiptRouter);
   ```

6. Verify your Vercel or similar proxy forwards `/api/suppliers` and `/api/receipts` to the backend, through the same authentication mechanism used by existing pages.
7. Run the read-only preflight query for an active RECEIPT reason code; the posting service requires one. **Do not invent a reason code silently.** If none exists, configure one according to your existing F01 reason-code migration and approval process.
8. Run backend `npm run build`, frontend `npx tsc -b`, `npm run build` and `npm run lint`. Run existing regression tests and F06 acceptance tests below. Keep exact error output for failures.
9. Deploy after the test database passes; independently verify role permissions and receipt movement totals on deployed setup. Have your teammate review the feature branch before merge.

### Active reason-code preflight (read-only)

```sql
SELECT reason_code_id, code, label, requires_note, active
FROM public.reason_codes
WHERE movement_type='RECEIPT'
ORDER BY active DESC, code;
```

The backend uses the first active RECEIPT reason code in lexical code order. If your project has more than one semantically distinct active receipt reason code, coordinate the required selection logic with F01 before deployment.

## API contract

- `GET /api/suppliers` — `{items: Supplier[]}`; Manager, Inventory Staff, Viewer.
- `POST /api/suppliers` — `{supplier_code,name,contact_name?,email?,phone?,address?}`; Manager and Inventory Staff.
- `PATCH /api/suppliers/:id` — `{name?,contact_name?,email?,phone?,address?,status?}`; Manager and Inventory Staff.
- `GET /api/receipts` — `{items,total,page,pageSize}`; optional `?status=draft|posted&page=N`.
- `POST /api/receipts` — `{supplier_id,location_id,delivery_note,notes?}`; creates draft.
- `GET /api/receipts/:id` — `{receipt,lines}`.
- `PUT /api/receipts/:id/lines` — `{lines:[{product_id,expected_packs,received_packs,units_per_pack,unit_cost?,short_delivery_note?},...]}`; **replaces all draft lines** (1–100 lines); returns `{receipt,lines}`.
- `POST /api/receipts/:id/post` — empty object; locks receipt, validates and posts all positive received lines in **one** transaction; returns `{receipt_id,receipt_no,status,movements}`; repeat returns 409.

The receiving location belongs to the receipt, not individual lines. Each product can appear once per GRN. `expected_packs` and `received_packs` are pack counts; `units_per_pack` is the conversion to the product's **base unit**. `unit_cost` is reserved for valuation and does not change ledger cost yet. All API requests use `credentials:'include'`.

## Acceptance tests (test database only)

1. Create one active supplier. Attempt duplicate supplier code — expect 409.
2. Create one draft using valid supplier, active location and delivery note. Try duplicate `supplier_id`+`delivery_note` — expect 409. Empty delivery note — 400.
3. Add three **distinct active products** with positive `received_packs`; one line should have 4 received packs and 24 units per pack. Verify its base units = 96. Set a short line with received < expected and no explanation — expect 400 and **no line changes** (atomic PUT). Save with an explanation.
4. Before posting, verify no new stock movement and no inventory increase. Save line edits and refresh; they should persist.
5. Post as Manager or Inventory Staff — expect three `RECEIPT` ledger movements, all with the same GRN reference ID and number, positive changes, correct actors and `quantity_after`; one should be +96.
6. Compare inventory quantities with the latest movement balances. Post again — 409, no extra ledger rows. Try PUT lines again — 409, no changes.
7. Attempt API POST receipt, PUT lines and POST posting as Viewer — 403. Verify Viewer can load supplier list, GRN list and posted detail.
8. Test a fourth zero-received line: preserve it on the GRN with an explanation if short, but create **no zero-quantity** movement for it. Post requires at least one positive line.
9. Test invalid/inactive product/location/supplier; all fail without partial stock changes. Check parallel double-post attempts: exactly one succeeds and one 409.
10. From the posted receipt, open `Movement History` filtered by `reference_id`; from a movement's details, follow the GRN link back. Existing F02 transfer details and export must remain functional.
11. Verify loading, empty, error/retry, small-screen scrolling, keyboard operation. Confirm full builds, target tests, lint outcomes and deployed behaviour with the reviewer.

## Expected SQL evidence

Run `database/verification/verify_f06_read_only.sql` after sample postings. For a three-line all-positive GRN, `receipt_movements` must be exactly 3. A zero-received line remains in the lines table with no matching movement. Do not assume older standalone RECEIPT movements have GRNs.

## Migration reversal

If applied **only to an empty disposable database** and no GRN data exists, the safe cleanup is provided in `database/migrations/007_f06_rollback_EMPTY_TEST_ONLY.sql`. **Never run rollback in production or after recording suppliers/receipts.** For a production rollback after use, retain tables and disable feature routes while planning a data-preserving reverse migration.

## Known limits and explicit follow-ups

- The ZIP snapshot is not runnable as a complete repo, so TypeScript **parser validation only** was performed on the patch, not full app builds or live Supabase tests.
- The supplied F02 UI now accepts `?reference_id=...` deep links; this is a narrow backward-compatible change and does not change the existing movement API.
- GRN numbering is sequential but gaps may occur on transaction rollback (expected PostgreSQL sequence behaviour).
- This phase records **numeric unit cost** without currency conversion, tax, purchase order matching or supplier invoice reconciliation; these are later features.
- Supplier list is capped at 500 and receipt list at 50 per page. Add advanced supplier pagination and receipt search if operations require more than these volumes.
