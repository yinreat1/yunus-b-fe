import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product, Sale, SaleItem, SaleWithItems, Customer, CustomerPayment, CashSession, SalePayment, StockMovement, Staff } from '@/lib/supabase';
import { getEffectivePrice } from '@/lib/utils';

async function writeAudit(action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
  try {
    await supabase.from('audit_logs').insert({ action, entity_type: entityType, entity_id: entityId || null, details });
  } catch {
    // Audit is best-effort and must never block a POS operation.
  }
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Kategoriler yüklenemedi:', error);
    }
    setCategories(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('categories-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { categories, loading, reload: load };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // deleted_at migration henüz Supabase'de çalıştırılmadıysa ürünleri göstermeyi
    // durdurma. Önce çöp kutusu filtresiyle dene, kolon yoksa eski sorguya geri dön.
    let { data, error } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      const message = `${error.message || ''} ${error.code || ''}`.toLowerCase();
      const missingDeletedAt = message.includes('deleted_at') || message.includes('42703') || message.includes('schema cache');
      if (missingDeletedAt) {
        const fallback = await supabase
          .from('products')
          .select('*')
          .order('name', { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) {
      console.error('Ürünler yüklenemedi:', error);
    }
    setProducts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { products, loading, reload: load };
}

export async function addCategory(name: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name })
    .select()
    .single();
  if (error) {
    console.error('Kategori eklenemedi:', error);
    return null;
  }
  await writeAudit('category_created', 'category', data.id, { name });
  return data;
}

export async function updateCategory(id: string, name: string): Promise<boolean> {
  const { error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id);
  if (error) {
    console.error('Kategori güncellenemedi:', error);
    return false;
  }
  await writeAudit('category_updated', 'category', id, { name });
  return true;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Kategori silinemedi:', error);
    return false;
  }
  await writeAudit('category_deleted', 'category', id);
  return true;
}

