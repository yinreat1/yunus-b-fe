/* Satış stabilitesi: eski kurulumlarda eksik helper fonksiyonları tamamla. */
CREATE OR REPLACE FUNCTION public.increment_customer_balance(p_customer_id uuid, p_amount numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_customer_id IS NULL OR p_amount IS NULL OR p_amount < 0 THEN RETURN false; END IF;
  UPDATE customers SET balance = COALESCE(balance,0) + p_amount WHERE id = p_customer_id;
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.increment_customer_balance(uuid,numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id uuid, p_type text, p_quantity numeric, p_reason text DEFAULT NULL, p_sale_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before numeric; v_after numeric; v_name text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RETURN false; END IF;
  SELECT stock,name INTO v_before,v_name FROM products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_before := COALESCE(v_before,0);
  IF p_type IN ('in','return') THEN v_after := v_before + ABS(p_quantity);
  ELSIF p_type IN ('out','sale','waste') THEN v_after := v_before - ABS(p_quantity);
  ELSIF p_type = 'adjustment' THEN v_after := ABS(p_quantity);
  ELSE RETURN false; END IF;
  IF v_after < 0 THEN RETURN false; END IF;
  UPDATE products SET stock=v_after WHERE id=p_product_id;
  INSERT INTO stock_movements(product_id,product_name,movement_type,quantity,before_stock,after_stock,reason,sale_id,staff_id)
  VALUES(p_product_id,v_name,p_type,p_quantity,v_before,v_after,p_reason,p_sale_id,p_staff_id);
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid,text,numeric,text,uuid,uuid) TO anon,authenticated;
