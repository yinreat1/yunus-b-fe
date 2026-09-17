create table if not exists public.staff_earnings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  customer_payment_id uuid null references public.customer_payments(id) on delete set null,
  amount_paid numeric(10,2) not null default 0,
  rate_percent numeric(5,2) not null default 0,
  earning_amount numeric(10,2) not null default 0,
  source text not null default 'customer_payment',
  created_at timestamptz not null default now(),
  constraint staff_earnings_source_check check (source in ('customer_payment','sale_payment')),
  constraint staff_earnings_unique_payment unique (customer_payment_id)
);

alter table public.staff add column if not exists earning_rate numeric(5,2) not null default 0;
alter table public.customer_payments add column if not exists staff_id uuid references public.staff(id) on delete set null;

alter table public.staff_earnings enable row level security;
drop policy if exists staff_earnings_all on public.staff_earnings;
create policy staff_earnings_all on public.staff_earnings for all to anon, authenticated using (true) with check (true);
create index if not exists idx_staff_earnings_staff_created on public.staff_earnings(staff_id, created_at desc);
create index if not exists idx_customer_payments_staff on public.customer_payments(staff_id, created_at desc);

create or replace function public.pay_customer_debt(
  p_customer_id uuid,
  p_amount numeric,
  p_note text default null,
  p_staff_id uuid default null
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_balance numeric(10,2);
  v_payment numeric(10,2);
  v_rate numeric(5,2) := 0;
  v_business uuid;
  v_payment_id uuid;
begin
  if p_customer_id is null or coalesce(p_amount,0) <= 0 then return 0; end if;
  select balance, business_id into v_balance, v_business from public.customers where id=p_customer_id for update;
  if not found then return 0; end if;
  v_payment := least(coalesce(v_balance,0), p_amount);
  if v_payment <= 0 then return 0; end if;
  if p_staff_id is not null then
    select greatest(0, least(100, coalesce(earning_rate,0))) into v_rate from public.staff where id=p_staff_id and active=true;
  end if;
  update public.customers set balance=greatest(0,coalesce(balance,0)-v_payment) where id=p_customer_id;
  insert into public.customer_payments(customer_id, amount, note, staff_id)
    values(p_customer_id, v_payment, nullif(trim(coalesce(p_note,'')),''), p_staff_id)
    returning id into v_payment_id;
  if p_staff_id is not null and v_rate > 0 then
    insert into public.staff_earnings(business_id, staff_id, customer_payment_id, amount_paid, rate_percent, earning_amount, source)
    values(v_business, p_staff_id, v_payment_id, v_payment, v_rate, round(v_payment*v_rate/100,2), 'customer_payment')
    on conflict (customer_payment_id) do nothing;
  end if;
  if (select coalesce(balance,0) from public.customers where id=p_customer_id) <= 0.01 then
    update public.sales s set settled_at=coalesce(s.settled_at,now())
    where s.settled_at is null and s.payment_method in ('credit','split') and (s.customer_id=p_customer_id or (s.customer_id is null and s.customer_name=(select c.name from public.customers c where c.id=p_customer_id)));
  end if;
  return v_payment;
end;
$$;

grant execute on function public.pay_customer_debt(uuid,numeric,text,uuid) to anon, authenticated;

-- Remove public execution from helper/report functions that are no longer safe to expose anonymously.
revoke execute on function public.import_products_payload(text) from anon, authenticated;
revoke execute on function public.audit_business_default() from anon, authenticated;
revoke execute on function public.get_default_business_id() from anon, authenticated;
revoke execute on function public.report_product_performance(timestamptz,timestamptz) from anon, authenticated;
revoke execute on function public.report_summary(timestamptz,timestamptz) from anon, authenticated;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path=public
as $$
begin new.updated_at=now(); return new; end;
$$;

notify pgrst, 'reload schema';
