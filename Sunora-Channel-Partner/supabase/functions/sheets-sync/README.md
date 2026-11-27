# Google Sheets sales sync

The sales-sync Edge Function and its service-role lock are merged into the repository but remain undeployed. **Do not deploy or enable write mode until the migration is applied, Deno checks are run, and the spreadsheet/credentials/privacy scope are approved.** Supabase remains the source of truth.

## Safety controls

- Requires an authenticated Admin or Staff profile; Partner roles are denied.
- Defaults to `dry_run: true`. Dry-run maps sales and returns a small preview; it does not call Google APIs or read/write a spreadsheet.
- Write mode requires explicit `dry_run: false`, the spreadsheet ID, and a Google service-account JSON secret.
- Sales are fetched in bounded 500-row pages with deterministic invoice-date/ID ordering, so the Supabase REST row limit cannot silently truncate the sync. Page errors fail the sync instead of returning partial data.
- Partner IDs are looked up in 100-ID chunks to keep request URLs bounded and prevent the related partner list from being silently truncated by the REST row limit.
- Only invoice/sales fields are mirrored. Emails, phone numbers, auth data, payout data and notes are excluded.
- Google Sheets API values use `RAW`, so formula-like text is stored as text.
- Sale database IDs are the stable key in column A. Existing IDs update in place; missing IDs append.
- A service-role-only, four-minute lease prevents overlapping invocations.
- Google read and idempotent update requests retry transient errors. Append requests are not blindly retried; the function re-reads the sheet to reconcile after an ambiguous error.
- Duplicate IDs already in the sheet or a header mismatch stop the run. Request bodies accept only the optional `dry_run` boolean, so misspelled or extra fields fail validation.
- Every source sale must resolve to a partner record; a missing partner reference fails closed instead of writing blank partner identity columns.
- Read-back verification checks the exact 12-column header, exactly one row per incoming sale ID, and exact values for all 12 columns. A header drift or duplicate row cannot be reported as verified.
- The pure sync planner and read-back verifier are covered by regression tests using fixture data; these tests never call Google or Supabase APIs.

## Request

POST with a Supabase user access token:

```json
{ "dry_run": true }
```

Dry-run is the default. Explicit write mode:

```json
{ "dry_run": false }
```

## Secrets

Configure these as Supabase Edge Function secrets, never commit them:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: dedicated service-account credentials.
- `GOOGLE_SPREADSHEET_ID`: target spreadsheet ID.
- `GOOGLE_SHEET_TAB_NAME`: optional tab name (default `Sales`).
- Supabase's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already provided to Edge Functions.

Share the target spreadsheet with the service account as Editor, and only for that spreadsheet.

## Columns

The first row is the fixed header:

`sale_id, invoice_number, partner_id, partner_code, partner_name, invoice_date, product_description, panel_quantity, currency, subtotal_ex_vat, vat_amount, total_inc_vat`

## Deployment gate

No Google credentials exist in the repository. The function has not been deployed, the lock migration has not been applied, and no external Sheets write has been performed. Before production deployment, run a Deno check, deploy the migration, configure secrets, and perform an authenticated dry-run. Keep write mode disabled until the user approves the destination and sync policy.
