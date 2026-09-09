/* Pro POS - Cari hesap sayfalama / arşiv */
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sales_customer_settled ON public.sales(customer_id, settled_at, created_at DESC);

-- Eski kayıtlarda bakiyesi sıfır olan müşterilerin açık veresiye satışlarını arşive al.
UPDATE public.sales s
SET settled_at = COALESCE(settled_at, now())
WHERE settled_at IS NULL
  AND payment_method IN ('credit','split')
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE (c.id = s.customer_id OR (s.customer_id IS NULL AND s.customer_name = c.name))
      AND COALESCE(c.balance,0) <= 0
  );

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
  IF p_customer_id IS NULL OR COALESCE(p_amount, 0) <= 0 THEN RETURN 0; END IF;
  SELECT balance INTO v_balance FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_payment := LEAST(COALESCE(v_balance,0), p_amount);
  IF v_payment <= 0 THEN RETURN 0; END IF;
  UPDATE public.customers SET balance = GREATEST(0, COALESCE(balance,0) - v_payment) WHERE id = p_customer_id;
  INSERT INTO public.customer_payments(customer_id, amount, note)
  VALUES (p_customer_id, v_payment, NULLIF(trim(COALESCE(p_note,'')),''));
  IF (SELECT COALESCE(balance,0) FROM public.customers WHERE id=p_customer_id) <= 0.01 THEN
    UPDATE public.sales s
    SET settled_at = COALESCE(s.settled_at, now())
    WHERE s.settled_at IS NULL
      AND s.payment_method IN ('credit','split')
      AND (s.customer_id = p_customer_id OR (s.customer_id IS NULL AND s.customer_name = (SELECT c.name FROM public.customers c WHERE c.id=p_customer_id)));
  END IF;
  RETURN v_payment;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pay_customer_debt(uuid,numeric,text) TO anon, authenticated;
