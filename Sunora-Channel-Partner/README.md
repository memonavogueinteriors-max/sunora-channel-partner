# SUNORA Channel Partner Portal

React + Vite frontend with Supabase Auth, PostgreSQL and Row Level Security.

## Current environment

- **Production URL:** https://sunora-channel-partner.vercel.app
- **Supabase project:** `gzuozbhrzwbugbkdeogb` (active/healthy)
- **Partner invitation Edge Function:** `partner-invite` — active, version 6, JWT required
- **Production deployment verification:** Vercel status check for merged commit `82b7a1a` is **success**. The connected Vercel tools cannot resolve the project and the public URL could not be independently opened; the deployment check passed, but live UI interaction is not independently verified.

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

- Applied migration: `20261126115630_profit_payout_workflow`.
- Admin/Staff can create a pending payout for an approved, project-eligible profit.
- Only Admin can mark a pending payout paid; payment date and reference are required.
- Payouts are full-profit only (no partial payments); one payout per profit, with duplicate creation idempotent.
- Database trigger guardrails re-check eligibility and amount/currency, lock the profit record, and prevent direct-table bypass.
- Pending and paid transitions are audit logged; a paid payout triggers partner notification when the partner has a linked portal login.
- Rollback-only QA was run against the migration before applying; no payout records were created. The live payout table remains empty.
- Accounts payout UI is merged in PR #1; Vercel check succeeded for the merge commit, but live browser interaction remains unverified.

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

`supabase/schema.sql` is an older starter schema and is **not a complete current-production bootstrap**. The live database has seven migrations recorded, including the new profit payout workflow migration. Earlier referral, social-profile, RLS optimization, and security migrations are still not fully synchronized in the repository. Do not recreate the production database or apply the starter schema to it. Migration-source reconciliation is still required before a clean environment can be provisioned safely from Git.

For the existing project, changes are applied through reviewed Supabase migrations. For local development:

1. Install Node.js LTS.
2. From `Sunora-Channel-Partner`, run `npm install`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run `npm run dev`.
5. Run `npm run build` for the production build.

Never expose the Supabase service-role key in any `VITE_*` variable or commit secrets.

## Remaining roadmap

- Accounts payout UI/build/deployment validation (backend RPCs and database guardrails are implemented and applied; UI is in PR #1 pending build/deployment verification).
- Referral status and conversion notifications to partners (status updates are currently stored; partner notification coverage is incomplete).
- Monthly statement PDF generation and automated email delivery.
- Google Sheets sync (the current folder is documentation only; no active sync function).
- Zoho Books API integration.
- Recursive referral-branch visibility for partner logins (current access is limited to the partner and direct children).
- Full end-to-end UI testing of registration, invitation delivery, password setup, partner login, referrals, invoice, profit approval, completion, and payout.
- Reconcile the database's applied migration history and restore a complete clean-install schema/migration chain.
- Security follow-up: enable leaked-password protection in Supabase Auth after configuration review. Supabase advisors also report 14 unindexed foreign keys and 10 unused indexes; these are being reviewed rather than removed blindly.

## Finance rules currently in code

- 1–3 panels: 0%
- 4–50: 5%
- 51–100: 10%
- 101–150: 15%
- Above 150: manual rate approval
- Profit base excludes VAT. Additional project costs are currently included in the pre-VAT profit base; confirm the accounting rule before real payouts.
- Profit is separate from the legacy savings ledger.
