-- Sunora Channel Partner Portal schema
-- Run this entire file in Supabase Dashboard > SQL Editor for a NEW dedicated project.
-- Never expose the service_role key in the browser or commit secrets to GitHub.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'partner' check (role in ('admin','staff','partner')),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_month_sequences (
  registration_month text primary key,
  last_number integer not null default 0
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  partner_code text unique not null,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  partner_type text not null default 'Other',
  parent_partner_id uuid references public.partners(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create or replace function public.generate_partner_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare month_key text; next_num integer;
begin
  month_key := to_char(coalesce(new.created_at, now()) at time zone 'UTC', 'YYYYMM');
  insert into public.partner_month_sequences(registration_month,last_number)
  values (month_key,1)
  on conflict (registration_month) do update set last_number=public.partner_month_sequences.last_number+1
  returning last_number into next_num;
  new.partner_code := 'CH' || month_key || lpad(next_num::text,3,'0');
  return new;
end; $$;

drop trigger if exists partners_assign_code on public.partners;
create trigger partners_assign_code before insert on public.partners
for each row execute function public.generate_partner_code();

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  product_description text not null default '',
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) check (unit_price is null or unit_price >= 0),
  invoice_amount numeric(12,2) not null check (invoice_amount >= 0),
  savings_rate numeric(5,2) not null default 0 check (savings_rate >= 0 and savings_rate <= 100),
  savings_amount numeric(12,2) generated always as (round(invoice_amount * savings_rate / 100, 2)) stored,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(partner_id, invoice_number)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  reference text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists partners_parent_idx on public.partners(parent_partner_id);
create index if not exists partners_user_idx on public.partners(user_id);
create index if not exists sales_partner_idx on public.sales(partner_id);
create index if not exists sales_date_idx on public.sales(invoice_date);
create index if not exists payments_partner_idx on public.payments(partner_id);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;
create or replace function public.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin','staff'), false);
$$;
create or replace function public.current_partner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.partners where user_id = auth.uid() limit 1;
$$;

-- Automatically create a restricted partner profile when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'partner')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.partner_month_sequences enable row level security;

-- Profiles: users can see their own profile; staff/admin can see all. Users cannot promote themselves.
drop policy if exists "profiles select own or staff" on public.profiles;
create policy "profiles select own or staff" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_staff_or_admin());
drop policy if exists "profiles staff update" on public.profiles;
create policy "profiles staff update" on public.profiles for update to authenticated
using (public.current_user_role()='admin') with check (public.current_user_role()='admin');

-- Partners: staff/admin manage all. Partners can read their own row and direct descendants only.
drop policy if exists "partners read own branch" on public.partners;
create policy "partners read own branch" on public.partners for select to authenticated
using (public.is_staff_or_admin() or user_id=auth.uid() or parent_partner_id=public.current_partner_id());
drop policy if exists "partners staff insert" on public.partners;
create policy "partners staff insert" on public.partners for insert to authenticated
with check (public.is_staff_or_admin());
drop policy if exists "partners staff update" on public.partners;
create policy "partners staff update" on public.partners for update to authenticated
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists "partners staff delete" on public.partners;
create policy "partners staff delete" on public.partners for delete to authenticated
using (public.current_user_role()='admin');

-- Sales: staff/admin can manage; partner can only read sales attached to their own partner row.
drop policy if exists "sales read own or staff" on public.sales;
create policy "sales read own or staff" on public.sales for select to authenticated
using (public.is_staff_or_admin() or partner_id=public.current_partner_id());
drop policy if exists "sales staff insert" on public.sales;
create policy "sales staff insert" on public.sales for insert to authenticated
with check (public.is_staff_or_admin());
drop policy if exists "sales staff update" on public.sales;
create policy "sales staff update" on public.sales for update to authenticated
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists "sales admin delete" on public.sales;
create policy "sales admin delete" on public.sales for delete to authenticated
using (public.current_user_role()='admin');

-- Payments: staff/admin can manage; partner can read own payment history only.
drop policy if exists "payments read own or staff" on public.payments;
create policy "payments read own or staff" on public.payments for select to authenticated
using (public.is_staff_or_admin() or partner_id=public.current_partner_id());
drop policy if exists "payments staff insert" on public.payments;
create policy "payments staff insert" on public.payments for insert to authenticated
with check (public.is_staff_or_admin());
drop policy if exists "payments staff update" on public.payments;
create policy "payments staff update" on public.payments for update to authenticated
using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
drop policy if exists "payments admin delete" on public.payments;
create policy "payments admin delete" on public.payments for delete to authenticated
using (public.current_user_role()='admin');

-- Sequence table has no client policies. The SECURITY DEFINER trigger allocates IDs safely.
revoke all on public.partner_month_sequences from anon, authenticated;
grant select on public.profiles, public.partners, public.sales, public.payments to authenticated;
grant insert, update on public.partners, public.sales, public.payments to authenticated;
grant update on public.profiles to authenticated;

-- IMPORTANT AFTER FIRST ADMIN SIGNUP:
-- In SQL Editor, replace the email below with your own login email and run:
-- update public.profiles p set role='admin' from auth.users u where p.id=u.id and u.email='YOUR-ADMIN-EMAIL';
-- Then create partner records from the app. To give a partner portal login, create/invite an auth user
-- in Supabase and set partners.user_id to that auth user's UUID using the secured admin workflow.
