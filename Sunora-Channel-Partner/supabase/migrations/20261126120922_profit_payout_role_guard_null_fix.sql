-- Fail closed when an authenticated user has no role/profile.
-- NULL <> 'admin' evaluates to NULL in SQL, so explicitly coalesce it.
CREATE OR REPLACE FUNCTION public.sunora_guard_profit_payout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_approval text;
  v_eligibility text;
  v_profit numeric;
  v_currency text;
BEGIN
  v_role := public.current_user_role();

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NOT coalesce(public.is_staff_or_admin(), false) THEN
      RAISE EXCEPTION 'Staff or Admin access is required to create a payout.';
    END IF;
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Payouts must start in pending status.';
    END IF;
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Payout amount must be greater than zero.';
    END IF;

    SELECT approval_status, eligibility_status, commission_amount, commission_currency
      INTO v_approval, v_eligibility, v_profit, v_currency
      FROM public.sale_commissions
      WHERE id = NEW.commission_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profit record not found.';
    END IF;
    IF v_approval <> 'approved' OR v_eligibility <> 'eligible' OR v_profit IS NULL OR v_profit <= 0 THEN
      RAISE EXCEPTION 'Only approved, eligible profits with a positive amount can be paid.';
    END IF;
    IF NEW.amount IS DISTINCT FROM v_profit OR NEW.currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'Payout must equal the full approved profit amount and currency.';
    END IF;

    NEW.created_by := auth.uid();
    NEW.payment_date := NULL;
    NEW.payment_reference := NULL;
    NEW.paid_by := NULL;
    NEW.paid_at := NULL;
    RETURN NEW;
  END IF;

  IF coalesce(v_role, '') <> 'admin' THEN
    RAISE EXCEPTION 'Only Admin can confirm a payout as paid.';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Only a pending payout can transition to paid.';
  END IF;
  IF NEW.commission_id IS DISTINCT FROM OLD.commission_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payout identity, amount, currency and creator are immutable.';
  END IF;
  IF NEW.payment_date IS NULL OR NULLIF(trim(NEW.payment_reference), '') IS NULL THEN
    RAISE EXCEPTION 'Payment date and payment reference are required.';
  END IF;

  SELECT approval_status, eligibility_status, commission_amount, commission_currency
    INTO v_approval, v_eligibility, v_profit, v_currency
    FROM public.sale_commissions
    WHERE id = NEW.commission_id
    FOR UPDATE;
  IF NOT FOUND OR v_approval <> 'approved' OR v_eligibility <> 'eligible'
     OR v_profit IS NULL OR v_profit <= 0
     OR NEW.amount IS DISTINCT FROM v_profit
     OR NEW.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'Profit is no longer eligible for payment.';
  END IF;

  NEW.paid_by := auth.uid();
  NEW.paid_at := now();
  NEW.payment_reference := trim(NEW.payment_reference);
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.sunora_mark_profit_payout_paid(
  p_payout_id uuid,
  p_payment_date date,
  p_payment_reference text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_payout public.commission_payouts%rowtype;
  v_commission public.sale_commissions%rowtype;
BEGIN
  IF auth.uid() IS NULL OR coalesce(public.current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Only Admin can confirm profit payments.';
  END IF;
  SELECT * INTO v_payout
    FROM public.commission_payouts
    WHERE id = p_payout_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout record not found.';
  END IF;
  IF v_payout.status = 'paid' THEN
    RETURN v_payout.id;
  END IF;
  IF v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payouts can be paid.';
  END IF;
  IF p_payment_date IS NULL OR NULLIF(trim(p_payment_reference), '') IS NULL THEN
    RAISE EXCEPTION 'Payment date and reference are required.';
  END IF;

  SELECT * INTO v_commission
    FROM public.sale_commissions
    WHERE id = v_payout.commission_id
    FOR UPDATE;
  IF NOT FOUND OR v_commission.approval_status <> 'approved'
     OR v_commission.eligibility_status <> 'eligible'
     OR v_commission.commission_amount IS NULL
     OR v_commission.commission_amount <= 0
     OR v_payout.amount IS DISTINCT FROM v_commission.commission_amount
     OR v_payout.currency IS DISTINCT FROM v_commission.commission_currency THEN
    RAISE EXCEPTION 'Profit is no longer eligible for payment.';
  END IF;

  UPDATE public.commission_payouts
    SET status = 'paid',
        payment_date = p_payment_date,
        payment_reference = trim(p_payment_reference),
        notes = coalesce(nullif(trim(p_notes), ''), notes)
    WHERE id = v_payout.id;
  RETURN v_payout.id;
END;
$$;

