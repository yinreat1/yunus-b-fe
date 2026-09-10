# ProPOS FULL v3 test/fix notes

- Fixed `PCLayout` online state white-screen crash.
- Hardened sale creation for legacy/new Supabase schemas.
- Added rollback of applied stock changes when a multi-item sale fails midway.
- Added missing `sales.refund_*` / trash columns to full feature migration.
- Fixed offline queue so split payments preserve their payment splits during sync.
- Offline queue now uses unique queue IDs and survives individual sync errors.
- Added safer numeric totals for split payments.

## Required Supabase migration
Run the SQL files in `supabase/migrations` against the same Supabase project used by the app, especially:
`20260906130000_propos_full_features.sql`.

## Local validation
TypeScript source files were syntax-transpiled successfully with TypeScript 5.8.3. Full `npm ci` / Vite production build could not be completed in the sandbox because the package registry dependencies were not fully cached. The current `@zxing/library@0.23.0` release declares Node >=24.
