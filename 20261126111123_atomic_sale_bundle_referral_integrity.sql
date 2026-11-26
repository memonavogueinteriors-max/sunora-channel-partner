-- Atomic invoice/profit creation and referral attribution guardrails.
-- Existing production duplicate checks were completed before adding these unique indexes.
create unique index if not exists sales_invoice_number_global_unique_idx
  on public.sales (lower(trim(invoice_number)));
create unique index if not exists sales_referral_id_unique_idx
  on public.sales (referral_id) where referral_id is not null;
create unique index if not exists referrals_partner_email_unique_idx
  on public.referrals (partner_id, lower(trim(email)))
  where email is not null and trim(email) <> '';
create unique index if not exists referrals_partner_phone_unique_idx
  on public.referrals (partner_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null and regexp_replace(phone, '[^0-9]', '', 'g') <> '';

CREATE OR REPLACE FUNCTION public.sunora_validate_sale_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_partner_id uuid;
  v_status text;
begin
  if new.referral_id is null then
    return new;
  end if;

  select partner_id, status
    into v_partner_id, v_status
    from public.referrals
    where id = new.referral_id
    for update;

  if not found then
    raise exception 'Referral record does not exist.';
  end if;

  if v_partner_id is distinct from new.partner_id then
    raise exception 'Referral belongs to a different partner.';
  end if;

  if v_status = 'Lost' then
    raise exception 'Lost referrals cannot be linked to an invoice.';
  end if;

  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sunora_convert_referral_after_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.referral_id is not null then
    update public.referrals
      set status = 'Converted'
      where id = new.referral_id
        and status <> 'Converted';
  end if;

  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.sunora_create_sale_bundle(p_partner_id uuid, p_referral_id uuid, p_invoice_number text, p_invoice_date date, p_country text, p_invoice_currency text, p_panel_size text, p_panel_quantity numeric, p_unit_price numeric, p_additional_cost_description text, p_additional_cost_amount numeric, p_savings_rate numeric, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_partner_status text;
  v_referral_partner_id uuid;
  v_referral_status text;
  v_invoice_number text;
  v_currency text;
  v_exchange_rate numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_cost_amount numeric;
  v_panel_subtotal numeric;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_total numeric;
  v_tier_code text;
  v_profit_rate numeric;
  v_profit_amount numeric;
  v_rate_status text;
  v_sale_id uuid;
  v_created boolean := false;
  v_sale public.sales%rowtype;
  v_cost_count integer;
  v_cost_total numeric;
  v_cost_other_currency integer;
  v_profit public.sale_commissions%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_staff_or_admin(), false) then
    raise exception 'Staff or Admin access is required to create invoices.';
  end if;

  v_invoice_number := trim(coalesce(p_invoice_number, ''));
  v_currency := upper(trim(coalesce(p_invoice_currency, '')));

  if v_invoice_number = '' then raise exception 'Invoice number is required.'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required.'; end if;
  if trim(coalesce(p_country, '')) = '' then raise exception 'Customer country is required.'; end if;
  if v_currency not in ('AED', 'USD') then raise exception 'Only AED and USD invoices are supported.'; end if;
  if p_panel_size not in ('60x60', '40x120') then raise exception 'Unsupported panel size.'; end if;
  if p_panel_quantity is null or p_panel_quantity < 1 or p_panel_quantity <> trunc(p_panel_quantity) then
    raise exception 'Panel quantity must be a positive whole number.';
  end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'Unit price must be zero or greater.'; end if;
  if p_additional_cost_amount is null or p_additional_cost_amount < 0 then raise exception 'Additional cost must be zero or greater.'; end if;
  if p_savings_rate is null or p_savings_rate < 0 or p_savings_rate > 100 then raise exception 'Savings rate must be between 0 and 100.'; end if;

  v_quantity := p_panel_quantity;
  v_unit_price := round(p_unit_price, 2);
  v_cost_amount := round(p_additional_cost_amount, 2);
  v_exchange_rate := case when v_currency = 'USD' then 3.68 else 1 end;
  v_panel_subtotal := round(v_quantity * v_unit_price, 2);
  v_subtotal := round(v_panel_subtotal + v_cost_amount, 2);
  v_vat_amount := round(v_subtotal * 0.05, 2);
  v_total := round(v_subtotal + v_vat_amount, 2);

  if v_quantity <= 3 then
    v_tier_code := '0_percent'; v_profit_rate := 0; v_rate_status := 'automatic';
  elsif v_quantity <= 50 then
    v_tier_code := '4_to_50'; v_profit_rate := 5; v_rate_status := 'automatic';
  elsif v_quantity <= 100 then
    v_tier_code := '51_to_100'; v_profit_rate := 10; v_rate_status := 'automatic';
  elsif v_quantity <= 150 then
    v_tier_code := '101_to_150'; v_profit_rate := 15; v_rate_status := 'automatic';
  else
    v_tier_code := 'manual_over_150'; v_profit_rate := null; v_rate_status := 'awaiting_manual_rate';
  end if;

  v_profit_amount := case
    when v_profit_rate is null then null
    else round(v_subtotal * v_profit_rate / 100, 2)
  end;

  select status into v_partner_status
    from public.partners
    where id = p_partner_id
    for update;

  if not found then raise exception 'Partner not found.'; end if;
  if v_partner_status <> 'active' then raise exception 'Only active partners can receive new invoices.'; end if;

  if p_referral_id is not null then
    select partner_id, status
      into v_referral_partner_id, v_referral_status
      from public.referrals
      where id = p_referral_id
      for update;

    if not found then raise exception 'Referral not found.'; end if;
    if v_referral_partner_id is distinct from p_partner_id then
      raise exception 'Selected referral is not attributed to this partner.';
    end if;
    if v_referral_status = 'Lost' then
      raise exception 'Lost referrals cannot be converted into sales.';
    end if;
  end if;

  insert into public.sales (
    partner_id, referral_id, invoice_number, invoice_date, product_description,
    quantity, unit_price, invoice_amount, savings_rate, notes, created_by,
    country, invoice_currency, exchange_rate_to_aed, panel_size, panel_quantity,
    panel_subtotal, additional_costs_total, subtotal_ex_vat, vat_rate, vat_amount,
    total_inc_vat, commissionable_base_amount, project_status
  ) values (
    p_partner_id, p_referral_id, v_invoice_number, p_invoice_date,
    'Sunora ' || p_panel_size || ' Wellness Panel',
    v_quantity, v_unit_price, v_total, p_savings_rate, coalesce(p_notes, ''), auth.uid(),
    trim(p_country), v_currency, v_exchange_rate, p_panel_size, v_quantity,
    v_panel_subtotal, v_cost_amount, v_subtotal, 5, v_vat_amount,
    v_total, v_subtotal, 'in_progress'
  )
  on conflict do nothing
  returning id into v_sale_id;

  if v_sale_id is not null then
    v_created := true;
    select * into v_sale from public.sales where id = v_sale_id for update;
  else
    select * into v_sale
      from public.sales
      where lower(trim(invoice_number)) = lower(v_invoice_number)
      for update;

    if not found and p_referral_id is not null then
      select * into v_sale
        from public.sales
        where referral_id = p_referral_id
        for update;
    end if;

    if not found then
      raise exception 'Invoice number or referral is already linked to another sale.';
    end if;

    if v_sale.partner_id is distinct from p_partner_id
       or lower(trim(v_sale.invoice_number)) is distinct from lower(v_invoice_number) then
      raise exception 'This invoice number is already registered to another partner or sale.';
    end if;

    if v_sale.invoice_date is distinct from p_invoice_date
       or v_sale.country is distinct from trim(p_country)
       or v_sale.invoice_currency is distinct from v_currency
       or v_sale.exchange_rate_to_aed is distinct from v_exchange_rate
       or v_sale.panel_size is distinct from p_panel_size
       or v_sale.panel_quantity is distinct from v_quantity
       or v_sale.quantity is distinct from v_quantity
       or v_sale.unit_price is distinct from v_unit_price
       or v_sale.panel_subtotal is distinct from v_panel_subtotal
       or v_sale.additional_costs_total is distinct from v_cost_amount
       or v_sale.subtotal_ex_vat is distinct from v_subtotal
       or v_sale.vat_rate is distinct from 5
       or v_sale.vat_amount is distinct from v_vat_amount
       or v_sale.total_inc_vat is distinct from v_total
       or v_sale.invoice_amount is distinct from v_total
       or v_sale.commissionable_base_amount is distinct from v_subtotal
       or v_sale.savings_rate is distinct from p_savings_rate
       or v_sale.notes is distinct from coalesce(p_notes, '') then
      raise exception 'An invoice with this number already exists but its details differ. Review the existing record instead of retrying.';
    end if;

    if p_referral_id is not null and v_sale.referral_id is not null
       and v_sale.referral_id is distinct from p_referral_id then
      raise exception 'This invoice is already linked to a different referral.';
    end if;

    if p_referral_id is not null and v_sale.referral_id is null then
      update public.sales set referral_id = p_referral_id where id = v_sale.id;
      v_sale.referral_id := p_referral_id;
    end if;

    v_sale_id := v_sale.id;
  end if;

  select count(*), coalesce(sum(amount), 0), count(*) filter (where currency <> v_currency)
    into v_cost_count, v_cost_total, v_cost_other_currency
    from public.sale_project_costs
    where sale_id = v_sale_id;

  if v_cost_count = 0 and v_cost_amount > 0 then
    insert into public.sale_project_costs (sale_id, description, amount, currency, created_by)
    values (
      v_sale_id,
      coalesce(nullif(trim(p_additional_cost_description), ''), 'Additional project cost'),
      v_cost_amount,
      v_currency,
      auth.uid()
    );
  elsif v_cost_total <> v_cost_amount or v_cost_other_currency > 0 then
    raise exception 'Existing project costs do not match this invoice retry. Review the sale cost ledger.';
  end if;

  insert into public.sale_commissions (
    sale_id, partner_id, panel_quantity, tier_code, commissionable_base_amount,
    commission_currency, commission_rate, commission_amount, rate_status,
    approval_status, eligibility_status, created_by
  ) values (
    v_sale_id, p_partner_id, v_quantity, v_tier_code, v_subtotal,
    v_currency, v_profit_rate, v_profit_amount, v_rate_status,
    'recorded', 'not_eligible', auth.uid()
  )
  on conflict (sale_id) do nothing;

  select * into v_profit
    from public.sale_commissions
    where sale_id = v_sale_id;

  if not found then raise exception 'Profit record could not be created.'; end if;

  if v_profit.partner_id is distinct from p_partner_id
     or v_profit.panel_quantity is distinct from v_quantity
     or v_profit.tier_code is distinct from v_tier_code
     or v_profit.commissionable_base_amount is distinct from v_subtotal
     or v_profit.commission_currency is distinct from v_currency then
    raise exception 'Existing profit record differs from this invoice. Review before continuing.';
  end if;

  if v_profit_rate is not null then
    if v_profit.rate_status <> 'automatic'
       or v_profit.commission_rate is distinct from v_profit_rate
       or v_profit.commission_amount is distinct from v_profit_amount then
      raise exception 'Existing profit rate or amount differs from the current tier. Review before continuing.';
    end if;
  elsif v_profit.rate_status not in ('awaiting_manual_rate', 'manually_approved') then
    raise exception 'Existing manual-tier profit record has an unexpected rate status.';
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_sale.invoice_number,
    'created', v_created,
    'idempotent_retry', not v_created
  );
