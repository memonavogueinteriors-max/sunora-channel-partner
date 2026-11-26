-- Avoid per-row evaluation of auth-dependent policy expressions.
drop policy if exists "profiles select own or staff" on public.profiles;
create policy "profiles select own or staff" on public.profiles for select to authenticated
using ((id = (select auth.uid())) or public.is_staff_or_admin());

drop policy if exists "partners read own branch" on public.partners;
create policy "partners read own branch" on public.partners for select to authenticated
using (
  public.is_staff_or_admin()
  or user_id = (select auth.uid())
  or parent_partner_id = (select public.current_partner_id())
);

drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "notifications_mark_own_read" on public.notifications;
create policy "notifications_mark_own_read" on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "referrals_partner_insert_own" on public.referrals;
create policy "referrals_partner_insert_own" on public.referrals for insert to authenticated
with check (partner_id = (select public.current_partner_id()) and created_by = (select auth.uid()));
