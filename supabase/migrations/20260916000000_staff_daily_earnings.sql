create table if not exists public.staff_daily_earnings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  earning_date date not null,
  amount_paid numeric(12,2) not null default 0,
  earning_amount numeric(12,2) not null default 0,
  payment_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(staff_id, earning_date)
);

alter table public.staff_daily_earnings enable row level security;
drop policy if exists staff_daily_earnings_all on public.staff_daily_earnings;
create policy staff_daily_earnings_all on public.staff_daily_earnings for all to anon, authenticated using (true) with check (true);
create index if not exists idx_staff_daily_earnings_staff_date on public.staff_daily_earnings(staff_id, earning_date desc);

insert into public.staff_daily_earnings (business_id, staff_id, earning_date, amount_paid, earning_amount, payment_count)
select business_id, staff_id, (created_at at time zone 'Europe/Istanbul')::date,
       sum(amount_paid), sum(earning_amount), count(*)
from public.staff_earnings
group by business_id, staff_id, (created_at at time zone 'Europe/Istanbul')::date
on conflict (staff_id, earning_date) do update
set amount_paid = excluded.amount_paid,
    earning_amount = excluded.earning_amount,
    payment_count = excluded.payment_count,
    business_id = excluded.business_id,
    updated_at = now();

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
  v_earning numeric(10,2) := 0;
  v_date date := (now() at time zone 'Europe/Istanbul')::date;
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
    v_earning := round(v_payment*v_rate/100,2);
    insert into public.staff_earnings(business_id, staff_id, customer_payment_id, amount_paid, rate_percent, earning_amount, source)
    values(v_business, p_staff_id, v_payment_id, v_payment, v_rate, v_earning, 'customer_payment')
    on conflict (customer_payment_id) do nothing;
    insert into public.staff_daily_earnings(business_id, staff_id, earning_date, amount_paid, earning_amount, payment_count)
    values(v_business, p_staff_id, v_date, v_payment, v_earning, 1)
    on conflict (staff_id, earning_date) do update
      set amount_paid = public.staff_daily_earnings.amount_paid + excluded.amount_paid,
          earning_amount = public.staff_daily_earnings.earning_amount + excluded.earning_amount,
          payment_count = public.staff_daily_earnings.payment_count + excluded.payment_count,
          business_id = excluded.business_id,
          updated_at = now();
  end if;
  if (select coalesce(balance,0) from public.customers where id=p_customer_id) <= 0.01 then
    update public.sales s set settled_at=coalesce(s.settled_at,now())
    where s.settled_at is null and s.payment_method in ('credit','split') and (s.customer_id=p_customer_id or (s.customer_id is null and s.customer_name=(select c.name from public.customers c where c.id=p_customer_id)));
  end if;
  return v_payment;
end;
$$;

grant execute on function public.pay_customer_debt(uuid,numeric,text,uuid) to anon, authenticated;
notify pgrst, 'reload schema';