export async function addProduct(p: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Product | null> {
  const payload = { discount_enabled: false, discount_price: null, discount_starts_at: null, discount_ends_at: null, min_stock: 0, additional_barcodes: [], ...p };
  let result = await supabase.from('products').insert(payload).select().single();
  if (result.error && /additional_barcodes|discount_enabled|discount_price|discount_starts_at|discount_ends_at|min_stock|deleted_at|schema cache|column/i.test(result.error.message || '')) {
    const legacy = {
      name: p.name, barcode: p.barcode || null, price: p.price, cost: p.cost, stock: p.stock,
      category_id: p.category_id ?? null, unit: p.unit || 'adet'
    };
    result = await supabase.from('products').insert(legacy).select().single();
  }
  if (result.error) {
    console.error('Ürün eklenemedi:', result.error);
    return null;
  }
  const created = result.data as Product;
  await writeAudit('product_created', 'product', created.id, { name: created.name, price: created.price });
  return created;
}

export async function updateProduct(id: string, p: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Promise<boolean> {
  let result = await supabase.from('products').update(p).eq('id', id);
  if (result.error && /additional_barcodes|discount_enabled|discount_price|discount_starts_at|discount_ends_at|min_stock|deleted_at|schema cache|column/i.test(result.error.message || '')) {
    const legacyKeys = new Set(['name','barcode','price','cost','stock','category_id','unit']);
    const legacy:any = {};
    Object.entries(p).forEach(([k,v]) => { if (legacyKeys.has(k)) legacy[k]=v; });
    result = await supabase.from('products').update(legacy).eq('id', id);
  }
  if (result.error) {
    console.error('Ürün güncellenemedi:', result.error);
    return false;
  }
  await writeAudit('product_updated', 'product', id, { fields: Object.keys(p) });
  return true;
}

export async function deleteProduct(id: string): Promise<boolean> {
  // Önce çöp kutusuna taşı; kolon/migration yoksa gerçek silmeye geri dön.
  const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (!error) { await writeAudit('product_deleted', 'product', id); return true; }
  const msg = `${error.message || ''} ${error.code || ''}`.toLowerCase();
  const missingDeletedAt = msg.includes('deleted_at') || msg.includes('schema cache') || msg.includes('42703');
  if (missingDeletedAt) {
    const hard = await supabase.from('products').delete().eq('id', id);
    if (!hard.error) { await writeAudit('product_hard_deleted', 'product', id); return true; }
    console.error('Ürün fiziksel olarak da silinemedi:', hard.error);
  } else console.error('Ürün çöp kutusuna taşınamadı:', error);
  return false;
}

export async function restoreProduct(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').update({ deleted_at: null }).eq('id', id);
  if (error) { console.error('Ürün geri yüklenemedi:', error); return false; }
  await writeAudit('product_restored', 'product', id);
  return true;
}

export function useDeletedProducts(limit = 200) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(limit);
    if (error) console.error('Ürün çöp kutusu yüklenemedi:', error);
    setProducts(data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('deleted-products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { products, loading, reload: load };
}

export type CartItem = {
  product: Product;
  quantity: number;
  discountPercent?: number;
  fixedUnitPrice?: number;
};

export type PaymentSplit = { method: 'cash'|'card'|'credit'; amount: number; customerId?: string; customerName?: string };

function cartUnitPrice(item: CartItem) {
  const effective = item.fixedUnitPrice != null ? Number(item.fixedUnitPrice) : getEffectivePrice(item.product);
  const pct = item.fixedUnitPrice != null ? 0 : Math.max(0, Math.min(100, Number(item.discountPercent || 0)));
  return +(effective * (1 - pct / 100)).toFixed(2);
}

export async function completeSale(
  items: CartItem[],
  paymentMethod: Sale['payment_method'] | 'split',
  paidAmount: number,
  customerName?: string,
  customerId?: string,
  paymentSplits?: PaymentSplit[],
  clientRef?: string
): Promise<SaleWithItems | null> {
  const originalTotal = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  const total = items.reduce((sum, item) => sum + cartUnitPrice(item) * item.quantity, 0);
  const discountTotal = +(originalTotal - total).toFixed(2);
  const now = new Date().toISOString();
  if (!items.length || !items.every(i => Number.isFinite(Number(i.quantity)) && Number(i.quantity) > 0)) return null;
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(paidAmount) || paidAmount < 0) return null;
  // Nakit ödemede verilen para satıştan fazla olabilir; ödeme kaydına
  // satış tutarını yazar, para üstünü paid_amount alanında saklarız.
  // 0 TL toplamlı ücretsiz/test satışlarında 0 tutarlı ödeme satırı eklenmez.
  const splits = (paymentMethod === 'split'
    ? (paymentSplits || [])
    : [{
        method: paymentMethod as 'cash'|'card'|'credit',
        amount: total,
        customerId,
        customerName
      }]
  ).filter(p => Number(p.amount) > 0);

  // Migration uygulanmışsa satışın tamamını atomik RPC ile sunucuda bitir.
  // Eski kurulumlarda RPC yoksa aşağıdaki uyumluluk akışına geri dönülür.
  const rpcItems = items.map((item) => {
    const unitPrice = cartUnitPrice(item);
    const originalUnitPrice = Number(item.product.price);
    return {
      productId: item.product.id,
      productName: item.product.name,
      barcode: item.product.barcode,
      quantity: Number(item.quantity),
      unitPrice: Number(unitPrice),
      originalUnitPrice,
      discountAmount: +((originalUnitPrice - unitPrice) * item.quantity).toFixed(2),
    };
  });
  const rpcSplits = splits.map(p => ({ method: p.method, amount: Number(p.amount), customerId: p.customerId || null }));
  try {
    const { data: atomicSaleId, error: atomicError } = await supabase.rpc('complete_sale_atomic', {
      p_total: +total.toFixed(2),
      p_payment_method: paymentMethod,
      p_paid_amount: +(paymentMethod === 'split' ? total : paidAmount).toFixed(2),
      p_customer_id: customerId || null,
      p_customer_name: customerName || null,
      p_original_total: +originalTotal.toFixed(2),
      p_discount_total: discountTotal,
      p_client_ref: clientRef || null,
      p_items: rpcItems,
      p_splits: rpcSplits,
    });
    if (!atomicError && atomicSaleId) {
      const [{ data: atomicSale, error: atomicSaleError }, { data: atomicItems }] = await Promise.all([
        supabase.from('sales').select('*').eq('id', atomicSaleId).single(),
        supabase.from('sale_items').select('*').eq('sale_id', atomicSaleId),
      ]);
      if (!atomicSaleError && atomicSale) {
        await writeAudit('sale_completed', 'sale', atomicSale.id, { total, paymentMethod, itemCount: items.length, atomic: true });
        return { ...atomicSale, sale_items: (atomicItems || []) as SaleItem[] } as SaleWithItems;
      }
    } else if (atomicError && !/complete_sale_atomic|schema cache|function .* does not exist|could not find the function|404/i.test(atomicError.message || '')) {
      console.warn('Atomik satış RPC başarısız; uyumlu fallback kullanılacak:', atomicError);
    }
  } catch (err) {
    console.warn('Atomik satış RPC kullanılamadı; uyumlu fallback kullanılacak:', err);
  }

  if (paymentMethod === 'split') {
    const splitTotal = splits.reduce((a, p) => a + Number(p.amount || 0), 0);
    if (Math.abs(splitTotal - total) > 0.01) return null;
    if (splits.some(p => p.method === 'credit' && !p.customerId)) return null;
  } else if (paymentMethod === 'credit' && !customerId) {
    return null;
  } else if (paymentMethod === 'cash' && paidAmount + 0.0001 < total) {
    return null;
  } else if (paymentMethod === 'card' && paidAmount + 0.0001 < total) {
    return null;
  }

  const baseSalePayload = {
    total: +total.toFixed(2),
    payment_method: paymentMethod,
    paid_amount: +(paymentMethod === 'split' ? total : paidAmount).toFixed(2),
    customer_name: customerName || null,
  };
  const extendedSalePayload = {
    ...baseSalePayload,
    original_total: +originalTotal.toFixed(2),
    discount_total: discountTotal,
    customer_id: customerId || null,
    payment_note: null,
    ...(clientRef ? { client_ref: clientRef } : {}),
  };

  if (clientRef) {
    const { data: existingSale } = await supabase.from('sales').select('*').eq('client_ref', clientRef).maybeSingle();
    if (existingSale) {
      const existingItems = await getSaleItems(existingSale.id);
      return { ...existingSale, sale_items: existingItems } as SaleWithItems;
    }
  }

  let saleInsert = await supabase.from('sales').insert(extendedSalePayload).select().single();
  if (saleInsert.error && /customer_id|payment_note|discount_total|original_total|client_ref|schema cache|column|invalid input value/i.test(saleInsert.error.message || '')) {
    saleInsert = await supabase.from('sales').insert(baseSalePayload).select().single();
  }
  const { data: sale, error: saleError } = saleInsert;
  if (saleError || !sale) return null;

  const saleItems: Omit<SaleItem, 'id'>[] = items.map((item) => {
    const unit = cartUnitPrice(item);
    const original = Number(item.product.price);
    return { sale_id: sale.id, product_id: item.product.id, product_name: item.product.name, barcode: item.product.barcode, quantity: item.quantity, unit_price: unit, subtotal: +(unit * item.quantity).toFixed(2), original_unit_price: original, discount_amount: +((original-unit)*item.quantity).toFixed(2) };
  });
  let itemsResult:any, paymentResult:any;
  [itemsResult, paymentResult] = await Promise.all([
    supabase.from('sale_items').insert(saleItems),
    splits.length > 0 ? supabase.from('sale_payments').insert(splits.map(p => ({ sale_id: sale.id, method: p.method, amount: p.amount }))) : Promise.resolve({error:null})
  ]);
  if (itemsResult.error && /original_unit_price|discount_amount|schema cache|column/i.test(itemsResult.error.message || '')) {
    const legacySaleItems = saleItems.map(({ original_unit_price, discount_amount, ...row }) => row);
    itemsResult = await supabase.from('sale_items').insert(legacySaleItems);
  }
  if (itemsResult.error) { await supabase.from('sales').delete().eq('id', sale.id); console.error('Satış kalemleri kaydedilemedi:', itemsResult.error); return null; }
  let payError: { message?: string } | null = paymentResult?.error || null;
  // sale_payments tablosu eski kurulumlarda olmayabilir; bu durumda ana satış yine kaydedilsin.
  if (payError && !/sale_payments|schema cache|relation|does not exist|Could not find the table/i.test(payError.message || '')) {
    // Ödeme kırılımı yardımcı kayıttır; ana satışın tamamlanmasını engellemesin.
    // Base sales.payment_method / paid_amount alanları yine ana ödeme bilgisini tutar.
    console.warn('Ödeme kırılımı kaydedilemedi; ana satış korunuyor:', payError);
  }

  const appliedStock: { productId: string; quantity: number; before: number; name: string }[] = [];
  const rollbackSale = async () => {
    for (const row of [...appliedStock].reverse()) {
      const restored = await supabase.rpc('record_stock_movement', {
        p_product_id: row.productId, p_type: 'return', p_quantity: row.quantity,
        p_reason: `Satış geri alma ${sale.id}`, p_sale_id: sale.id, p_staff_id: null,
      });
      if (restored.error || restored.data !== true) {
        await supabase.from('products').update({ stock: row.before }).eq('id', row.productId);
      }
    }
    await supabase.from('sale_items').delete().eq('sale_id', sale.id);
    await supabase.from('sale_payments').delete().eq('sale_id', sale.id);
    await supabase.from('sales').delete().eq('id', sale.id);
  };

  const stockRows = await Promise.all(items.map(async (item) => {
    const { data: currentProduct, error: prodErr } = await supabase.from('products').select('stock,name').eq('id', item.product.id).single();
    return { item, currentProduct, prodErr };
  }));
  if (stockRows.some(r => r.prodErr || !r.currentProduct || Number(r.currentProduct.stock) < Number(r.item.quantity))) {
    await Promise.all([
      supabase.from('sale_items').delete().eq('sale_id', sale.id),
      supabase.from('sale_payments').delete().eq('sale_id', sale.id),
      supabase.from('sales').delete().eq('id', sale.id)
    ]);
    return null;
  }
  const stockResults = await Promise.all(stockRows.map(async ({item,currentProduct}) => {
    const before = Number(currentProduct!.stock);
    const ok = await supabase.rpc('record_stock_movement', { p_product_id:item.product.id, p_type:'sale', p_quantity:item.quantity, p_reason:`Satış ${sale.id}`, p_sale_id:sale.id, p_staff_id:null });
    if (!ok.error && ok.data === true) return { success:true, productId:item.product.id, quantity:Number(item.quantity), before, name:currentProduct!.name };
    const nextStock = before - Number(item.quantity);
    if (nextStock < 0) return { success:false, productId:item.product.id, quantity:Number(item.quantity), before, name:currentProduct!.name };
    const fallbackStock = await supabase.from('products').update({ stock: nextStock }).eq('id', item.product.id);
    if (fallbackStock.error) return { success:false, productId:item.product.id, quantity:Number(item.quantity), before, name:currentProduct!.name };
    const movementResult = await supabase.from('stock_movements').insert({product_id:item.product.id,product_name:currentProduct!.name,movement_type:'sale',quantity:item.quantity,before_stock:before,after_stock:nextStock,sale_id:sale.id});
    if (movementResult.error && !/stock_movements|schema cache|relation|does not exist/i.test(movementResult.error.message || '')) return { success:false, productId:item.product.id, quantity:Number(item.quantity), before, name:currentProduct!.name };
    return { success:true, productId:item.product.id, quantity:Number(item.quantity), before, name:currentProduct!.name };
  }));
  if (stockResults.some(r => !r.success)) {
    await Promise.all(stockResults.filter(r => r.success).map(async row => {
      const restored = await supabase.rpc('record_stock_movement', { p_product_id: row.productId, p_type: 'return', p_quantity: row.quantity, p_reason: `Satış geri alma ${sale.id}`, p_sale_id: sale.id, p_staff_id: null });
      if (restored.error || restored.data !== true) await supabase.from('products').update({ stock: row.before }).eq('id', row.productId);
    }));
    await Promise.all([
      supabase.from('sale_items').delete().eq('sale_id', sale.id),
      supabase.from('sale_payments').delete().eq('sale_id', sale.id),
      supabase.from('sales').delete().eq('id', sale.id)
    ]);
    return null;
  }
  appliedStock.push(...stockResults.filter(r => r.success).map(r => ({productId:r.productId, quantity:r.quantity, before:r.before, name:r.name})));

  const creditPart = splits.filter(p => p.method === 'credit').reduce((sum,p)=>sum+p.amount,0);
  if (creditPart > 0) {
    const cid = splits.find(p=>p.method==='credit')?.customerId || customerId;
    if (!cid) {
      await rollbackSale();
      return null;
    }
    const { error: balanceError } = await supabase.rpc('increment_customer_balance', { p_customer_id: cid, p_amount: creditPart });
    if (balanceError) {
      const { data:cust, error:custReadError } = await supabase.from('customers').select('balance').eq('id',cid).single();
      if (custReadError || !cust) {
        await rollbackSale();
        console.error('Müşteri bakiyesi güncellenemedi:', balanceError, custReadError);
        return null;
      }
      const fallbackBalance = await supabase.from('customers').update({balance:Number(cust.balance||0)+creditPart}).eq('id',cid);
      if (fallbackBalance.error) {
        await rollbackSale();
        console.error('Müşteri bakiyesi güncellenemedi:', balanceError, fallbackBalance.error);
        return null;
      }
    }
  }
  await writeAudit('sale_completed', 'sale', sale.id, { total, paymentMethod, itemCount: items.length });
  return { ...sale, sale_items: saleItems as SaleItem[] } as SaleWithItems;
}

export async function addStock(product: Product, quantity: number, reason = 'Stok girişi', staffId?: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const { data, error } = await supabase.rpc('record_stock_movement', { p_product_id: product.id, p_type:'in', p_quantity:quantity, p_reason:reason, p_staff_id:staffId || null });
  if (!error && data === true) return true;
  const next = Number(product.stock || 0) + quantity;
  const fallback = await supabase.from('products').update({ stock: next }).eq('id', product.id);
  if (!fallback.error) {
    await supabase.from('stock_movements').insert({ product_id: product.id, product_name: product.name, movement_type:'in', quantity, before_stock:Number(product.stock||0), after_stock:next, reason, staff_id:staffId||null });
    return true;
  }
  console.error('Stok girişi başarısız:', error || fallback.error);
  return false;
}

export async function setStock(product: Product, quantity: number, reason = 'Stok düzeltme', staffId?: string) {
  if (!Number.isFinite(quantity) || quantity < 0) return false;
  const { data, error } = await supabase.rpc('record_stock_movement', { p_product_id: product.id, p_type:'adjustment', p_quantity:quantity, p_reason:reason, p_staff_id:staffId || null });
  if (!error && data === true) return true;
  const fallback = await supabase.from('products').update({ stock: quantity }).eq('id', product.id);
  if (!fallback.error) {
    await supabase.from('stock_movements').insert({ product_id: product.id, product_name: product.name, movement_type:'adjustment', quantity, before_stock:Number(product.stock||0), after_stock:quantity, reason, staff_id:staffId||null });
    return true;
  }
  console.error('Stok düzeltme başarısız:', error || fallback.error);
  return false;
}

export async function partialReturn(saleId: string, saleItemId: string, quantity: number, reason?: string) {
  const { data, error } = await supabase.rpc('record_partial_return', {p_sale_id:saleId,p_sale_item_id:saleItemId,p_quantity:quantity,p_reason:reason||null});
  return !error && Number(data||0) > 0;
}

export function useStockMovements(productId?: string) {
  const [rows,setRows]=useState<StockMovement[]>([]); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{ setLoading(true); let q=supabase.from('stock_movements').select('*').order('created_at',{ascending:false}).limit(500); if(productId) q=q.eq('product_id',productId); const {data,error}=await q; if(error) console.error(error); setRows((data||[]) as StockMovement[]); setLoading(false);},[productId]);
  useEffect(()=>{load();},[load]); return {movements:rows,loading,reload:load};
}

const STAFF_LOCAL_KEY='propos-staff-local-v1';
function getLocalStaff(): Staff[] { try { const raw=JSON.parse(localStorage.getItem(STAFF_LOCAL_KEY)||'[]'); return Array.isArray(raw)?raw as Staff[]:[]; } catch { return []; } }
function saveLocalStaff(rows: Staff[]) { try { localStorage.setItem(STAFF_LOCAL_KEY, JSON.stringify(rows)); } catch {} }
function isMissingStaffTable(error:any) { const msg = `${error?.message||''} ${error?.code||''}`.toLowerCase(); return msg.includes('relation') && msg.includes('staff') || msg.includes('staff') && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('404')); }

