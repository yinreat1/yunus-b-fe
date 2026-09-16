-- Pro POS: satış çöp kutusunu idempotent ve transaction güvenli hale getirir.
-- Mevcut ürün/satış kayıtlarını silmez.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.move_sale_to_trash_v2(
  p_sale_id uuid,
  p_reason text DEFAULT 'Kullanıcı tarafından iptal edildi'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  -- Idempotent: zaten çöp kutusundaysa başarılı kabul et.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_sale.deleted_at IS NOT NULL THEN
    RETURN true;
  END IF;

  -- Stokları tek transaction içinde geri al.
  FOR v_item IN
    SELECT product_id, quantity
    FROM public.sale_items
    WHERE sale_id = p_sale_id
      AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + COALESCE(v_item.quantity, 0)
    WHERE id = v_item.product_id;
  END LOOP;

  -- Veresiye bakiyesini geri al.
  IF v_sale.payment_method = 'credit' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET balance = GREATEST(0, COALESCE(balance, 0) - COALESCE(v_sale.total, 0))
    WHERE id = v_sale.customer_id;
  END IF;

  UPDATE public.sales
  SET deleted_at = now(),
      deleted_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Kullanıcı tarafından iptal edildi')
  WHERE id = p_sale_id
    AND deleted_at IS NULL;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_sale_to_trash_v2(uuid, text) TO anon, authenticated;
