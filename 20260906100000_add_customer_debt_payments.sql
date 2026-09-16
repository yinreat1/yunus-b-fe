/*
  Pro POS - Veresiye ödeme geçmişi
  Müşterinin hangi tarihte ne kadar ödeme yaptığını saklar.
*/

CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customer_payments" ON customer_payments;
CREATE POLICY "anon_select_customer_payments" ON customer_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customer_payments" ON customer_payments;
CREATE POLICY "anon_insert_customer_payments" ON customer_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customer_payments" ON customer_payments;
CREATE POLICY "anon_update_customer_payments" ON customer_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customer_payments" ON customer_payments;
CREATE POLICY "anon_delete_customer_payments" ON customer_payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_created
  ON customer_payments(customer_id, created_at DESC);

-- Veresiye satış bakiyesini atomik şekilde artır.
CREATE OR REPLACE FUNCTION public.increment_customer_balance(
  p_customer_id uuid,
  p_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_customer_id IS NULL OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN false;
  END IF;

  UPDATE public.customers
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_customer_id;

  RETURN FOUND;
END;
$$;

-- Borç ödemesini aynı transaction içinde hem bakiyeden düşür hem kaydet.
CREATE OR REPLACE FUNCTION public.pay_customer_debt(
  p_customer_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric(10,2);
  v_payment numeric(10,2);
BEGIN
  IF p_customer_id IS NULL OR COALESCE(p_amount, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT balance INTO v_balance
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_payment := LEAST(COALESCE(v_balance, 0), p_amount);
  IF v_payment <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.customers
  SET balance = COALESCE(balance, 0) - v_payment
  WHERE id = p_customer_id;

  INSERT INTO public.customer_payments(customer_id, amount, note)
  VALUES (p_customer_id, v_payment, NULLIF(trim(COALESCE(p_note, '')), ''));

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_balance(uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_customer_debt(uuid, numeric, text) TO anon, authenticated;