export function useStaff() {
  const [staff,setStaff]=useState<Staff[]>([]);
  const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{
    const {data,error}=await supabase.from('staff').select('*').order('name');
    if (!error) { setStaff((data||[]) as Staff[]); setError(null); saveLocalStaff((data||[]) as Staff[]); return; }
    console.error('Personeller yüklenemedi:',error);
    if (isMissingStaffTable(error)) { setStaff(getLocalStaff()); setError("Personel tablosu Supabase’de henüz oluşturulmamış. Şimdilik bu cihazda yerel kayıt modu kullanılıyor."); }
    else { setStaff(getLocalStaff()); setError(error.message || 'Personeller yüklenemedi.'); }
  },[]);
  useEffect(()=>{load()},[load]);
  return {staff,error,reload:load};
}

export async function addStaff(name:string,pin?:string,role:Staff['role']='cashier'){
  const clean=name.trim();
  if(!clean) return {data:null,error:'Ad Soyad zorunludur.' as string};
  if(!pin || pin.trim().length < 4) return {data:null,error:'PIN / Şifre en az 4 karakter olmalı.' as string};
  let {data,error}=await supabase.from('staff').insert({name:clean,pin:null,role,active:true}).select().single();
  if (!error && data) {
    const pinResult=await supabase.rpc('set_staff_pin',{p_staff_id:data.id,p_pin:pin.trim()});
    if(pinResult.error || pinResult.data!==true){
      const fallback=await supabase.from('staff').update({pin:pin.trim()}).eq('id',data.id);
      if(fallback.error){ await supabase.from('staff').delete().eq('id',data.id); return {data:null,error:pinResult.error?.message||fallback.error.message||'PIN kaydedilemedi.'}; }
      data={...data,pin:pin.trim()};
    } else data={...data,pin:null,pin_hash:'stored'} as any;
    const rows=getLocalStaff().filter(x=>x.id!==data.id); saveLocalStaff([...rows,data as Staff]); return {data:data as Staff,error:null};
  }
  if (isMissingStaffTable(error)) {
    const local:Staff={id:crypto.randomUUID(),name:clean,pin:pin.trim(),role,active:true,created_at:new Date().toISOString()};
    saveLocalStaff([...getLocalStaff(),local]); return {data:local,error:null,local:true};
  }
  console.error('Personel eklenemedi:',error); return {data:null,error:error?.message||'Personel eklenemedi.' as string};
}

