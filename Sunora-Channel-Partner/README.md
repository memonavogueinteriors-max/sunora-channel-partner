# SUNORA Channel Partner Portal

React + Vite frontend with Supabase Auth, PostgreSQL and Row Level Security.

## Current environment

- **Production URL:** https://sunora-channel-partner.vercel.app
- **Supabase project:** `gzuozbhrzwbugbkdeogb` (active/healthy)
- **Partner invitation Edge Function:** `partner-invite` — active, version 6, JWT required
- **Production deployment verification:** Vercel status check for merged commit `82b7a1a` is **success**. The connected Vercel tools cannot resolve the project and the public URL could not be independently opened; live UI interaction is not independently verified.

## Implemented features

- Role-aware login and database policies for Admin, Staff, and Partner.
- Partner registration and database-generated monthly IDs in the `CHYYYYMMNNN` format, with a unique partner code and parent-partner relationship.
- Social profile platform selection and handle/profile URL fields stored in `partners.social_media_profiles`.
- Partner invitations via the `partner-invite` Supabase Edge Function, including retry action for partners without a linked login.
- Referral pipeline (New, Contacted, Qualified, Converted, Lost) with partner attribution.
- Invoice recording with AED/USD, fixed QA/business conversion rate of 3.68, 5% VAT, additional project costs, separate savings ledger, and profit tiers.
- Profit approval and project-completion checks; profit eligibility requires Admin approval plus all completion checks.
- Partner and admin dashboards, monthly report, CSV export, and partner monthly statement preview.
- Audit log, in-app notifications, and payout ledger tables.

## Profit payout workflow (Nov 26, 2026)

- Applied migrations: `20261126115630_profit_payout_workflow`, `20261126120922_profit_payout_role_guard_null_fix`, `20261126121202_index_uncovered_foreign_keys`, and live migration `20261126173908_unique_profit_payout_per_commission`. Category 5 cleanup migration version `20261126184841` is also applied.
- Admin/Staff can create a pending payout for an approved, project-eligible profit.
- Only Admin can mark a pending payout paid; payment date and reference are required.
- Payouts are full-profit only (no partial payments); one payout per profit.
- Database trigger guardrails re-check eligibility and amount/currency, lock the profit record, and prevent direct-table bypass.
- Role checks fail closed for users with missing profiles (SQL `NULL` is explicitly coalesced before comparison).
- Pending and paid transitions are audit logged; a paid payout triggers partner notification when the partner has a linked portal login.
- Rollback-only QA was run; no payout records were created. The live payout table remains empty.
- Accounts payout UI is merged; regression suite and build checks passed for the referenced changes, but live UI interaction remains unverified.
- Live database read-back verified `commission_id` is NOT NULL, the unique constraint exists, there are no null or duplicate commission IDs, and payout row count is zero.
- The live advisor identified a redundant standalone unique index. Category 5 cleanup migration `20261126184841` removed it; live read-back confirms the unique constraint remains, the duplicate index is gone, and the payout table is still empty.

## Sale integrity update (Nov 26, 2026)

The database now has an atomic RPC, `sunora_create_sale_bundle`, used by the invoice form. It creates the sale, additional-cost line, profit record, and referral conversion in one transaction; retrying the same invoice with matching details returns the existing sale instead of duplicating records. It also rejects mismatched partner/referral attribution and conflicting invoice details.

Additive database safeguards now include:

- Case-insensitive global invoice-number uniqueness.
- One sale per referral.
- Duplicate email and normalized phone protection within the same partner's referral list.
- A database trigger that validates referral-to-partner attribution and converts the referral status when a sale is linked.

## Current database snapshot (Nov 26, 2026)

| Record type | Count |
|---|---:|
| Partners | 3 |
| Referrals | 0 |
| Sales | 2 |
| Profit records | 2 |
| Project-cost entries | 0 |
| Profit payouts | 0 |
| Savings payments | 0 |

No temporary QA records were left in the database after rollback tests.

## Database setup / migration warning

`supabase/schema.sql` is an older starter schema and is **not a complete current-production bootstrap**. The live database has eleven migrations recorded. The current Category 5 migration-source reconciliation branch restores two missing source migrations, aligns two source filenames with live versions, and includes a pending privilege-hardening migration for six RLS-protected tables. This work is not yet merged or certified as a clean-install chain because the starter schema still lacks several current financial and notification objects. Do not recreate production or apply the starter schema until full clean-install validation passes.

For the existing project, changes are applied through reviewed Supabase migrations. For local development:

1. Install Node.js LTS.
2. From `Sunora-Channel-Partner`, run `npm install`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run `npm run dev`.
5. Run `npm test` and `npm run build`.

Never expose the Supabase service-role key in any `VITE_*` variable or commit secrets.

## Category ledger and remaining roadmap

- **Category 1:** Done & Verified.
- **Category 2:** Done but Not Yet Verified — manual verification is parked. Do not run live invitation/email, registration/activation, password/login, onboarding, live referral UI/attribution, or live payout UI tests until requested.
- **Category 3:** Done & Verified.
- **Category 4:** Done & Verified — payout uniqueness migration applied and read-back verified in the live database.
- **Category 5:** Current focus; remaining implementation and safe verification:
  - Partner referral status/conversion notification coverage (without live invitation/onboarding testing).
  - Monthly statement PDF generation and email delivery scaffolding (no real emails).
  - Google Sheets sync implementation with safe dry-run, retry and idempotency (no external writes).
  - Zoho Books integration scaffolding only, pending credentials and authorization.
  - Recursive referral-branch visibility with secure RLS checks.
  - Migration-source reconciliation and clean-install chain.
  - Security/performance cleanup and acceptance tests outside Category 2.

## Security and performance notes

- Supabase advisor flags `partner_month_sequences` as RLS enabled without policies. This is intentional: client SELECT/INSERT/UPDATE privileges are denied and IDs are allocated through the protected database function.
- Six `SECURITY DEFINER` functions remain executable by authenticated users for role lookup and guarded sale/payout RPCs; anonymous execution is denied. Review their scopes carefully before changing grants.
- Leaked-password protection is reported disabled; enablement requires an Auth configuration review and is not yet verified.
- The performance advisor reports 24 unused indexes (14 FK-supporting indexes plus 10 pre-existing). Do not drop them without query and FK analysis.
- Live read-back confirms the duplicate unique index on `commission_payouts.commission_id` was removed while the unique constraint remains.
- Live catalog inspection found `anon` and `authenticated` currently have `TRUNCATE` and other broad table privileges on six RLS-protected tables (`referrals`, `commission_payouts`, `sale_commissions`, `sale_project_costs`, `sunora_audit_log`, and `sunora_product_prices`); all table policies are scoped to `authenticated`. Category 5 proposes revoking `PUBLIC`/`anon`/`authenticated` broad grants on those tables, then restoring authenticated CRUD and service-role access. This migration is pending review/CI and has not been applied.

## Finance rules currently in code

- 1–3 panels: 0%
- 4–50: 5%
- 51–100: 10%
- 101–150: 15%
- Above 150: manual rate approval
- Profit base excludes VAT. Additional project costs are currently included in the pre-VAT profit base; confirm the accounting rule before real payouts.
- Profit is separate from the legacy savings ledger.
