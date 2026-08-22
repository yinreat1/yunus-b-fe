/*
# Satış / Rapor Çöp Kutusu

Satışlar fiziksel olarak silinmez. `deleted_at` dolu olan satışlar
aktif raporlardan çıkarılır ve Çöp Kutusu'nda tutulur.

- Ürünler ve mevcut ürün kayıtları kesinlikle silinmez.
- Satış çöpe taşınırken satılan miktar stoklara geri eklenir.
- Veresiye satışsa müşteri bakiyesi satış tutarı kadar azaltılır.
- Geri yüklemede stok ve veresiye bakiyesi tekrar uygulanır.
- Kalıcı silme sadece zaten çöp kutusunda olan satışlara uygulanabilir.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

CREATE INDEX IF NOT EXISTS idx_sales_deleted_at ON sales(deleted_at);

-- Satışı çöp kutusuna taşı: stok/cari işlemlerini tek transaction içinde yap.
CREATE OR REPLACE FUNCTION public.move_sale_to_trash(
  p_sale_id uuid,
  p_reason text DEFAULT 'Kullanıcı tarafından iptal edildi'
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $body$
DECLARE
  v_sale sales%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND OR v_sale.deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Stokları geri al.
  FOR v_item IN
    SELECT product_id, quantity
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND product_id IS NOT NULL
  LOOP
    UPDATE products
    SET stock = stock + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  -- Veresiye satışın cari bakiyesini geri al.
  IF v_sale.payment_method = 'credit' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE customers
    SET balance = GREATEST(0, balance - v_sale.total)
    WHERE id = v_sale.customer_id;
  END IF;

  UPDATE sales
  SET deleted_at = now(),
      deleted_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Kullanıcı tarafından iptal edildi')
  WHERE id = p_sale_id;

  RETURN true;
END;
$body$;

-- Çöp kutusundaki satışı geri yükle.
CREATE OR REPLACE FUNCTION public.restore_sale_from_trash(
  p_sale_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $body$
DECLARE
  v_sale sales%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND OR v_sale.deleted_at IS NULL THEN
    RETURN false;
  END IF;

  -- Orijinal stok hareketini tekrar uygula.
  FOR v_item IN
    SELECT product_id, quantity
    FROM sale_items
    WHERE sale_id = p_sale_id
      AND product_id IS NOT NULL
  LOOP
    UPDATE products
    SET stock = stock - v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  -- Veresiye bakiyesini tekrar ekle.
  IF v_sale.payment_method = 'credit' AND v_sale.customer_id IS NOT NULL THEN
    UPDATE customers
    SET balance = balance + v_sale.total
    WHERE id = v_sale.customer_id;
  END IF;

  UPDATE sales
  SET deleted_at = NULL,
      deleted_reason = NULL
  WHERE id = p_sale_id;

  RETURN true;
END;
$body$;

-- RPC'lerin uygulamadaki anon kullanıcı tarafından çağrılabilmesi.
GRANT EXECUTE ON FUNCTION public.move_sale_to_trash(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_sale_from_trash(uuid) TO anon, authenticated;
