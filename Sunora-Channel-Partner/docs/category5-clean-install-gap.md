# Category 5: clean-install schema gap

**Read-only evidence gathered:** 2026-11-27. No table rows, partner records, financial data, or live schema were changed.

## Live catalog vs source bootstrap

- Live public schema contains **12 tables**.
- `supabase/schema.sql` creates **5 tables**: `profiles`, `partner_month_sequences`, `partners`, `sales`, `payments`.
- Live database has **15 migrations recorded**.
- The source migration `20261126083905_create_partner_referrals_pipeline.sql` creates `referrals`, so it is covered by the migration chain.
- The remaining six live tables are not created by the starter schema or current migrations:
  - `commission_payouts`
  - `notifications`
  - `sale_commissions`
  - `sale_project_costs`
  - `sunora_audit_log`
  - `sunora_product_prices`

The payout workflow, sales-bundle RPC, audit triggers, notification functions, product-price UI and commission ledger depend on these tables. A clean installation from the checked-in schema plus migrations therefore cannot recreate the complete live app yet.

## Evidence source

Read-only Supabase catalog queries used `information_schema.tables`, `information_schema.columns`, and the Supabase verbose table listing. Only table names, column metadata, and migration history were retrieved. No rows from business tables were read.

## Required remediation

1. Recover the canonical DDL for the six missing tables from a trusted source or reconstruct it from catalog metadata and reviewed source functions.
2. Include exact defaults, generated columns, check/unique constraints, foreign keys, indexes, RLS, policies, triggers, table grants, and function dependencies.
3. Reconcile the bootstrap schema and migration chain so fresh installs and upgrades produce the same schema.
4. Test the complete install in an isolated database before certifying it. A Supabase test branch may incur usage cost and must not be created without authorization; no local PostgreSQL/Supabase CLI is available in the current runtime.
5. Do not replace or reset the production schema as part of this remediation.

## Pending migration

The Category 5 Google Sheets sync lease migration `20261127001400_google_sheets_sync_lock.sql` is in source but has not been applied live. It is a service-role-only lock table/function pair. Its deployment remains gated on a review, isolated migration validation, and the Sheets integration setup approval.
