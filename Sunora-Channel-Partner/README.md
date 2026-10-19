# Sunora Channel Partner Portal

A React + Vite + Supabase starter project for Sunora's online channel-partner management portal. It includes branded login, partner registration, database-generated partner IDs, referral relationships, Zoho Books invoice references, a savings ledger, payment history, CSV exports, and role-aware database access.

> **Production status:** This is the source code and deployment starter, not a deployed/verified production system. You must create a dedicated Supabase project, apply the schema, configure the first administrator, set environment variables, deploy to Vercel, and test the access policies before using real financial records.

## Stack
- React + Vite
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel hosting
- Sunora logo at `public/sunora-logo.png`

## 1. Install locally

Install Node.js LTS, then open PowerShell in this folder:

```powershell
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local` and set:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use the project's publishable key (or legacy anon key). **Never use `service_role` or secret keys in a Vite environment variable.** Any `VITE_` value is exposed to the browser.

Run:

```powershell
npm run dev
```

Check a production build:

```powershell
npm run build
```

## 2. Create a dedicated Supabase project

1. Create a NEW project named `Sunora Channel Partner` in Supabase. Do not reuse or overwrite the AMC, Task Tracker, or BBT database.
2. Open **SQL Editor** and run all of `supabase/schema.sql`.
3. Under **Authentication → URL Configuration**, add your eventual Vercel URL to Site URL / Redirect URLs after deployment.
4. Create your own admin user through Authentication. Confirm the matching row exists in `public.profiles`.
5. In SQL Editor, replace the email and run:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL';
```

6. Sign in to the app with that user. Add a test partner and invoice and verify generated code, savings and permissions before real use.

Partner codes follow `CHYYYYMMNNN`, e.g. `CH202610001`. The database generates them with a locked monthly counter so concurrent inserts do not reuse the same sequence. The code is a unique identifier; the parent relationship is stored separately.

## 3. Push this project to GitHub

Create an EMPTY repository named `sunora-channel-partner` under your company's GitHub account. Do not add a README/license in GitHub if you already have this local README.

Run these commands in PowerShell from the project folder:

```powershell
git init
git add .
git commit -m "Initial Sunora channel partner portal"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/sunora-channel-partner.git
git push -u origin main
```

Replace `YOUR-ORG` with the correct GitHub username or organisation. Never commit `.env.local`; `.gitignore` excludes it. Do not commit passwords, tokens, or Supabase service-role keys.

## 4. Deploy on Vercel

1. In Vercel choose **Add New → Project** and import the new GitHub repository.
2. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. In Vercel **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Apply variables to Production (and Preview if needed) and deploy.
5. Open the assigned `*.vercel.app` URL and test sign-in, data loading, partner creation, invoice entry, savings and payment history.
6. Add the exact Vercel URL to Supabase Auth URL Configuration. Redeploy if you change environment variables.

## 5. Important security and accounting checks before production

- The first administrator must be promoted in the database manually. Do not allow a public sign-up form to choose their own role.
- Do not allow partners to enter sales or payments unless the business explicitly decides to enable it; current SQL allows staff/admin writes only.
- The UI's partner scope is basic; the SQL policies are the real access boundary. Review and test them using separate admin, staff, and partner accounts.
- Current referral read policy exposes a partner's own record and direct children only. Recursive branch visibility should be implemented with a reviewed recursive query/RPC if full descendants are required.
- Current savings are calculated per invoice using the rate entered by staff. Confirm the approved rate and whether savings apply to invoice subtotal, discount, VAT, returns, or paid invoices before using real payouts.
- Payment entry currently records payment history, but does not enforce a server-side maximum against outstanding savings. Add a transactional payout function and audit trail before real payments.
- Duplicate invoice numbers are blocked per partner. For stricter accounting, also reconcile invoice numbers globally against Zoho Books and handle voids/credit notes.
- Google Sheets / Zoho Books synchronization is not yet connected. Do not store Google credentials in frontend code. Implement sync via a Supabase Edge Function or a trusted server, with secret values in Supabase/Vercel server-side secrets. Verify retries, duplicate prevention, logs, and access scopes.
- Consider adding immutable audit logs, MFA for administrators, email invitations/password resets, account deactivation, and scheduled database backups before rollout.

## 6. Current included features

- Sunora-branded responsive login and dashboard
- Partner registration and automatic monthly ID generation (database trigger)
- Parent/referrer field and referral tree display
- Invoice entry using Zoho Books invoice number
- Separate savings calculation and ledger
- Payment-history entries
- Search and CSV export
- Supabase Row Level Security policies

## 7. Not yet implemented

- Actual Google Sheets sync and Zoho Books API integration
- Automated partner invitations and account-to-partner linking screen
- Full recursive referral tree access for partner logins
- Transactional payout approval, balance validation, and audit log
- Live production deployment and verified end-to-end tests
