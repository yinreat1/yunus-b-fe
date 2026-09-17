/* ProPOS final hardening: offline idempotency + safe constraints */
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref_unique ON sales(client_ref) WHERE client_ref IS NOT NULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_price_nonnegative') THEN ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK (price >= 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_cost_nonnegative') THEN ALTER TABLE products ADD CONSTRAINT products_cost_nonnegative CHECK (cost >= 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_stock_nonnegative') THEN ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_min_stock_nonnegative') THEN ALTER TABLE products ADD CONSTRAINT products_min_stock_nonnegative CHECK (min_stock >= 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_total_nonnegative') THEN ALTER TABLE sales ADD CONSTRAINT sales_total_nonnegative CHECK (total >= 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sale_items_quantity_positive') THEN ALTER TABLE sale_items ADD CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0) NOT VALID; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sale_items_subtotal_nonnegative') THEN ALTER TABLE sale_items ADD CONSTRAINT sale_items_subtotal_nonnegative CHECK (subtotal >= 0) NOT VALID; END IF; END $$;


CREATE OR REPLACE FUNCTION public.move_sale_to_trash_v2(
  p_sale_id uuid,
  p_reason text DEFAULT 'Kullanıcı tarafından iptal edildi'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale sales%ROWTYPE; v_item record; v_credit numeric := 0;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_sale.deleted_at IS NOT NULL THEN RETURN true; END IF;
  FOR v_item IN SELECT product_id, quantity FROM sale_items WHERE sale_id=p_sale_id AND product_id IS NOT NULL LOOP
    UPDATE products SET stock=COALESCE(stock,0)+COALESCE(v_item.quantity,0) WHERE id=v_item.product_id;
    INSERT INTO stock_movements(product_id,product_name,movement_type,quantity,before_stock,after_stock,reason,sale_id)
    SELECT p.id,p.name,'return',v_item.quantity,COALESCE(p.stock,0)-v_item.quantity,COALESCE(p.stock,0),COALESCE(p_reason,'Satış iptali'),p_sale_id
    FROM products p WHERE p.id=v_item.product_id;
  END LOOP;
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_credit FROM sale_payments WHERE sale_id=p_sale_id AND method='credit';
    IF v_credit=0 AND v_sale.payment_method='credit' THEN v_credit:=COALESCE(v_sale.total,0); END IF;
    IF v_credit>0 THEN UPDATE customers SET balance=GREATEST(0,COALESCE(balance,0)-v_credit) WHERE id=v_sale.customer_id; END IF;
  END IF;
  UPDATE sales SET deleted_at=now(), deleted_reason=COALESCE(NULLIF(trim(p_reason),''),'Kullanıcı tarafından iptal edildi') WHERE id=p_sale_id AND deleted_at IS NULL;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.move_sale_to_trash_v2(uuid,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.restore_sale_from_trash(p_sale_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale sales%ROWTYPE; v_item record; v_credit numeric := 0; v_stock numeric;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id FOR UPDATE;
  IF NOT FOUND OR v_sale.deleted_at IS NULL THEN RETURN false; END IF;
  FOR v_item IN SELECT product_id, quantity FROM sale_items WHERE sale_id=p_sale_id AND product_id IS NOT NULL LOOP
    SELECT COALESCE(stock,0) INTO v_stock FROM products WHERE id=v_item.product_id FOR UPDATE;
    IF v_stock < v_item.quantity THEN RETURN false; END IF;
    UPDATE products SET stock=COALESCE(stock,0)-v_item.quantity WHERE id=v_item.product_id;
    INSERT INTO stock_movements(product_id,product_name,movement_type,quantity,before_stock,after_stock,reason,sale_id)
    SELECT p.id,p.name,'sale',v_item.quantity,v_stock,v_stock-v_item.quantity,'Satış geri yükleme',p_sale_id FROM products p WHERE p.id=v_item.product_id;
  END LOOP;
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_credit FROM sale_payments WHERE sale_id=p_sale_id AND method='credit';
    IF v_credit=0 AND v_sale.payment_method='credit' THEN v_credit:=COALESCE(v_sale.total,0); END IF;
    IF v_credit>0 THEN UPDATE customers SET balance=COALESCE(balance,0)+v_credit WHERE id=v_sale.customer_id; END IF;
  END IF;
  UPDATE sales SET deleted_at=NULL, deleted_reason=NULL WHERE id=p_sale_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.restore_sale_from_trash(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_partial_return(
  p_sale_id uuid, p_sale_item_id uuid, p_quantity numeric, p_reason text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item sale_items%ROWTYPE; v_returned numeric; v_amount numeric; v_max numeric; v_sale sales%ROWTYPE; v_credit numeric:=0; v_ratio numeric:=0;
BEGIN
  SELECT * INTO v_item FROM sale_items WHERE id=p_sale_item_id AND sale_id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_sale FROM sales WHERE id=p_sale_id FOR UPDATE;
  SELECT COALESCE(SUM(quantity),0) INTO v_returned FROM sale_returns WHERE sale_item_id=p_sale_item_id;
  v_max:=GREATEST(0,v_item.quantity-v_returned);
  IF p_quantity<=0 OR p_quantity>v_max THEN RETURN 0; END IF;
  v_amount:=ROUND((v_item.subtotal/NULLIF(v_item.quantity,0))*p_quantity,2);
  INSERT INTO sale_returns(sale_id,sale_item_id,product_id,quantity,amount,reason) VALUES(p_sale_id,p_sale_item_id,v_item.product_id,p_quantity,v_amount,p_reason);
  IF v_item.product_id IS NOT NULL THEN PERFORM record_stock_movement(v_item.product_id,'return',p_quantity,p_reason,p_sale_id,NULL); END IF;
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_credit FROM sale_payments WHERE sale_id=p_sale_id AND method='credit';
    IF v_credit=0 AND v_sale.payment_method='credit' THEN v_credit:=COALESCE(v_sale.total,0); END IF;
    IF v_sale.total>0 THEN v_ratio:=LEAST(1,v_credit/v_sale.total); END IF;
    IF v_ratio>0 THEN UPDATE customers SET balance=GREATEST(0,COALESCE(balance,0)-(v_amount*v_ratio)) WHERE id=v_sale.customer_id; END IF;
  END IF;
  UPDATE sales SET refund_amount=COALESCE(refund_amount,0)+v_amount, refunded_at=CASE WHEN COALESCE(refund_amount,0)+v_amount>=total THEN now() ELSE refunded_at END WHERE id=p_sale_id;
  RETURN v_amount;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_partial_return(uuid,uuid,numeric,text) TO anon,authenticated;
