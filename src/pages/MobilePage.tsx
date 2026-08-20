import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Minus, Package, AlertTriangle, Save, X, Barcode as BarcodeIcon, ShoppingCart, Trash2, Camera } from 'lucide-react';
import { useProducts, useCategories, addProduct, updateProduct, completeSale, type CartItem } from '@/lib/hooks';
import { formatCurrency, generateBarcode, PAYMENT_METHODS, type PaymentMethod } from '@/lib/utils';
import type { Product } from '@/lib/supabase';
import BarcodeScanner from '@/components/BarcodeScanner';

type MobileTab = 'manage' | 'sell';

export default function MobilePage({ onSwitchToPC }: { onSwitchToPC?: () => void }) {
  const [tab, setTab] = useState<MobileTab>('manage');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-teal-700 px-4 py-3 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">El Terminali</h1>
            <p className="text-xs text-teal-100">Pro POS Mobil</p>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToPC && (
              <button
                onClick={onSwitchToPC}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500 transition-colors"
              >
                PC Modu
              </button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
              <BarcodeIcon size={22} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex bg-white border-b border-slate-200">
        <button
          onClick={() => setTab('manage')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'manage' ? 'text-teal-700 border-b-2 border-teal-600' : 'text-slate-500'
          }`}
        >
          <Package size={18} className="inline mr-1" />
          Ürün Yönet
        </button>
        <button
          onClick={() => setTab('sell')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'sell' ? 'text-teal-700 border-b-2 border-teal-600' : 'text-slate-500'
          }`}
        >
          <ShoppingCart size={18} className="inline mr-1" />
          Satış Yap
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'manage' ? <ManageTab /> : <SellTab />}
      </div>
    </div>
  );
}