export async function updateStaff(id:string, patch:Partial<Staff>){
  const {error}=await supabase.from('staff').update(patch).eq('id',id);
  if (!error) { saveLocalStaff(getLocalStaff().map(x=>x.id===id?{...x,...patch}:x)); return true; }
  if (isMissingStaffTable(error)) { saveLocalStaff(getLocalStaff().map(x=>x.id===id?{...x,...patch}:x)); return true; }
  console.error('Personel güncellenemedi:',error); return false;
}

export async function deleteStaff(id:string){
  const {error}=await supabase.from('staff').delete().eq('id',id);
  if(!error){ saveLocalStaff(getLocalStaff().filter(x=>x.id!==id)); return true; }
  const fallback=await supabase.from('staff').update({active:false}).eq('id',id);
  if(!fallback.error){ saveLocalStaff(getLocalStaff().map(x=>x.id===id?{...x,active:false}:x)); return true; }
  if(isMissingStaffTable(error) || isMissingStaffTable(fallback.error)){ saveLocalStaff(getLocalStaff().filter(x=>x.id!==id)); return true; }
  console.error('Personel silinemedi:',error,fallback.error); return false;
}

const OFFLINE_QUEUE_KEY='propos-offline-sales-v2';
export type OfflineSalePayload = {
  queue_id: string; items: CartItem[]; paymentMethod: Sale['payment_method']; paidAmount: number;
  customerName?: string; customerId?: string; paymentSplits?: PaymentSplit[]; queued_at: string;
};
export function getOfflineSales(): OfflineSalePayload[]{
  try { const raw=JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]'); return Array.isArray(raw)?raw:[]; } catch { return []; }
}
export function queueOfflineSale(payload: Omit<OfflineSalePayload,'queue_id'|'queued_at'>){
  try {
    const q=getOfflineSales();
    q.push({...payload, queue_id: crypto.randomUUID(), queued_at:new Date().toISOString()});
    localStorage.setItem(OFFLINE_QUEUE_KEY,JSON.stringify(q));
    return true;
  } catch (error) {
    console.error('Offline satış kaydedilemedi:', error);
    return false;
  }
}
export async function syncOfflineSales(){
  if(!navigator.onLine) return {synced:0,failed:getOfflineSales().length};
  const q=getOfflineSales(); let synced=0; const remain: OfflineSalePayload[]=[];
  for(const x of q){
    try {
      const sale=await completeSale(x.items,x.paymentMethod,x.paidAmount,x.customerName,x.customerId,x.paymentSplits,x.queue_id);
      if(sale) synced++; else remain.push(x);
    } catch (error) { console.error('Offline satış senkronizasyonu başarısız:',x.queue_id,error); remain.push(x); }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY,JSON.stringify(remain));
  return {synced,failed:remain.length};
}

