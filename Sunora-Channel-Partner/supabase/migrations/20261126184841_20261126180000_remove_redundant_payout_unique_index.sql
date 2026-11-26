-- Category 5: remove the redundant unique index introduced by the payout guard migration.
-- Retain the unique constraint on commission_id and its backing index.
-- Guard against a same-named but differently-defined constraint before cleanup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commission_payouts'::regclass
      AND conname = 'commission_payouts_commission_id_key'
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (commission_id)'
  ) THEN
    RAISE EXCEPTION 'Expected UNIQUE (commission_id) constraint commission_payouts_commission_id_key is missing or differs; refusing to drop redundant index.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commission_payouts WHERE commission_id IS NULL
  ) THEN
    RAISE EXCEPTION 'commission_id contains nulls; refusing index cleanup.';
  END IF;
END;
$$;
DROP INDEX IF EXISTS public.commission_payouts_commission_id_uidx;
