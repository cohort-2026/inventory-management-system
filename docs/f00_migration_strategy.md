# F00 migration-history decision

## Current state
Earlier files `003_custom_auth_storage.sql`, `004_detach_supabase_auth.sql`, and `005_case_insensitive_user_emails.sql` were applied historically. A newly reconstructed `001_current_state_baseline.sql` reflects their final effects and is **not** the original initial migration.

## Recommended approach
Use an explicitly separate **fresh-install track** (`database/001_current_state_baseline_VERIFIED_ON_TEST.sql`) on new empty projects, preserving historical 003–005 in the existing repository for audit. Do **not** create a simple sequential migration runner that applies 001 then 003, 004, 005. Future schema changes should be new incremental migration scripts documented with baseline applicability; adopt a formal migration tool only after recording which databases have the consolidated snapshot versus legacy chain.

## Before promoting to production-grade reproducibility
Compare the rebuilt database with production for constraints, grants/ownership, public and non-public objects, triggers, default privileges, extensions, policies and auth integrations. SQL Editor catalog exports are not a complete `pg_dump`. Review the imported public functions for legacy Supabase Auth coupling. Also add a migration ledger and implement repeatable test-user provisioning without embedding credentials in Git.

**No production DDL is included or recommended in this stage.**
