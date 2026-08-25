import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product, Sale, SaleItem, SaleWithItems, Customer, CashSession } from '@/lib/supabase';

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
  return true;
}

export async function addProduct(p: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .insert(p)
    .select()
    .single();
  if (error) {
    console.error('Ürün eklenemedi:', error);
    return null;
  }
  return data;
}

export async function updateProduct(id: string, p: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .update(p)
    .eq('id', id);
  if (error) {
    console.error('Ürün güncellenemedi:', error);
    return false;
  }
  return true;
}

export async function deleteProduct(id: string): Promise<boolean> {
  // Ürünü fiziksel olarak silme; çöp kutusuna taşı.
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('Ürün çöp kutusuna taşınamadı:', error);
    return false;
  }
  return true;
}

export async function restoreProduct(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: null })
    .eq('id', id);
  if (error) {
    console.error('Ürün geri yüklenemedi:', error);
    return false;
  }
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
};

export async function completeSale(
  items: CartItem[],
  paymentMethod: Sale['payment_method'],
  paidAmount: number,
  customerName?: string,
  customerId?: string
): Promise<SaleWithItems | null> {
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Önce güncel şemayla kaydet. Eski Supabase şemasında customer_id henüz
  // eklenmemişse veriyi kaybetmeden customer_id olmadan tekrar dene.
  let saleInsert = await supabase
    .from('sales')
    .insert({
      total,
      payment_method: paymentMethod,
      paid_amount: paidAmount,
      customer_name: customerName || null,
      customer_id: customerId || null,
    })
    .select()
    .single();

  if (saleInsert.error && /customer_id|schema cache|column/i.test(saleInsert.error.message || '')) {
    saleInsert = await supabase
      .from('sales')
      .insert({
        total,
        payment_method: paymentMethod,
        paid_amount: paidAmount,
        customer_name: customerName || null,
      })
      .select()
      .single();
  }

  const { data: sale, error: saleError } = saleInsert;

  if (saleError || !sale) {
    console.error('Satış kaydedilemedi:', saleError);
    return null;
  }

  const saleItems: Omit<SaleItem, 'id'>[] = items.map((item) => ({
    sale_id: sale.id,
    product_id: item.product.id,
    product_name: item.product.name,
    barcode: item.product.barcode,
    quantity: item.quantity,
    unit_price: item.product.price,
    subtotal: item.product.price * item.quantity,
  }));

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems);

  if (itemsError) {
    // Önemli: sales kaydı oluşup sale_items oluşmazsa modal açık kalıyor ve
    // kullanıcı tekrar bastığında aynı satışın birden fazla kopyası oluşuyordu.
    // Hatalı/yarım satışı burada geri al.
    console.error('Satış kalemleri kaydedilemedi, yarım satış geri alınıyor:', itemsError);
    await supabase.from('sales').delete().eq('id', sale.id);
    return null;
  }

  for (const item of items) {
    const { error: stockError } = await supabase
      .from('products')
      .update({ stock: item.product.stock - item.quantity })
      .eq('id', item.product.id);

    if (stockError) {
      console.error('Stok güncellenemedi, satış geri alınıyor:', stockError);
      await supabase.from('sale_items').delete().eq('sale_id', sale.id);
      await supabase.from('sales').delete().eq('id', sale.id);
      return null;
    }
  }

  // Veresiye satışsa müşteri bakiyesini artır
  if (paymentMethod === 'credit' && customerId) {
    await supabase.rpc('increment_customer_balance', {
      p_customer_id: customerId,
      p_amount: total,
    }).then(() => {});
    // RPC yoksa manuel güncelle
    const { data: cust } = await supabase.from('customers').select('balance').eq('id', customerId).maybeSingle();
    if (cust) {
      await supabase.from('customers').update({ balance: (cust.balance || 0) + total }).eq('id', customerId);
    }
  }

  return { ...sale, sale_items: saleItems as SaleItem[] };
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

export async function payCustomerDebt(id: string, amount: number): Promise<boolean> {
  const { data: cust } = await supabase.from('customers').select('balance').eq('id', id).maybeSingle();
  if (!cust) return false;
  const newBalance = Math.max(0, (cust.balance || 0) - amount);
  const { error } = await supabase.from('customers').update({ balance: newBalance }).eq('id', id);
  if (error) {
    console.error('Borç ödemesi yapılamadı:', error);
    return false;
  }
  return true;
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

  if (!rpcError && rpcData === true) return true;

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
