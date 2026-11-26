-- Limit SECURITY DEFINER RPC exposure while preserving policy helper execution.
-- Trigger/event-trigger functions are not intended to be directly callable from client roles.
revoke execute on function public.generate_partner_code() from public, anon, authenticated;
grant execute on function public.generate_partner_code() to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

revoke execute on function public.sunora_audit_commission_changes() from public, anon, authenticated;
grant execute on function public.sunora_audit_commission_changes() to service_role;

revoke execute on function public.sunora_audit_project_completion() from public, anon, authenticated;
grant execute on function public.sunora_audit_project_completion() to service_role;

revoke execute on function public.sunora_guard_commission_approval() from public, anon, authenticated;
grant execute on function public.sunora_guard_commission_approval() to service_role;

revoke execute on function public.sunora_guard_sales_completion() from public, anon, authenticated;
grant execute on function public.sunora_guard_sales_completion() to service_role;

revoke execute on function public.sunora_sync_project_eligibility() from public, anon, authenticated;
grant execute on function public.sunora_sync_project_eligibility() to service_role;

-- Policy helper functions remain executable by authenticated users (RLS needs this).
revoke execute on function public.current_partner_id() from public, anon;
grant execute on function public.current_partner_id() to authenticated, service_role;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

revoke execute on function public.is_staff_or_admin() from public, anon;
grant execute on function public.is_staff_or_admin() to authenticated, service_role;
