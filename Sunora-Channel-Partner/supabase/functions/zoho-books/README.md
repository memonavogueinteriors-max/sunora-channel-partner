# Zoho Books integration readiness scaffold

`supabase/functions/_shared/zohoBooksReadiness.js` validates the prerequisites without making network requests or writes.

Readiness requires a client ID, client secret, refresh token, organization ID, confirmed OAuth authorization, and a chosen integration direction (`import_invoices_from_zoho` or `export_invoices_to_zoho`). The direction remains unspecified until SUNORA approves the intended data flow. The helper always reports `networkEnabled:false` and `writesEnabled:false`.

Do not put Zoho credentials in Vite/browser environment variables or commit them. Actual OAuth, invoice mapping, tax handling, webhook/reconciliation and API calls are not implemented until direction and credentials are authorized.
