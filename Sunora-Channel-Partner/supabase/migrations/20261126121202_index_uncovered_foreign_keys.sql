-- Cover the foreign-key columns flagged by Supabase's performance advisor.
-- These indexes support FK checks and join/filter patterns; do not remove them
-- solely because they have not yet accumulated usage statistics.
CREATE INDEX IF NOT EXISTS idx_commission_payouts_created_by ON public.commission_payouts (created_by);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_paid_by ON public.commission_payouts (paid_by);
CREATE INDEX IF NOT EXISTS idx_partners_created_by ON public.partners (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments (created_by);
CREATE INDEX IF NOT EXISTS idx_referrals_created_by ON public.referrals (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_approved_by ON public.sale_commissions (approved_by);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_created_by ON public.sale_commissions (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_eligibility_approved_by ON public.sale_commissions (eligibility_approved_by);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_rate_approved_by ON public.sale_commissions (rate_approved_by);
CREATE INDEX IF NOT EXISTS idx_sale_project_costs_created_by ON public.sale_project_costs (created_by);
CREATE INDEX IF NOT EXISTS idx_sales_completion_approved_by ON public.sales (completion_approved_by);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales (created_by);
CREATE INDEX IF NOT EXISTS idx_sunora_audit_log_actor_id ON public.sunora_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_sunora_product_prices_updated_by ON public.sunora_product_prices (updated_by);