export function useSales(limit = 50) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from('sales')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    // deleted_at migration'ı henüz veritabanına uygulanmadıysa satışları
    // raporlardan kaybetme; eski şemadan güvenli şekilde oku.
    if (error && /deleted_at|schema cache|column/i.test(error.message || '')) {
      const fallback = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Satışlar yüklenemedi:', error);
    }
    setSales((data || []) as Sale[]);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { sales, loading, reload: load };
}

// ===== Müşteriler =====

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      console.error('Müşteriler yüklenemedi:', error);
    }
    setCustomers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('customers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { customers, loading, reload: load };
}

export async function addCustomer(name: string, phone?: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ name: name.trim(), phone: phone?.trim() || null })
    .select()
    .single();
  if (error) {
    console.error('Müşteri eklenemedi:', error);
    return null;
  }
  return data;
}

export async function updateCustomer(id: string, name: string, phone?: string): Promise<boolean> {
  const { error } = await supabase
    .from('customers')
    .update({ name: name.trim(), phone: phone?.trim() || null })
    .eq('id', id);
  if (error) {
    console.error('Müşteri güncellenemedi:', error);
    return false;
  }
  return true;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Müşteri silinemedi:', error);
    return false;
  }
  return true;
}

export async function payCustomerDebt(id: string, amount: number, note?: string): Promise<{ success: boolean; amount: number }> {
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, amount: 0 };

  const { data, error } = await supabase.rpc('pay_customer_debt', {
    p_customer_id: id,
    p_amount: amount,
    p_note: note?.trim() || null,
  });

  const rpcPaid = data == null ? NaN : Number(data);
  if (!error && Number.isFinite(rpcPaid)) {
    return { success: rpcPaid > 0, amount: rpcPaid };
  }

  // Yeni migration henüz uygulanmadıysa eski şema ile güvenli geri dönüş.
  const { data: cust } = await supabase.from('customers').select('balance').eq('id', id).maybeSingle();
  if (!cust) return { success: false, amount: 0 };
  const payment = Math.min(Number(cust.balance || 0), amount);
  if (payment <= 0) return { success: false, amount: 0 };

  const { error: updateError } = await supabase.from('customers').update({
    balance: Number(cust.balance || 0) - payment,
  }).eq('id', id);
  if (updateError) {
    console.error('Borç ödemesi yapılamadı:', updateError);
    return { success: false, amount: 0 };
  }

  try {
    await supabase.from('customer_payments').insert({ customer_id: id, amount: payment, note: note?.trim() || null });
  } catch {
    // Eski veritabanında ödeme tablosu yoksa bakiye yine güncellenmiş olur.
  }
  return { success: true, amount: payment };
}

