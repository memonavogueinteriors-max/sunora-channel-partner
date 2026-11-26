-- Category 5 security hardening: remove broad anonymous and non-RLS table privileges.
-- RLS governs CRUD; TRUNCATE is not filtered by row-level policies.
REVOKE ALL ON TABLE public.referrals, public.commission_payouts, public.sale_commissions,
  public.sale_project_costs, public.sunora_audit_log, public.sunora_product_prices
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referrals, public.commission_payouts,
  public.sale_commissions, public.sale_project_costs, public.sunora_audit_log,
  public.sunora_product_prices TO authenticated;
GRANT ALL ON TABLE public.referrals, public.commission_payouts, public.sale_commissions,
  public.sale_project_costs, public.sunora_audit_log, public.sunora_product_prices
TO service_role;
