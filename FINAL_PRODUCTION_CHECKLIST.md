# ProPOS Production 1.0 — Final Hardening

Implemented in this build:
- Business/store foundation with `businesses`, `business_members`, `store_settings` and `business_id` on core business data.
- Business-scoped RLS policies for the current single-business deployment.
- Server-side report RPCs and paginated sales loading; dashboard/reports are no longer hard-limited to the last 200/500 sales.
- Product price/cost history recording.
- Settings persisted to Supabase with local fallback.
- Backup includes core tables, price history, store settings, local staff, offline sales and held sales.
- Backup restore modes: missing-only, merge/update, and explicit replace with confirmation.
- Existing customer sales without `customer_id` are reconciled by customer name where possible.
- Existing schema/data are preserved; migrations are additive.

Validation performed in this environment:
- Local import path audit: 0 missing imports.
- Backslash-backtick syntax audit: 0 matches.
- Targeted TypeScript parser/syntax audit on changed files: no TS1005/TS1109/TS1128/TS1136 syntax errors.
- Supabase production migration applied successfully for project `ukfeuojhigxxxlnhsmls`.
- Production data integrity checks: 0 orphan sale_items, 0 orphan customer_payments, 0 orphan sale_payments; 0 core records without business_id after migration.

Environment limitation:
- Full `npm ci` / Vite production build could not be completed in the container because the npm dependency install timed out. Run `npm ci && npm run build` in Node 24+ before publishing to Vercel.
