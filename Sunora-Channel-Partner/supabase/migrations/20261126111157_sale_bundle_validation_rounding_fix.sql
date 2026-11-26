-- The corrected function is included in the base migration for clean installs.
-- This marker documents the production rounding/NULL-validation follow-up.
comment on function public.sunora_create_sale_bundle(uuid, uuid, text, date, text, text, text, numeric, numeric, text, numeric, numeric, text)
  is 'Atomic sale/profit creation; validates panel size and normalizes savings rate to two decimal places.';