end;
$function$
declare
  v_partner_status text;
  v_referral_partner_id uuid;
  v_referral_status text;
  v_invoice_number text;
  v_currency text;
  v_exchange_rate numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_cost_amount numeric;
  v_savings_rate numeric;
  v_panel_subtotal numeric;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_total numeric;
  v_tier_code text;
  v_profit_rate numeric;
  v_profit_amount numeric;
  v_rate_status text;
  v_sale_id uuid;
  v_created boolean := false;
  v_sale public.sales%rowtype;
  v_cost_count integer;
  v_cost_total numeric;
  v_cost_other_currency integer;
  v_profit public.sale_commissions%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_staff_or_admin(), false) then
    raise exception 'Staff or Admin access is required to create invoices.';
  end if;

  v_invoice_number := trim(coalesce(p_invoice_number, ''));
  v_currency := upper(trim(coalesce(p_invoice_currency, '')));

  if v_invoice_number = '' then raise exception 'Invoice number is required.'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required.'; end if;
  if trim(coalesce(p_country, '')) = '' then raise exception 'Customer country is required.'; end if;
  if v_currency not in ('AED', 'USD') then raise exception 'Only AED and USD invoices are supported.'; end if;
  if p_panel_size is null or p_panel_size not in ('60x60', '40x120') then raise exception 'Unsupported panel size.'; end if;
  if p_panel_quantity is null or p_panel_quantity < 1 or p_panel_quantity <> trunc(p_panel_quantity) then
    raise exception 'Panel quantity must be a positive whole number.';
  end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'Unit price must be zero or greater.'; end if;
  if p_additional_cost_amount is null or p_additional_cost_amount < 0 then raise exception 'Additional cost must be zero or greater.'; end if;
  if p_savings_rate is null or p_savings_rate < 0 or p_savings_rate > 100 then raise exception 'Savings rate must be between 0 and 100.'; end if;

  v_quantity := p_panel_quantity;
  v_unit_price := round(p_unit_price, 2);
  v_cost_amount := round(p_additional_cost_amount, 2);
  v_savings_rate := round(p_savings_rate, 2);
  v_exchange_rate := case when v_currency = 'USD' then 3.68 else 1 end;
  v_panel_subtotal := round(v_quantity * v_unit_price, 2);
  v_subtotal := round(v_panel_subtotal + v_cost_amount, 2);
  v_vat_amount := round(v_subtotal * 0.05, 2);
  v_total := round(v_subtotal + v_vat_amount, 2);

  if v_quantity <= 3 then
    v_tier_code := '0_percent'; v_profit_rate := 0; v_rate_status := 'automatic';
  elsif v_quantity <= 50 then
    v_tier_code := '4_to_50'; v_profit_rate := 5; v_rate_status := 'automatic';
  elsif v_quantity <= 100 then
    v_tier_code := '51_to_100'; v_profit_rate := 10; v_rate_status := 'automatic';
  elsif v_quantity <= 150 then
    v_tier_code := '101_to_150'; v_profit_rate := 15; v_rate_status := 'automatic';
  else
    v_tier_code := 'manual_over_150'; v_profit_rate := null; v_rate_status := 'awaiting_manual_rate';
  end if;

  v_profit_amount := case
    when v_profit_rate is null then null
    else round(v_subtotal * v_profit_rate / 100, 2)
  end;

  select status into v_partner_status
    from public.partners
    where id = p_partner_id
    for update;

  if not found then raise exception 'Partner not found.'; end if;
  if v_partner_status <> 'active' then raise exception 'Only active partners can receive new invoices.'; end if;

  if p_referral_id is not null then
    select partner_id, status
      into v_referral_partner_id, v_referral_status
      from public.referrals
      where id = p_referral_id
      for update;

    if not found then raise exception 'Referral not found.'; end if;
    if v_referral_partner_id is distinct from p_partner_id then
      raise exception 'Selected referral is not attributed to this partner.';
    end if;
    if v_referral_status = 'Lost' then
      raise exception 'Lost referrals cannot be converted into sales.';
    end if;
  end if;

  insert into public.sales (
    partner_id, referral_id, invoice_number, invoice_date, product_description,
    quantity, unit_price, invoice_amount, savings_rate, notes, created_by,
    country, invoice_currency, exchange_rate_to_aed, panel_size, panel_quantity,
    panel_subtotal, additional_costs_total, subtotal_ex_vat, vat_rate, vat_amount,
    total_inc_vat, commissionable_base_amount, project_status
  ) values (
    p_partner_id, p_referral_id, v_invoice_number, p_invoice_date,
    'Sunora ' || p_panel_size || ' Wellness Panel',
    v_quantity, v_unit_price, v_total, v_savings_rate, coalesce(p_notes, ''), auth.uid(),
    trim(p_country), v_currency, v_exchange_rate, p_panel_size, v_quantity,
    v_panel_subtotal, v_cost_amount, v_subtotal, 5, v_vat_amount,
    v_total, v_subtotal, 'in_progress'
  )
  on conflict do nothing
  returning id into v_sale_id;

  if v_sale_id is not null then
    v_created := true;
    select * into v_sale from public.sales where id = v_sale_id for update;
  else
    select * into v_sale
      from public.sales
      where lower(trim(invoice_number)) = lower(v_invoice_number)
      for update;

    if not found and p_referral_id is not null then
      select * into v_sale
        from public.sales
        where referral_id = p_referral_id
        for update;
    end if;

    if not found then
      raise exception 'Invoice number or referral is already linked to another sale.';
    end if;

    if v_sale.partner_id is distinct from p_partner_id
       or lower(trim(v_sale.invoice_number)) is distinct from lower(v_invoice_number) then
      raise exception 'This invoice number is already registered to another partner or sale.';
    end if;

    if v_sale.invoice_date is distinct from p_invoice_date
       or v_sale.country is distinct from trim(p_country)
       or v_sale.invoice_currency is distinct from v_currency
       or v_sale.exchange_rate_to_aed is distinct from v_exchange_rate
       or v_sale.panel_size is distinct from p_panel_size
       or v_sale.panel_quantity is distinct from v_quantity
       or v_sale.quantity is distinct from v_quantity
       or v_sale.unit_price is distinct from v_unit_price
       or v_sale.panel_subtotal is distinct from v_panel_subtotal
       or v_sale.additional_costs_total is distinct from v_cost_amount
       or v_sale.subtotal_ex_vat is distinct from v_subtotal
       or v_sale.vat_rate is distinct from 5
       or v_sale.vat_amount is distinct from v_vat_amount
       or v_sale.total_inc_vat is distinct from v_total
       or v_sale.invoice_amount is distinct from v_total
       or v_sale.commissionable_base_amount is distinct from v_subtotal
       or v_sale.savings_rate is distinct from v_savings_rate
       or v_sale.notes is distinct from coalesce(p_notes, '') then
      raise exception 'An invoice with this number already exists but its details differ. Review the existing record instead of retrying.';
    end if;

    if p_referral_id is not null and v_sale.referral_id is not null
       and v_sale.referral_id is distinct from p_referral_id then
      raise exception 'This invoice is already linked to a different referral.';
    end if;

    if p_referral_id is not null and v_sale.referral_id is null then
      update public.sales set referral_id = p_referral_id where id = v_sale.id;
      v_sale.referral_id := p_referral_id;
    end if;

    v_sale_id := v_sale.id;
  end if;

  select count(*), coalesce(sum(amount), 0), count(*) filter (where currency <> v_currency)
    into v_cost_count, v_cost_total, v_cost_other_currency
    from public.sale_project_costs
    where sale_id = v_sale_id;

  if v_cost_count = 0 and v_cost_amount > 0 then
    insert into public.sale_project_costs (sale_id, description, amount, currency, created_by)
    values (
      v_sale_id,
      coalesce(nullif(trim(p_additional_cost_description), ''), 'Additional project cost'),
      v_cost_amount,
      v_currency,
      auth.uid()
    );
  elsif v_cost_total <> v_cost_amount or v_cost_other_currency > 0 then
    raise exception 'Existing project costs do not match this invoice retry. Review the sale cost ledger.';
  end if;

  insert into public.sale_commissions (
    sale_id, partner_id, panel_quantity, tier_code, commissionable_base_amount,
    commission_currency, commission_rate, commission_amount, rate_status,
    approval_status, eligibility_status, created_by
  ) values (
    v_sale_id, p_partner_id, v_quantity, v_tier_code, v_subtotal,
    v_currency, v_profit_rate, v_profit_amount, v_rate_status,
    'recorded', 'not_eligible', auth.uid()
  )
  on conflict (sale_id) do nothing;

  select * into v_profit
    from public.sale_commissions
    where sale_id = v_sale_id;

  if not found then raise exception 'Profit record could not be created.'; end if;

  if v_profit.partner_id is distinct from p_partner_id
     or v_profit.panel_quantity is distinct from v_quantity
     or v_profit.tier_code is distinct from v_tier_code
     or v_profit.commissionable_base_amount is distinct from v_subtotal
     or v_profit.commission_currency is distinct from v_currency then
    raise exception 'Existing profit record differs from this invoice. Review before continuing.';
  end if;

  if v_profit_rate is not null then
    if v_profit.rate_status <> 'automatic'
       or v_profit.commission_rate is distinct from v_profit_rate
       or v_profit.commission_amount is distinct from v_profit_amount then
      raise exception 'Existing profit rate or amount differs from the current tier. Review before continuing.';
    end if;
  elsif v_profit.rate_status not in ('awaiting_manual_rate', 'manually_approved') then
    raise exception 'Existing manual-tier profit record has an unexpected rate status.';
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_sale.invoice_number,
    'created', v_created,
    'idempotent_retry', not v_created
  );
