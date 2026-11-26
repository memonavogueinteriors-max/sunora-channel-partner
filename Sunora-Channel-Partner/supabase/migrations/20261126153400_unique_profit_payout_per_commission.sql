-- Category 4: enforce the one-payout-per-profit rule at the table level.
-- The RPC locks the commission row and is idempotent, but direct table writes
-- can otherwise bypass its existing-row lookup. Fail safely if legacy rows
-- would prevent this invariant from being enforced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.commission_payouts
    WHERE commission_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one payout per profit: null commission_id rows exist. Reconcile them first.';
  END IF;

  IF EXISTS (
    SELECT commission_id
    FROM public.commission_payouts
    GROUP BY commission_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one payout per profit: duplicate commission_id rows exist. Reconcile them first.';
  END IF;
END;
$$;

ALTER TABLE public.commission_payouts
  ALTER COLUMN commission_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_payouts_commission_id_uidx
  ON public.commission_payouts (commission_id);