function ManageTab() {
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search */}
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            className="input pl-10"
            placeholder="Ürün ara veya barkod tara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <Package size={40} />
            <p className="text-sm">Ürün bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => { setEditing(product); setShowForm(true); }}
                className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                  <Package className="text-slate-400" size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-800">{product.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{product.barcode || 'Barkod yok'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-teal-700">{formatCurrency(product.price)}</p>
                  <p className={`text-xs ${product.stock <= product.min_stock ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                    Stok: {product.stock} {product.unit}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditing(null); setShowForm(true); }}
        className="absolute bottom-6 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 active:scale-90 transition-transform"
      >
        <Plus size={26} />
      </button>

      {showForm && (
        <MobileProductForm
          product={editing}
          categories={categories}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MobileProductForm({
  product,
  categories,
  onClose,
}: {
  product: Product | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name || '');
  const [barcode, setBarcode] = useState(product?.barcode || '');
  const [price, setPrice] = useState(product?.price.toString() || '');
  const [cost, setCost] = useState(product?.cost.toString() || '0');
  const [stock, setStock] = useState(product?.stock.toString() || '0');
  const [categoryId, setCategoryId] = useState(product?.category_id || '');
  const [unit, setUnit] = useState(product?.unit || 'adet');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Ürün adı gerekli'); return; }
    if (!price || parseFloat(price) < 0) { setError('Geçerli fiyat girin'); return; }

    setSaving(true);
    const data = {
      name: name.trim(),
      barcode: barcode.trim() || null,
      price: parseFloat(price),
      cost: parseFloat(cost) || 0,
      stock: parseFloat(stock) || 0,
      min_stock: product?.min_stock || 5,
      category_id: categoryId || null,
      unit,
    };

    if (product) {
      await updateProduct(product.id, data);
    } else {
      await addProduct(data);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-800/50 animate-fade-in flex items-end" onClick={onClose}>
      <div
        className="card w-full max-h-[90vh] overflow-y-auto rounded-t-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 className="text-lg font-bold text-slate-800">{product ? 'Ürün Düzenle' : 'Yeni Ürün'}</h2>
          <button onClick={onClose} className="text-slate-400"><X size={22} /></button>
        </div>

        {saved ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Save className="text-emerald-600" size={28} />
            </div>
            <p className="font-medium text-slate-700">Kaydedildi!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div>
              <label className="label">Ürün Adı *</label>
              <input className="input text-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>

            <div>
              <label className="label">Barkod</label>
              <div className="flex gap-2">
                <input className="input font-mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barkod" />
                <button type="button" onClick={() => setBarcode(generateBarcode())} className="btn-secondary whitespace-nowrap px-3">
                  <BarcodeIcon size={16} />
                </button>
                <button type="button" onClick={() => setShowScanner(true)} className="btn-primary whitespace-nowrap px-3">
                  <Camera size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Satış Fiyatı (TL) *</label>
                <input type="number" step="0.01" className="input text-base" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <label className="label">Alış Fiyatı (TL)</label>
                <input type="number" step="0.01" className="input text-base" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div>
              <label className="label">Stok Adedi</label>
              <input type="number" step="0.001" className="input text-base" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Kategori</label>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Yok</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Birim</label>
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="adet">Adet</option>
                  <option value="kg">Kg</option>
                  <option value="gr">Gr</option>
                  <option value="lt">Litre</option>
                  <option value="ml">Ml</option>
                  <option value="paket">Paket</option>
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
              {saving ? 'Kaydediliyor...' : product ? 'Güncelle' : 'Ürünü Ekle'}
            </button>
          </form>
        )}
      </div>

      {showScanner && (
        <BarcodeScanner
          onDetected={(code) => {
            setBarcode(code);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

function SellTab() {
  const { products, loading } = useProducts();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products.slice(0, 30);
    const q = search.toLowerCase().trim();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
    );
  }, [products, search]);

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.product.id !== id) return i;
      const newQty = i.quantity + delta;
      if (newQty > i.product.stock) return i;
      return { ...i, quantity: Math.max(0, newQty) };
    }).filter((i) => i.quantity > 0));
  }

  function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) {
      const match = products.find((p) => p.barcode === search.trim());
      if (match) { addToCart(match); setSearch(''); }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            ref={searchRef}
            type="text"
            className="input pl-10"
            placeholder="Ürün ara veya barkod tara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleBarcodeScan}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Yükleniyor...</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="card p-3 text-left active:scale-95 transition-transform"
              >
                <p className="line-clamp-2 text-sm font-medium text-slate-700 mb-1">{product.name}</p>
                <p className="text-base font-bold text-teal-700">{formatCurrency(product.price)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart Bar */}
      {cart.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-3 py-2 shadow-lg">
          {cart.map((item) => (
            <div key={item.product.id} className="flex items-center gap-2 py-1">
              <span className="flex-1 truncate text-sm text-slate-700">{item.product.name}</span>
              <button onClick={() => updateQty(item.product.id, -1)} className="flex h-7 w-7 items-center justify-center rounded bg-slate-100"><Minus size={14} /></button>
              <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
              <button onClick={() => updateQty(item.product.id, 1)} className="flex h-7 w-7 items-center justify-center rounded bg-slate-100"><Plus size={14} /></button>
              <button onClick={() => updateQty(item.product.id, -item.quantity)} className="text-red-400"><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm text-slate-500">Toplam</span>
            <span className="text-lg font-bold text-teal-700">{formatCurrency(cartTotal)}</span>
          </div>
          <button onClick={() => setShowPayment(true)} className="btn-success mt-2 w-full py-2.5">
            Ödemeye Geç
          </button>
        </div>
      )}

      {showPayment && (
        <MobilePaymentModal
          total={cartTotal}
          onClose={() => setShowPayment(false)}
          onComplete={async (method, paid, customerName) => {
            await completeSale(cart, method, paid, customerName);
            setCart([]);
            setShowPayment(false);
          }}
        />
      )}
    </div>
  );
}

function MobilePaymentModal({
  total,
  onClose,
  onComplete,
}: {
  total: number;
  onClose: () => void;
  onComplete: (method: PaymentMethod, paid: number, customerName?: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');

  const paid = parseFloat(paidAmount) || 0;
  const change = method === 'cash' ? paid - total : 0;

  function handleSubmit() {
    if (method === 'cash' && paid < total) { setError('Ödenen tutar yetersiz'); return; }
    if (method === 'credit' && !customerName.trim()) { setError('Müşteri adı gerekli'); return; }
    onComplete(method, method === 'cash' ? paid : total, method === 'credit' ? customerName.trim() : undefined);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-800/50 flex items-end" onClick={onClose}>
      <div className="card w-full rounded-t-2xl p-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-center">
          <p className="text-sm text-slate-500">Ödenecek Tutar</p>
          <p className="text-3xl font-bold text-teal-700">{formatCurrency(total)}</p>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {Object.entries(PAYMENT_METHODS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => { setMethod(key as PaymentMethod); setError(''); }}
              className={`rounded-lg border-2 p-3 text-center transition-all ${
                method === key ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500'
              }`}
            >
              <span className="block text-sm font-medium">{val.label}</span>
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="mb-4">
            <input type="number" className="input text-lg" placeholder="Alınan para" value={paidAmount} onChange={(e) => { setPaidAmount(e.target.value); setError(''); }} autoFocus />
            {paid >= total && (
              <p className="mt-2 text-center text-emerald-600 font-medium">Para üstü: {formatCurrency(change)}</p>
            )}
          </div>
        )}

        {method === 'credit' && (
          <div className="mb-4">
            <input type="text" className="input text-lg" placeholder="Müşteri adı" value={customerName} onChange={(e) => { setCustomerName(e.target.value); setError(''); }} autoFocus />
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-500 text-center">{error}</p>}

        <button onClick={handleSubmit} className="btn-success w-full py-3 text-base">Satışı Tamamla</button>
      </div>
    </div>
  );
}