end;
$function$


drop trigger if exists sunora_validate_sale_referral_insert on public.sales;
create trigger sunora_validate_sale_referral_insert before insert on public.sales
for each row execute function public.sunora_validate_sale_referral();
drop trigger if exists sunora_validate_sale_referral_update on public.sales;
create trigger sunora_validate_sale_referral_update before update of partner_id, referral_id on public.sales
for each row execute function public.sunora_validate_sale_referral();
drop trigger if exists sunora_convert_referral_after_sale_insert on public.sales;
create trigger sunora_convert_referral_after_sale_insert after insert on public.sales
for each row execute function public.sunora_convert_referral_after_sale();
drop trigger if exists sunora_convert_referral_after_sale_update on public.sales;
create trigger sunora_convert_referral_after_sale_update after update of partner_id, referral_id on public.sales
for each row execute function public.sunora_convert_referral_after_sale();

revoke all on function public.sunora_validate_sale_referral() from public, anon, authenticated;
grant execute on function public.sunora_validate_sale_referral() to service_role;
revoke all on function public.sunora_convert_referral_after_sale() from public, anon, authenticated;
grant execute on function public.sunora_convert_referral_after_sale() to service_role;
revoke all on function public.sunora_create_sale_bundle(uuid, uuid, text, date, text, text, text, numeric, numeric, text, numeric, numeric, text) from public, anon;
grant execute on function public.sunora_create_sale_bundle(uuid, uuid, text, date, text, text, text, numeric, numeric, text, numeric, numeric, text) to authenticated, service_role;
