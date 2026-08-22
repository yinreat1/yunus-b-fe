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

  const { data: sale, error: saleError } = await supabase
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
    console.error('Satış kalemleri kaydedilemedi:', itemsError);
    return null;
  }

  for (const item of items) {
    await supabase
      .from('products')
      .update({ stock: item.product.stock - item.quantity })
      .eq('id', item.product.id);
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
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('Satışlar yüklenemedi:', error);
    }
    setSales(data || []);
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

export async function closeCashSession(id: string, closingAmount: number, note?: string): Promise<boolean> {
  const { error } = await supabase
    .from('cash_sessions')
    .update({
      closing_amount: closingAmount,
      status: 'closed',
      closed_at: new Date().toISOString(),
      note: note || null,
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
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Satışlar yüklenemedi:', error);
    }
    setSales(data || []);
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
  const { data, error } = await supabase.rpc('move_sale_to_trash', {
    p_sale_id: id,
    p_reason: reason,
  });
  if (error) {
    console.error('Satış çöp kutusuna taşınamadı:', error);
    return false;
  }
  return data === true;
}

export async function restoreSaleFromTrash(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('restore_sale_from_trash', {
    p_sale_id: id,
  });
  if (error) {
    console.error('Satış geri yüklenemedi:', error);
    return false;
  }
  return data === true;
}

export async function permanentlyDeleteSale(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null);
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
