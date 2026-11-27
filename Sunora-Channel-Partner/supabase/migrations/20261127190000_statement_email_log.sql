create table if not exists public.statement_email_log (
 id uuid primary key default gen_random_uuid(),
 partner_id uuid not null references public.partners(id) on delete restrict,
 statement_month text not null check (statement_month ~ '^\\d{4}-\\d{2}$'),
 recipient_email text not null,
 status text not null check (status in ('pending','sent','failed')),
 resend_id text,
 error_message text,
 created_by uuid references auth.users(id),
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(partner_id,statement_month)
);
alter table public.statement_email_log enable row level security;
drop policy if exists statement_email_log_staff_read on public.statement_email_log;
create policy statement_email_log_staff_read on public.statement_email_log for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','staff')));
