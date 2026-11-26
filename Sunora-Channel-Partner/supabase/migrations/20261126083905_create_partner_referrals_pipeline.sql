-- Reconstructed from live schema introspection for migration-source reconciliation.
-- Keep the partner referral pipeline scoped by RLS and avoid anonymous table access.
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  contact_name text NOT NULL CHECK (length(trim(contact_name)) > 0),
  email text,
  phone text,
  company text,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'New'
    CHECK (status IN ('New', 'Contacted', 'Qualified', 'Converted', 'Lost')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX referrals_partner_created_idx
  ON public.referrals (partner_id, created_at DESC);
CREATE INDEX referrals_status_created_idx
  ON public.referrals (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_referrals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER referrals_set_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.set_referrals_updated_at();

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrals_read_own_or_staff
ON public.referrals FOR SELECT TO authenticated
USING (public.is_staff_or_admin() OR partner_id = public.current_partner_id());

CREATE POLICY referrals_partner_insert_own
ON public.referrals FOR INSERT TO authenticated
WITH CHECK (partner_id = public.current_partner_id() AND created_by = auth.uid());

CREATE POLICY referrals_staff_update
ON public.referrals FOR UPDATE TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

CREATE POLICY referrals_staff_delete
ON public.referrals FOR DELETE TO authenticated
USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referrals TO authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;
