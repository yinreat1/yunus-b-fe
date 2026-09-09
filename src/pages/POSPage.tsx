import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, X, CreditCard, Banknote, BookOpen, Printer, Receipt, Share2, PauseCircle, PlayCircle } from 'lucide-react';
import { useProducts, useCategories, useCustomers, completeSale, queueOfflineSale, syncOfflineSales, type CartItem, type PaymentSplit } from '@/lib/hooks';
import { formatCurrency, PAYMENT_METHODS, getEffectivePrice, type PaymentMethod } from '@/lib/utils';
import type { Product, SaleWithItems } from '@/lib/supabase';

type Props = {
  onNavigate: (page: string) => void;
};

export default function POSPage({ onNavigate }: Props) {
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const { customers } = useCustomers();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [lastSale, setLastSale] = useState<SaleWithItems | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [processingSale, setProcessingSale] = useState(false);
  const [heldSales, setHeldSales] = useState<{id:string; created_at:string; items:CartItem[]}[]>(() => {
    try { return JSON.parse(localStorage.getItem('propos-held-sales-v1') || '[]'); } catch { return []; }
  });
  const [showHeldSales, setShowHeldSales] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const sync = () => { syncOfflineSales().catch(() => {}); };
    window.addEventListener('online', sync);
    sync();
    return () => window.removeEventListener('online', sync);
  }, []);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeCategory) {
      result = result.filter((p) => p.category_id === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || ((p.barcode && p.barcode.includes(q)) || (p.additional_barcodes || []).some(b => b.includes(q)))
      );
    }
    return result;
  }, [products, activeCategory, search]);

  const cartTotal = Number(cart.reduce((sum, item) => sum + (getEffectivePrice(item.product) * (1 - (Number(item.discountPercent || 0) / 100))) * item.quantity, 0).toFixed(2));
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const newQty = i.quantity + delta;
          if (newQty > i.product.stock) return i;
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
  }

  function persistHeldSales(next: {id:string; created_at:string; items:CartItem[]}[]) {
    setHeldSales(next);
    try { localStorage.setItem('propos-held-sales-v1', JSON.stringify(next)); } catch {}
  }

  function holdCurrentSale() {
    if (!cart.length) return;
    const entry = { id: crypto.randomUUID(), created_at: new Date().toISOString(), items: cart.map(i => ({ ...i })) };
    persistHeldSales([entry, ...heldSales]);
    setCart([]);
    setShowHeldSales(false);
    searchRef.current?.focus();
  }

  function resumeHeldSale(id: string) {
    const entry = heldSales.find(x => x.id === id);
    if (!entry) return;
    if (cart.length) {
      const replace = window.confirm('Mevcut sepet var. Bekletilen satışı geri yüklemek mevcut sepeti değiştirecek. Devam edilsin mi?');
      if (!replace) return;
    }
    setCart(entry.items);
    persistHeldSales(heldSales.filter(x => x.id !== id));
    setShowHeldSales(false);
    searchRef.current?.focus();
  }

  function deleteHeldSale(id: string) {
    if (!window.confirm('Bekletilen satış silinsin mi?')) return;
    persistHeldSales(heldSales.filter(x => x.id !== id));
  }

  function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) {
      const code=search.trim(); const match = products.find((p) => p.barcode === code || (p.additional_barcodes || []).includes(code));
      if (match) {
        addToCart(match);
        setSearch('');
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Products Section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Search Bar */}
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={searchRef}
              type="text"
              className="input pl-10 text-lg"
              placeholder="Ürün ara veya barkod tara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleBarcodeScan}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
          <button
            className={`btn px-4 py-2 text-sm whitespace-nowrap ${
              activeCategory === null ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => setActiveCategory(null)}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`btn px-4 py-2 text-sm whitespace-nowrap ${
                activeCategory === cat.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-slate-400">Ürünler yükleniyor...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <Search size={48} />
              <p>Ürün bulunamadı</p>
              <button className="btn-secondary text-sm" onClick={() => onNavigate('products')}>
                Ürün eklemek için tıklayın
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="card group flex flex-col p-3 text-left transition-all hover:border-teal-400 hover:shadow-md active:scale-95"
                >
                  <div className="mb-2 flex items-start justify-between gap-1">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-700">
                      {product.name}
                    </h3>
                  </div>
                  <div className="mt-auto">
                    <p className="text-lg font-bold text-teal-700">
                      {formatCurrency(product.price)}
                    </p>
                    <p className={`text-xs ${product.stock <= product.min_stock ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                      Stok: {product.stock} {product.unit}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="flex w-96 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="text-teal-600" size={22} />
            <h2 className="text-lg font-bold text-slate-800">Sepet</h2>
            {cartCount > 0 && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">
                {cartCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {heldSales.length > 0 && (
              <button onClick={() => setShowHeldSales(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800">
                <PlayCircle size={15}/> Bekletilen ({heldSales.length})
              </button>
            )}
            {cart.length > 0 && (
              <div className="flex items-center gap-3">
                <button onClick={holdCurrentSale} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 hover:text-amber-700">
                  <PauseCircle size={16}/> Askıya Al
                </button>
                <button onClick={clearCart} className="text-sm text-red-500 hover:text-red-600">
                  Temizle
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
              <ShoppingCart size={48} />
              <p className="text-sm">Sepet boş</p>
              <p className="text-xs">Ürün seçerek başlayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 animate-fade-in"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(getEffectivePrice(item.product) * (1 - (Number(item.discountPercent || 0) / 100)))} x {item.quantity}
                    </p>
                    <div className="mt-1 flex items-center gap-1"><span className="text-[11px] text-slate-400">İsk.%</span><input aria-label="İskonto yüzdesi" type="number" min="0" max="100" step="1" className="h-6 w-14 rounded border border-slate-200 px-1 text-xs" value={item.discountPercent || ''} onChange={e=>{const v=Math.max(0,Math.min(100,Number(e.target.value)||0));setCart(prev=>prev.map(i=>i.product.id===item.product.id?{...i,discountPercent:v}:i));}} /></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-bold text-teal-700">
                    {formatCurrency(getEffectivePrice(item.product) * (1 - (Number(item.discountPercent || 0) / 100)) * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Total */}
        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-slate-500">Toplam</span>
            <span className="text-2xl font-bold text-slate-800">
              {formatCurrency(cartTotal)}
            </span>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={() => setShowPayment(true)}
            className="btn-success w-full py-3 text-lg"
          >
            <CreditCard size={22} />
            Ödemeye Geç
          </button>
        </div>
      </div>

      {showHeldSales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHeldSales(false)}>
          <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Bekletilen Satışlar</h2>
                <p className="text-sm text-slate-500">Ödemeyi daha sonra tamamlamak için askıya aldığın sepetler.</p>
              </div>
              <button onClick={() => setShowHeldSales(false)} className="text-slate-400 hover:text-slate-600"><X size={22}/></button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {heldSales.length === 0 ? <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">Bekletilen satış yok.</div> : heldSales.map((entry) => {
                const total = entry.items.reduce((sum, item) => sum + getEffectivePrice(item.product) * (1 - (Number(item.discountPercent || 0) / 100)) * item.quantity, 0);
                return <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div><p className="font-semibold text-slate-700">{entry.items.length} ürün · {entry.items.reduce((n,i)=>n+i.quantity,0)} adet</p><p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString('tr-TR')}</p></div>
                    <p className="font-bold text-teal-700">{formatCurrency(total)}</p>
                  </div>
                  <div className="mb-3 text-xs text-slate-500">{entry.items.map(i => `${i.quantity}× ${i.product.name}`).join(' · ')}</div>
                  <div className="flex gap-2"><button onClick={() => resumeHeldSale(entry.id)} className="btn-primary flex-1 py-2"><PlayCircle size={16}/> Geri Al</button><button onClick={() => deleteHeldSale(entry.id)} className="btn-secondary py-2 text-red-600">Sil</button></div>
                </div>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          total={cartTotal}
          customers={customers}
          onClose={() => setShowPayment(false)}
          processing={processingSale}
          onComplete={async (method, paid, customerName, customerId, splits) => {
            if (processingSale) return;
            setProcessingSale(true);
            try {
              let sale = await completeSale(cart, method, paid, customerName, customerId, splits);
              if (!sale && !navigator.onLine) {
                const queued = queueOfflineSale({ items: cart.map(i => ({...i, fixedUnitPrice: getEffectivePrice(i.product) * (1 - (Number(i.discountPercent||0)/100))})), paymentMethod: method, paidAmount: paid, customerName, customerId, paymentSplits: splits });
                if (queued) {
                  alert('İnternet yok. Satış bu cihazda güvenli kuyruğa alındı; bağlantı geldiğinde otomatik senkronize edilecek.');
                  setCart([]); setShowPayment(false);
                } else {
                  alert('İnternet yok ve yerel satış kuyruğuna kayıt yapılamadı. Satış tamamlanmadı.');
                }
                return;
              }
              if (sale) {
                setLastSale(sale);
                setShowReceipt(true);
                setCart([]);
                setShowPayment(false);
              } else {
                alert('Satış kaydedilemedi. Supabase bağlantısı veya veritabanı şeması kontrol edilmeli. F12 > Console bölümündeki kırmızı hatayı açıp gönder.');
              }
            } finally {
              setProcessingSale(false);
            }
          }}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <ReceiptModal
          sale={lastSale}
          onClose={() => {
            setShowReceipt(false);
            setLastSale(null);
          }}
          onNewSale={() => {
            setShowReceipt(false);
            setLastSale(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  total,
  customers,
  onClose,
  onComplete,
  processing,
}: {
  total: number;
  customers: { id: string; name: string; balance: number }[];
  onClose: () => void;
  processing: boolean;
  onComplete: (method: PaymentMethod, paid: number, customerName?: string, customerId?: string, splits?: PaymentSplit[]) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cashPart, setCashPart] = useState('');
  const [cardPart, setCardPart] = useState('');
  const [creditPart, setCreditPart] = useState('');
  const [error, setError] = useState('');

  const paid = parseFloat(paidAmount) || 0;
  const change = method === 'cash' ? paid - total : 0;

  function handleSubmit() {
    if (method === 'cash' && paid < total) {
      setError('Ödenen tutar yetersiz');
      return;
    }
    if (method === 'credit') {
      if (!selectedCustomerId) { setError('Veresiye için kayıtlı bir müşteri seçin.'); return; }
      const cust = customers.find((c) => c.id === selectedCustomerId);
      onComplete(method, total, cust?.name, selectedCustomerId); return;
    }
    if (method === 'split') {
      const cash=Number(cashPart)||0, card=Number(cardPart)||0, credit=Number(creditPart)||0;
      if (Math.abs(cash+card+credit-total)>0.01) { setError(`Karma ödeme toplamı ${formatCurrency(total)} olmalı.`); return; }
      if (credit>0 && !selectedCustomerId) { setError('Karma ödemede veresiye kısmı için müşteri seçin.'); return; }
      const cust=customers.find(c=>c.id===selectedCustomerId);
      const splits: PaymentSplit[]=[]; if(cash>0)splits.push({method:'cash',amount:cash}); if(card>0)splits.push({method:'card',amount:card}); if(credit>0)splits.push({method:'credit',amount:credit,customerId:selectedCustomerId,customerName:cust?.name});
      onComplete('split', cash, cust?.name, selectedCustomerId, splits); return;
    }
    onComplete(method, method === 'cash' ? paid : total);
  }

  function quickAmount(val: number) {
    setPaidAmount(val.toFixed(2));
    setError('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="card w-full max-w-md p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Ödeme</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        <div className="mb-6 rounded-lg bg-teal-50 p-4 text-center">
          <p className="text-sm text-teal-600">Ödenecek Tutar</p>
          <p className="text-3xl font-bold text-teal-700">{total === 0 ? 'ÜCRETSİZ' : formatCurrency(total)}</p>
        </div>

        {/* Payment Methods */}
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['cash', 'card', 'credit', 'split'] as PaymentMethod[]).map((key) => {
            const val = key === 'split' ? {label:'Karma'} : PAYMENT_METHODS[key as keyof typeof PAYMENT_METHODS];
            const Icon = key === 'cash' ? Banknote : key === 'card' ? CreditCard : key === 'credit' ? BookOpen : Receipt;
            const activeClasses = {
              cash: 'border-emerald-500 bg-emerald-50 text-emerald-700',
              card: 'border-blue-500 bg-blue-50 text-blue-700',
              credit: 'border-amber-500 bg-amber-50 text-amber-700',
              split: 'border-violet-500 bg-violet-50 text-violet-700',
            }[key];
            return (
              <button
                key={key}
                onClick={() => { setMethod(key); setError(''); }}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all ${
                  method === key ? activeClasses : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <Icon size={24} />
                <span className="text-sm font-medium">{val.label}</span>
              </button>
            );
          })}
        </div>

        {/* Cash Payment */}
        {method === 'cash' && (
          <div className="mb-4">
            <label className="label">Alınan Para</label>
            <input
              type="number"
              className="input text-lg"
              placeholder="0.00"
              value={paidAmount}
              onChange={(e) => { setPaidAmount(e.target.value); setError(''); }}
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200].map((val, i) => (
                <button
                  key={i}
                  onClick={() => quickAmount(val)}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  {formatCurrency(val)}
                </button>
              ))}
            </div>
            {paid >= total && (
              <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-sm text-emerald-600">Para Üstü</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(change)}</p>
              </div>
            )}
          </div>
        )}

        {method === 'split' && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-3">
            <p className="font-semibold text-violet-800">Karma ödeme</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Nakit</label><input type="number" step="0.01" className="input" value={cashPart} onChange={e=>setCashPart(e.target.value)} /></div>
              <div><label className="label">Kart</label><input type="number" step="0.01" className="input" value={cardPart} onChange={e=>setCardPart(e.target.value)} /></div>
              <div><label className="label">Veresiye</label><input type="number" step="0.01" className="input" value={creditPart} onChange={e=>setCreditPart(e.target.value)} /></div>
            </div>
            {Number(creditPart)>0 && <div><label className="label">Veresiye müşterisi</label><select className="input" value={selectedCustomerId} onChange={e=>setSelectedCustomerId(e.target.value)}><option value="">Müşteri seç</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
            <p className="text-xs font-semibold text-violet-800">Dağıtılan: {formatCurrency((Number(cashPart)||0)+(Number(cardPart)||0)+(Number(creditPart)||0))} / {formatCurrency(total)}</p>
          </div>
        )}

        {/* Credit Payment */}
        {method === 'credit' && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label className="label">Veresiye Müşterisi</label>
            <select
              className="input"
              value={selectedCustomerId}
              onChange={(e) => { setSelectedCustomerId(e.target.value); setError(''); }}
            >
              <option value="">— Kayıtlı müşteri seç —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.balance > 0 ? `(Mevcut borç: ${formatCurrency(c.balance)})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-amber-700">Müşteri seçimi zorunlu. Böylece alınan ürünler, tarih/saat ve borç ödeme geçmişi müşteriye bağlanır.</p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <button onClick={handleSubmit} disabled={processing} className="btn-success w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-60">
          {processing ? 'Satış kaydediliyor...' : 'Satışı Tamamla'}
        </button>
      </div>
    </div>
  );
}

function ReceiptModal({
  sale,
  onClose,
  onNewSale,
}: {
  sale: SaleWithItems;
  onClose: () => void;
  onNewSale: () => void;
}) {
  const methodLabel = sale.payment_method === 'split' ? 'Karma' : PAYMENT_METHODS[sale.payment_method].label;

  function handlePrint() { window.print(); }

  function shareWhatsApp() {
    const lines = ['PRO POS FİŞ', ...sale.sale_items.map(i => `${i.quantity}x ${i.product_name} - ${formatCurrency(i.subtotal)}`), '', `TOPLAM: ${formatCurrency(sale.total)}`, `ÖDEME: ${methodLabel}`, sale.customer_name ? `MÜŞTERİ: ${sale.customer_name}` : ''];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="card w-full max-w-sm p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Receipt className="text-emerald-600" size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Satış Tamamlandı</h2>
        </div>

        <div className="mb-4 rounded-lg border border-dashed border-slate-300 p-4 font-mono text-sm">
          <div className="mb-2 flex justify-between border-b border-slate-200 pb-2">
            <span className="font-bold">FİŞ</span>
            <span className="text-slate-500">{new Date(sale.created_at).toLocaleTimeString('tr-TR')}</span>
          </div>
          {sale.sale_items.map((item, i) => (
            <div key={i} className="mb-1 flex justify-between">
              <span className="truncate">{item.quantity}x {item.product_name}</span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-200 pt-2">
            {Number(sale.discount_total || 0) > 0 && <div className="mb-1 flex justify-between text-slate-500"><span>İndirim</span><span>-{formatCurrency(Number(sale.discount_total))}</span></div>}
            <div className="flex justify-between font-bold">
              <span>TOPLAM</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{methodLabel}</span>
              {sale.payment_method === 'cash' && <span>Üst: {formatCurrency(sale.paid_amount - sale.total)}</span>}
            </div>
            {sale.customer_name && (
              <div className="flex justify-between text-slate-500">
                <span>Müşteri</span>
                <span>{sale.customer_name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex-1 py-2.5">
            <Printer size={18} />
            Yazdır
          </button>
          <button onClick={shareWhatsApp} className="btn-secondary flex-1 py-2.5"><Share2 size={18} /> WhatsApp</button>
          <button onClick={onNewSale} className="btn-primary flex-1 py-2.5">
            Yeni Satış
          </button>
        </div>
      </div>
    </div>
  );
}