export function useCustomerDebtHistory(customerId: string | null) {
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) {
      setSales([]);
      setPayments([]);
      setCurrentBalance(null);
      return;
    }

    setLoading(true);
    const customerResult = await supabase
      .from('customers')
      .select('balance')
      .eq('id', customerId)
      .maybeSingle();

    let salesResult = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('customer_id', customerId)
      .eq('payment_method', 'credit')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (salesResult.error && /deleted_at|schema cache|column/i.test(salesResult.error.message || '')) {
      salesResult = await supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('customer_id', customerId)
        .eq('payment_method', 'credit')
        .order('created_at', { ascending: false });
    }

    const { data: paymentData, error: paymentError } = await supabase
      .from('customer_payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (salesResult.error) console.error('Veresiye geçmişi yüklenemedi:', salesResult.error);
    if (paymentError && !/customer_payments|schema cache|relation/i.test(paymentError.message || '')) {
      console.error('Ödeme geçmişi yüklenemedi:', paymentError);
    }

    setSales((salesResult.data || []) as SaleWithItems[]);
    setPayments((paymentData || []) as CustomerPayment[]);
    setCurrentBalance(customerResult.data ? Number(customerResult.data.balance || 0) : null);
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    load();
    if (!customerId) return;
    const channel = supabase
      .channel(`customer-debt-${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `customer_id=eq.${customerId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payments', filter: `customer_id=eq.${customerId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customerId, load]);

  return { sales, payments, currentBalance, loading, reload: load };
}


// ===== Kasa Oturumları =====

export function useActiveCashSession() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .maybeSingle();
    if (error) {
      console.error('Kasa oturumu yüklenemedi:', error);
    }
    setSession(data || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('cash-sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { session, loading, reload: load };
}

export async function openCashSession(openingAmount: number, note?: string): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .insert({
      opening_amount: openingAmount,
      status: 'open',
      note: note || null,
    })
    .select()
    .single();
  if (error) {
    console.error('Kasa açılamadı:', error);
    return null;
  }
  return data;
}

export type CashWithdrawal = { amount: number; note?: string; created_at: string };
export type CashDeposit = { amount: number; note?: string; created_at: string };
export type ShopExpense = { type: 'cash' | 'product'; amount: number; note?: string; product_id?: string; product_name?: string; quantity?: number; created_at: string };

const WITHDRAWAL_PREFIX = '[PARA_ALMA]';
const DEPOSIT_PREFIX = '[PARA_EKLE]';
const EXPENSE_PREFIX = '[DUKKAN_GIDERI]';

export function getCashWithdrawals(note?: string | null): CashWithdrawal[] {
  if (!note) return [];
  return note.split('\n').flatMap((line) => {
    if (!line.startsWith(WITHDRAWAL_PREFIX)) return [];
    try {
      const value = JSON.parse(line.slice(WITHDRAWAL_PREFIX.length));
      if (!value || typeof value.amount !== 'number') return [];
      return [{ amount: value.amount, note: value.note || undefined, created_at: value.created_at || '' }];
    } catch {
      return [];
    }
  });
}

export function getCashDeposits(note?: string | null): CashDeposit[] {
  if (!note) return [];
  return note.split('\n').flatMap((line) => {
    if (!line.startsWith(DEPOSIT_PREFIX)) return [];
    try {
      const value = JSON.parse(line.slice(DEPOSIT_PREFIX.length));
      if (!value || typeof value.amount !== 'number') return [];
      return [{ amount: value.amount, note: value.note || undefined, created_at: value.created_at || '' }];
    } catch {
      return [];
    }
  });
}


export function getShopExpenses(note?: string | null): ShopExpense[] {
  if (!note) return [];
  return note.split('\n').flatMap((line) => {
    if (!line.startsWith(EXPENSE_PREFIX)) return [];
    try {
      const value = JSON.parse(line.slice(EXPENSE_PREFIX.length));
      if (!value || (value.type !== 'cash' && value.type !== 'product') || typeof value.amount !== 'number') return [];
      return [{
        type: value.type,
        amount: value.amount,
        note: value.note || undefined,
        product_id: value.product_id || undefined,
        product_name: value.product_name || undefined,
        quantity: typeof value.quantity === 'number' ? value.quantity : undefined,
        created_at: value.created_at || '',
      } as ShopExpense];
    } catch {
      return [];
    }
  });
}

export async function addShopCashExpense(id: string, amount: number, note?: string): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const { data: session, error: readError } = await supabase.from('cash_sessions').select('note, status').eq('id', id).single();
  if (readError || !session || session.status !== 'open') return false;
  const entry = `${EXPENSE_PREFIX}${JSON.stringify({ type: 'cash', amount, note: note?.trim() || undefined, created_at: new Date().toISOString() })}`;
  const nextNote = [session.note || '', entry].filter(Boolean).join('\n');
  const { error } = await supabase.from('cash_sessions').update({ note: nextNote }).eq('id', id);
  if (error) { console.error('Dükkan gideri kaydedilemedi:', error); return false; }
  return true;
}

export async function addShopProductExpense(id: string, product: Product, quantity: number, note?: string): Promise<boolean> {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > product.stock) return false;
  const { data: session, error: readError } = await supabase.from('cash_sessions').select('note, status').eq('id', id).single();
  if (readError || !session || session.status !== 'open') return false;
  const { data: currentProduct, error: productReadError } = await supabase.from('products').select('stock, name, cost').eq('id', product.id).single();
  if (productReadError || !currentProduct || Number(currentProduct.stock) < quantity) return false;
  const costAmount = Number(currentProduct.cost || 0) * quantity;
  const { error: stockError } = await supabase.from('products').update({ stock: Number(currentProduct.stock) - quantity }).eq('id', product.id);
  if (stockError) { console.error('Gider için stok düşülemedi:', stockError); return false; }
  const entry = `${EXPENSE_PREFIX}${JSON.stringify({ type: 'product', amount: costAmount, quantity, product_id: product.id, product_name: currentProduct.name, note: note?.trim() || undefined, created_at: new Date().toISOString() })}`;
  const nextNote = [session.note || '', entry].filter(Boolean).join('\n');
  const { error } = await supabase.from('cash_sessions').update({ note: nextNote }).eq('id', id);
  if (error) {
    await supabase.from('products').update({ stock: Number(currentProduct.stock) }).eq('id', product.id);
    console.error('Ürün gideri kaydedilemedi:', error);
    return false;
  }
  return true;
}

