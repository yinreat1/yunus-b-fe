/* Pro POS - tam özellik paketi */
ALTER TABLE products ADD COLUMN IF NOT EXISTS additional_barcodes text[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_price numeric(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_starts_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_ends_at timestamptz;
ALTER TABLE products ALTER COLUMN min_stock SET DEFAULT 0;
UPDATE products SET min_stock = 0;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_note text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id uuid;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_reason text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS original_unit_price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash','card','credit')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_payments_all ON sale_payments;
CREATE POLICY sale_payments_all ON sale_payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjustment','sale','return','waste')),
  quantity numeric(10,3) NOT NULL,
  before_stock numeric(10,3) NOT NULL DEFAULT 0,
  after_stock numeric(10,3) NOT NULL DEFAULT 0,
  reason text,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  staff_id uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at DESC);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_all ON stock_movements;
CREATE POLICY stock_movements_all ON stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES sale_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity numeric(10,3) NOT NULL CHECK (quantity > 0),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id, created_at DESC);
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_returns_all ON sale_returns;
CREATE POLICY sale_returns_all ON sale_returns FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin','manager','cashier')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_all ON staff;
CREATE POLICY staff_all ON staff FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  staff_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_all ON audit_logs;
CREATE POLICY audit_logs_all ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id uuid, p_type text, p_quantity numeric, p_reason text DEFAULT NULL, p_sale_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before numeric; v_after numeric; v_name text;
BEGIN
  SELECT stock,name INTO v_before,v_name FROM products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_before := COALESCE(v_before,0);
  IF p_type IN ('in','return') THEN v_after := v_before + ABS(p_quantity);
  ELSIF p_type IN ('out','sale','waste') THEN v_after := v_before - ABS(p_quantity);
  ELSE v_after := p_quantity; END IF;
  UPDATE products SET stock=v_after WHERE id=p_product_id;
  INSERT INTO stock_movements(product_id,product_name,movement_type,quantity,before_stock,after_stock,reason,sale_id,staff_id)
  VALUES(p_product_id,v_name,p_type,p_quantity,v_before,v_after,p_reason,p_sale_id,p_staff_id);
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid,text,numeric,text,uuid,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_partial_return(
  p_sale_id uuid, p_sale_item_id uuid, p_quantity numeric, p_reason text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item sale_items%ROWTYPE; v_returned numeric; v_amount numeric; v_max numeric;
BEGIN
  SELECT * INTO v_item FROM sale_items WHERE id=p_sale_item_id AND sale_id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(quantity),0) INTO v_returned FROM sale_returns WHERE sale_item_id=p_sale_item_id;
  v_max := GREATEST(0, v_item.quantity - v_returned);
  IF p_quantity <= 0 OR p_quantity > v_max THEN RETURN 0; END IF;
  v_amount := ROUND((v_item.subtotal / NULLIF(v_item.quantity,0))*p_quantity,2);
  INSERT INTO sale_returns(sale_id,sale_item_id,product_id,quantity,amount,reason) VALUES(p_sale_id,p_sale_item_id,v_item.product_id,p_quantity,v_amount,p_reason);
  IF v_item.product_id IS NOT NULL THEN
    PERFORM record_stock_movement(v_item.product_id,'return',p_quantity,p_reason,p_sale_id,NULL);
  END IF;
  UPDATE sales s SET refund_amount = COALESCE(s.refund_amount,0)+v_amount, refunded_at = CASE WHEN COALESCE(s.refund_amount,0)+v_amount >= s.total THEN now() ELSE s.refunded_at END WHERE s.id=p_sale_id;
  IF (SELECT payment_method FROM sales WHERE id=p_sale_id)='credit' THEN
    UPDATE customers c SET balance=GREATEST(0,COALESCE(c.balance,0)-v_amount) WHERE c.id=(SELECT customer_id FROM sales WHERE id=p_sale_id);
  END IF;
  RETURN v_amount;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_partial_return(uuid,uuid,numeric,text) TO anon,authenticated;
