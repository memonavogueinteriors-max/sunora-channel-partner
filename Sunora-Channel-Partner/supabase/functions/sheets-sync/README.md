# Google Sheets sync (next integration)

Google Sheets sync is intentionally not active yet. Do not put Google service-account JSON, OAuth refresh tokens, or a Supabase service-role key in the browser or repository.

Recommended production pattern:
1. Create a dedicated Google Cloud project and a service account with access only to the target spreadsheet.
2. Store the Google credentials and spreadsheet ID as Supabase Edge Function secrets.
3. Implement a Supabase Edge Function that verifies the caller is admin/staff, fetches only permitted records, and upserts rows using stable database IDs as idempotency keys.
4. Trigger it after committed records or run a scheduled reconciliation. Log failures, retry safely, and do not let Sheets become the source of truth for financial records.
5. Test permission denial, duplicate retries, deleted/voided invoices and rate limits before enabling.

This folder is documentation only; the sync function still needs implementation and testing.