export async function addCashDeposit(id: string, amount: number, note?: string): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const { data: session, error: readError } = await supabase
    .from('cash_sessions')
    .select('note, status')
    .eq('id', id)
    .single();
  if (readError || !session || session.status !== 'open') {
    console.error('Kasaya para eklenemedi:', readError);
    return false;
  }
  const entry = `${DEPOSIT_PREFIX}${JSON.stringify({ amount, note: note?.trim() || undefined, created_at: new Date().toISOString() })}`;
  const nextNote = [session.note || '', entry].filter(Boolean).join('\n');
  const { error } = await supabase.from('cash_sessions').update({ note: nextNote }).eq('id', id);
  if (error) {
    console.error('Kasaya para ekleme kaydedilemedi:', error);
    return false;
  }
  return true;
}

export async function addCashWithdrawal(id: string, amount: number, note?: string): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const { data: session, error: readError } = await supabase
    .from('cash_sessions')
    .select('note, status')
    .eq('id', id)
    .single();
  if (readError || !session || session.status !== 'open') {
    console.error('Kasadan para alınamadı:', readError);
    return false;
  }
  const entry = `${WITHDRAWAL_PREFIX}${JSON.stringify({ amount, note: note?.trim() || undefined, created_at: new Date().toISOString() })}`;
  const nextNote = [session.note || '', entry].filter(Boolean).join('\n');
  const { error } = await supabase.from('cash_sessions').update({ note: nextNote }).eq('id', id);
  if (error) {
    console.error('Kasadan para alma kaydedilemedi:', error);
    return false;
  }
  return true;
}

export async function closeCashSession(id: string, closingAmount: number, note?: string): Promise<boolean> {
  const { data: current, error: readError } = await supabase
    .from('cash_sessions')
    .select('note')
    .eq('id', id)
    .single();
  if (readError) {
    console.error('Kasa notu okunamadı:', readError);
    return false;
  }
  const baseNote = (current?.note || '').split('\n').filter((line: string) => !line.startsWith('[KAPANIS_NOTU]')).join('\n').trim();
  const nextNote = [baseNote, note?.trim() ? `[KAPANIS_NOTU]${note.trim()}` : ''].filter(Boolean).join('\n');
  const { error } = await supabase
    .from('cash_sessions')
    .update({
      closing_amount: closingAmount,
      status: 'closed',
      closed_at: new Date().toISOString(),
      note: nextNote || null,
    })
    .eq('id', id);
  if (error) {
    console.error('Kasa kapatılamadı:', error);
    return false;
  }
  return true;
}

export function useCashSessions(limit = 30) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Kasa oturumları yüklenemedi:', error);
    }
    setSessions(data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('cash-sessions-list-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { sessions, loading, reload: load };
}

export async function getSaleItems(saleId: string): Promise<SaleItem[]> {
  const { data, error } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId);
  if (error) {
    console.error('Satış kalemleri yüklenemedi:', error);
    return [];
  }
  return data || [];
}

export function useSalesByDate(startDate: string, endDate: string) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error && /deleted_at|schema cache|column/i.test(error.message || '')) {
      const fallback = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Satışlar yüklenemedi:', error);
    }
    setSales((data || []) as Sale[]);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  return { sales, loading, reload: load };
}


// ===== Rapor / Satış Çöp Kutusu =====
// Satışı fiziksel olarak silmez. Stok ve veresiye bakiyesini güvenli şekilde geri alır.
export async function moveSaleToTrash(id: string, reason = 'Kullanıcı tarafından iptal edildi'): Promise<boolean> {
  // Idempotent transaction: if the sale is already in the trash, treat it as success.
  const { data: rpcData, error: rpcError } = await supabase.rpc('move_sale_to_trash_v2', {
    p_sale_id: id,
    p_reason: reason,
  });

  if (!rpcError && rpcData === true) { await writeAudit('sale_trashed', 'sale', id, { reason }); return true; }

  // Some Supabase projects cache the RPC schema for a short time. If the RPC
  // is unavailable, verify whether a previous attempt already moved the sale.
  const { data: currentSale, error: currentSaleError } = await supabase
    .from('sales')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle();

  if (!currentSaleError && currentSale?.deleted_at) return true;

  // Safe fallback for projects where the new RPC is not yet visible.
  // Do not touch stock unless the sale itself can be marked as deleted.
  const deletedAt = new Date().toISOString();
  const { data: moved, error: moveError } = await supabase
    .from('sales')
    .update({ deleted_at: deletedAt, deleted_reason: reason })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .maybeSingle();

  if (moveError || !moved?.deleted_at) {
    console.error('Satış çöp kutusuna taşınamadı:', { rpcError, rpcData, moveError });
    return false;
  }

  // Once the sale is marked deleted, restore the stock/cari movement.
  // If a product update fails, leave the sale in the trash rather than
  // reporting a false success; the user can retry the operation.
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', id);

  if (itemsError) {
    console.error('Satış kalemleri okunamadı:', itemsError);
    return false;
  }

  for (const item of items || []) {
    if (!item.product_id) continue;
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('stock')
      .eq('id', item.product_id)
      .maybeSingle();
    if (productError || !product) {
      console.error('Stok okunamadı:', productError);
      return false;
    }

    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: Number(product.stock || 0) + Number(item.quantity || 0) })
      .eq('id', item.product_id);
    if (stockError) {
      console.error('Stok geri alınamadı:', stockError);
      return false;
    }
  }

  return true;
}

export async function restoreSaleFromTrash(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('restore_sale_from_trash', {
    p_sale_id: id,
  });
  if (!error) return data === true;

  console.error('Satış RPC ile geri yüklenemedi, yedek yöntem deneniyor:', error);
  const { data: sale } = await supabase.from('sales').select('*').eq('id', id).maybeSingle();
  if (!sale || !sale.deleted_at) return false;
  const { data: items, error: itemsError } = await supabase
    .from('sale_items').select('product_id, quantity').eq('sale_id', id);
  if (itemsError) return false;
  for (const item of items || []) {
    if (!item.product_id) continue;
    const { data: product } = await supabase.from('products').select('stock').eq('id', item.product_id).maybeSingle();
    if (!product) return false;
    const { error: stockError } = await supabase.from('products')
      .update({ stock: Number(product.stock || 0) - Number(item.quantity || 0) }).eq('id', item.product_id);
    if (stockError) return false;
  }
  if (sale.payment_method === 'credit' && sale.customer_id) {
    const { data: customer } = await supabase.from('customers').select('balance').eq('id', sale.customer_id).maybeSingle();
    if (customer) await supabase.from('customers').update({ balance: Number(customer.balance || 0) + Number(sale.total || 0) }).eq('id', sale.customer_id);
  }
  const { error: restoreError } = await supabase.from('sales').update({ deleted_at: null, deleted_reason: null }).eq('id', id);
  return !restoreError;
}

