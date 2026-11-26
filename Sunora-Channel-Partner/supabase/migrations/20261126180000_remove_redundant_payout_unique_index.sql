-- Category 5: remove the redundant unique index introduced by the payout guard migration.
-- The table already has a unique constraint on commission_id; retain that constraint
-- and its backing index while removing the standalone duplicate index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commission_payouts'::regclass
      AND conname = 'commission_payouts_commission_id_key'
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'Expected unique constraint commission_payouts_commission_id_key is missing; refusing to drop redundant index.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commission_payouts WHERE commission_id IS NULL
  ) THEN
    RAISE EXCEPTION 'commission_id contains nulls; refusing index cleanup.';
  END IF;
END;
$$;
DROP INDEX IF EXISTS public.commission_payouts_commission_id_uidx;
