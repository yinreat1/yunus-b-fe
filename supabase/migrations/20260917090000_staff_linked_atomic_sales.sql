CREATE OR REPLACE FUNCTION public.complete_sale_atomic(
 p_total numeric,p_payment_method text,p_paid_amount numeric,p_customer_id uuid DEFAULT NULL,
 p_customer_name text DEFAULT NULL,p_original_total numeric DEFAULT NULL,p_discount_total numeric DEFAULT 0,
 p_client_ref text DEFAULT NULL,p_items jsonb DEFAULT '[]'::jsonb,p_splits jsonb DEFAULT '[]'::jsonb,
 p_staff_id uuid DEFAULT NULL,p_staff_name text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_sale_id uuid; v_item jsonb; v_split jsonb; v_pid uuid; v_qty numeric; v_unit numeric;
 v_name text; v_barcode text; v_stock numeric; v_credit numeric:=0; v_split_total numeric:=0;
 v_business uuid; v_staff_id uuid; v_rate numeric:=0; v_earning numeric:=0; v_daily_id uuid; v_date date;
BEGIN
 IF p_total IS NULL OR p_total<0 OR p_paid_amount IS NULL OR p_paid_amount<0 THEN RAISE EXCEPTION 'Geçersiz satış tutarı'; END IF;
 IF jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Sepet boş'; END IF;
 IF p_client_ref IS NOT NULL THEN
   SELECT id INTO v_sale_id FROM public.sales WHERE client_ref=p_client_ref LIMIT 1;
   IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
 END IF;
 IF p_payment_method='credit' AND p_customer_id IS NULL THEN RAISE EXCEPTION 'Veresiye müşteri gerekli'; END IF;
 IF p_payment_method='split' THEN
   SELECT COALESCE(SUM((x->>'amount')::numeric),0) INTO v_split_total FROM jsonb_array_elements(p_splits) x;
   IF ABS(v_split_total-p_total)>0.01 THEN RAISE EXCEPTION 'Karma ödeme toplamı satışla eşleşmiyor'; END IF;
   SELECT COALESCE(SUM(CASE WHEN x->>'method'='credit' THEN (x->>'amount')::numeric ELSE 0 END),0) INTO v_credit FROM jsonb_array_elements(p_splits) x;
   IF v_credit>0 AND p_customer_id IS NULL THEN
     FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
       IF v_split->>'method'='credit' AND NULLIF(v_split->>'customerId','') IS NOT NULL THEN p_customer_id:=(v_split->>'customerId')::uuid; EXIT; END IF;
     END LOOP;
   END IF;
   IF v_credit>0 AND p_customer_id IS NULL THEN RAISE EXCEPTION 'Karma veresiye için müşteri gerekli'; END IF;
 ELSIF p_payment_method='credit' THEN v_credit:=p_total; END IF;

 SELECT id,earning_rate INTO v_staff_id,v_rate FROM public.staff WHERE id=p_staff_id AND active=true LIMIT 1;
 IF v_staff_id IS NULL AND NULLIF(trim(COALESCE(p_staff_name,'')),'') IS NOT NULL THEN
   SELECT id,earning_rate INTO v_staff_id,v_rate FROM public.staff WHERE active=true AND lower(trim(name))=lower(trim(p_staff_name)) LIMIT 1;
 END IF;

 SELECT business_id INTO v_business FROM public.customers WHERE id=p_customer_id LIMIT 1;
 IF v_business IS NULL THEN SELECT business_id INTO v_business FROM public.products WHERE id=NULLIF(p_items->0->>'productId','')::uuid LIMIT 1; END IF;

 INSERT INTO public.sales(total,payment_method,customer_name,paid_amount,original_total,discount_total,customer_id,client_ref,business_id,staff_id)
 VALUES(round(p_total,2),p_payment_method,p_customer_name,round(p_paid_amount,2),round(COALESCE(p_original_total,p_total),2),round(COALESCE(p_discount_total,0),2),p_customer_id,p_client_ref,v_business,v_staff_id)
 RETURNING id INTO v_sale_id;

 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   v_pid:=NULLIF(v_item->>'productId','')::uuid; v_qty:=(v_item->>'quantity')::numeric; v_unit:=(v_item->>'unitPrice')::numeric;
   v_name:=COALESCE(v_item->>'productName',''); v_barcode:=NULLIF(v_item->>'barcode','');
   IF v_pid IS NULL OR v_qty IS NULL OR v_qty<=0 OR v_unit IS NULL OR v_unit<0 THEN RAISE EXCEPTION 'Geçersiz satış kalemi'; END IF;
   SELECT stock,business_id INTO v_stock,v_business FROM public.products WHERE id=v_pid FOR UPDATE;
   IF NOT FOUND OR COALESCE(v_stock,0)<v_qty THEN RAISE EXCEPTION 'Yetersiz stok: %',v_name; END IF;
   INSERT INTO public.sale_items(sale_id,product_id,product_name,barcode,quantity,unit_price,subtotal,original_unit_price,discount_amount,business_id)
   VALUES(v_sale_id,v_pid,v_name,v_barcode,v_qty,round(v_unit,2),round(v_unit*v_qty,2),round(COALESCE((v_item->>'originalUnitPrice')::numeric,v_unit),2),round(COALESCE((v_item->>'discountAmount')::numeric,0),2),v_business);
   UPDATE public.products SET stock=COALESCE(stock,0)-v_qty WHERE id=v_pid;
   INSERT INTO public.stock_movements(product_id,product_name,movement_type,quantity,before_stock,after_stock,reason,sale_id,business_id,staff_id)
   VALUES(v_pid,v_name,'sale',v_qty,v_stock,v_stock-v_qty,'Atomik satış',v_sale_id,v_business,v_staff_id);
 END LOOP;

 IF jsonb_array_length(p_splits)>0 THEN
   FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
     IF (v_split->>'amount')::numeric>0 THEN
       INSERT INTO public.sale_payments(sale_id,method,amount,business_id) VALUES(v_sale_id,(v_split->>'method'),round((v_split->>'amount')::numeric,2),v_business);
     END IF;
   END LOOP;
 ELSIF p_total>0 THEN
   INSERT INTO public.sale_payments(sale_id,method,amount,business_id) VALUES(v_sale_id,p_payment_method,round(p_total,2),v_business);
 END IF;

 IF v_credit>0 AND p_customer_id IS NOT NULL THEN
   UPDATE public.customers SET balance=COALESCE(balance,0)+v_credit WHERE id=p_customer_id;
 END IF;

 -- Immediate earnings: cash/card portion only. Credit earns on payment later.
 IF v_staff_id IS NOT NULL AND v_rate>0 THEN
   DECLARE v_immediate numeric:=0; BEGIN
     IF p_payment_method='cash' OR p_payment_method='card' THEN v_immediate:=p_total;
     ELSIF p_payment_method='split' THEN
       SELECT COALESCE(SUM((x->>'amount')::numeric),0) INTO v_immediate FROM jsonb_array_elements(p_splits) x WHERE x->>'method' IN ('cash','card');
     END IF;
     IF v_immediate>0 THEN
       v_earning:=round(v_immediate*v_rate/100,2);
       INSERT INTO public.staff_earnings(business_id,staff_id,sale_id,amount_paid,rate_percent,earning_amount,source)
       VALUES(v_business,v_staff_id,v_sale_id,v_immediate,v_rate,v_earning,'sale_payment')
       ON CONFLICT (sale_id) DO NOTHING;
       v_date:=(now() AT TIME ZONE 'Europe/Istanbul')::date;
       SELECT id INTO v_daily_id FROM public.staff_daily_earnings WHERE staff_id=v_staff_id AND earning_date=v_date LIMIT 1;
       IF v_daily_id IS NULL THEN
         INSERT INTO public.staff_daily_earnings(business_id,staff_id,earning_date,amount_paid,earning_amount,payment_count)
         VALUES(v_business,v_staff_id,v_date,v_immediate,v_earning,1);
       ELSE
         UPDATE public.staff_daily_earnings SET amount_paid=amount_paid+v_immediate, earning_amount=earning_amount+v_earning, payment_count=payment_count+1, business_id=v_business, updated_at=now() WHERE id=v_daily_id;
       END IF;
     END IF;
   END;
 END IF;
 RETURN v_sale_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.complete_sale_atomic(numeric,text,numeric,uuid,text,numeric,numeric,text,jsonb,jsonb,uuid,text) TO anon, authenticated;
NOTIFY pgrst,'reload schema';