export async function refundSale(id: string, reason = 'Müşteri iadesi'): Promise<boolean> {
  // İade, temel POS şemasıyla çalışır; sonradan eklenen çöp kutusu/iade
  // kolonları yoksa da işlemi engellemez.
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('id, total, payment_method, customer_name, paid_amount, created_at')
    .eq('id', id)
    .maybeSingle();

  if (saleError || !sale) {
    console.error('İade için satış okunamadı:', saleError);
    return false;
  }

  // İade edilmiş olup olmadığını, varsa işaret alanından kontrol et.
  let existingReason = '';
  const { data: statusRow } = await supabase
    .from('sales')
    .select('deleted_reason')
    .eq('id', id)
    .maybeSingle();
  if (statusRow?.deleted_reason) existingReason = String(statusRow.deleted_reason);
  if (existingReason.startsWith('İADE|')) return true;

  // Satış kalemleri yalnızca temel şema alanlarıyla okunur.
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('product_id, quantity, barcode, product_name')
    .eq('sale_id', id);

  if (itemsError || !items || items.length === 0) {
    console.error('İade ürünleri okunamadı:', itemsError);
    return false;
  }

  const quantities = new Map<string, number>();
  for (const item of items) {
    let productId = item.product_id as string | null;

    if (!productId && item.barcode) {
      const { data: byBarcode } = await supabase
        .from('products').select('id').eq('barcode', item.barcode).maybeSingle();
      productId = byBarcode?.id || null;
    }
    if (!productId && item.product_name) {
      const { data: byName } = await supabase
        .from('products').select('id').eq('name', item.product_name).maybeSingle();
      productId = byName?.id || null;
    }
    if (!productId) {
      console.error('İade ürünü bulunamadı:', item);
      return false;
    }
    quantities.set(productId, (quantities.get(productId) || 0) + Number(item.quantity || 0));
  }

  // Veresiye satışsa customer_id varsa bakiyeyi geri al.
  let customerId: string | null = null;
  let previousBalance: number | null = null;
  if (sale.payment_method === 'credit') {
    const { data: creditSale } = await supabase
      .from('sales').select('customer_id').eq('id', id).maybeSingle();
    customerId = creditSale?.customer_id || null;
    if (customerId) {
      const { data: customer, error: customerError } = await supabase
        .from('customers').select('balance').eq('id', customerId).maybeSingle();
      if (customerError || !customer) {
        console.error('İade müşteri bakiyesi okunamadı:', customerError);
        return false;
      }
      previousBalance = Number(customer.balance || 0);
    }
  }

  const previousStocks = new Map<string, number>();
  for (const [productId] of quantities) {
    const { data: product, error: productError } = await supabase
      .from('products').select('stock').eq('id', productId).maybeSingle();
    if (productError || !product) {
      console.error('İade ürünü okunamadı:', { productId, productError });
      return false;
    }
    previousStocks.set(productId, Number(product.stock || 0));
  }

  const updatedProducts: string[] = [];
  let balanceUpdated = false;
  try {
    for (const [productId, quantity] of quantities) {
      const { error } = await supabase.from('products')
        .update({ stock: (previousStocks.get(productId) || 0) + quantity })
        .eq('id', productId);
      if (error) throw error;
      updatedProducts.push(productId);
    }

    if (customerId && previousBalance !== null) {
      const { error } = await supabase.from('customers')
        .update({ balance: Math.max(0, previousBalance - Number(sale.total || 0)) })
        .eq('id', customerId);
      if (error) throw error;
      balanceUpdated = true;
    }

    // Önce mevcut iade/çöp kutusu kolonları varsa satış kaydını koruyarak işaretle.
    const marker = `İADE|${new Date().toISOString()}|${Number(sale.total || 0)}|${reason || 'Müşteri iadesi'}`;
    let marked = false;

    const withTrashColumns = await supabase.from('sales')
      .update({ deleted_reason: marker, deleted_at: null })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (!withTrashColumns.error && withTrashColumns.data) {
      marked = true;
    } else {
      const reasonOnly = await supabase.from('sales')
        .update({ deleted_reason: marker })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (!reasonOnly.error && reasonOnly.data) marked = true;
    }

    // Eski veritabanında deleted_reason/deleted_at yoksa satış kaydını silerek
    // iade işlemini tamamla. Stok ve cari hareketi zaten geri alınmış durumda.
    if (!marked) {
      const { error: deleteError } = await supabase.from('sales').delete().eq('id', id);
      if (deleteError) throw deleteError;
    }

    await writeAudit('sale_refunded', 'sale', id, { total: Number(sale.total || 0), reason });
    return true;
  } catch (error) {
    console.error('İade işlemi sırasında hata:', error);
    for (const productId of updatedProducts) {
      await supabase.from('products')
        .update({ stock: previousStocks.get(productId) || 0 }).eq('id', productId);
    }
    if (balanceUpdated && customerId && previousBalance !== null) {
      await supabase.from('customers').update({ balance: previousBalance }).eq('id', customerId);
    }
    return false;
  }
}

export async function permanentlyDeleteSale(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Satış kalıcı olarak silinemedi:', error);
    return false;
  }
  return true;
}

export function useDeletedSales(limit = 200) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Çöp kutusu yüklenemedi:', error);
    }
    setSales(data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('deleted-sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { sales, loading, reload: load };
}
