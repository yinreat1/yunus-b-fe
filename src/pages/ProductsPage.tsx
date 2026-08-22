import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Search, Package, AlertTriangle, RotateCcw } from 'lucide-react';
import { useProducts, useCategories, addProduct, updateProduct, deleteProduct, useDeletedProducts, restoreProduct } from '@/lib/hooks';
import { formatCurrency, generateBarcode } from '@/lib/utils';
import type { Product } from '@/lib/supabase';

export default function ProductsPage() {
  const { products, loading, reload: reloadProducts } = useProducts();
  const { products: deletedProducts, loading: trashLoading, reload: reloadTrash } = useDeletedProducts(200);
  const [showTrash, setShowTrash] = useState(false);
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
  );

  const lowStock = products.filter((p) => p.stock <= p.min_stock);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ürün Yönetimi</h1>
            <p className="text-sm text-slate-500">{products.length} ürün kayıtlı</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTrash(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Trash2 size={17} />
              Ürün Çöp Kutusu
              {deletedProducts.length > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">{deletedProducts.length}</span>}
            </button>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-primary px-4 py-2"
            >
              <Plus size={18} />
              Yeni Ürün
            </button>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 px-6 py-2 text-sm text-amber-700">
          <AlertTriangle size={16} />
          <span>{lowStock.length} üründe stok azaldi: </span>
          <span className="font-medium">{lowStock.slice(0, 3).map((p) => p.name).join(', ')}{lowStock.length > 3 ? '...' : ''}</span>
        </div>
      )}

      {/* Search */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            className="input pl-10"
            placeholder="Ürün veya barkod ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <Package size={48} />
            <p>Ürün bulunamadı</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Ürün</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Barkod</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Kategori</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Fiyat</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Stok</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const cat = categories.find((c) => c.id === product.category_id);
                  return (
                    <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{product.name}</p>
                        <p className="text-xs text-slate-400">{product.unit}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{product.barcode || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{cat?.name || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-700">{formatCurrency(product.price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-medium ${product.stock <= product.min_stock ? 'text-red-500' : 'text-slate-600'}`}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setEditing(product); setShowForm(true); }}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`"${product.name}" ürününü çöp kutusuna taşımak istiyor musunuz? Ürün verisi silinmeyecek.`)) {
                                await deleteProduct(product.id);
                                await reloadProducts();
                                await reloadTrash();
                              }
                            }}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showTrash && (
        <ProductTrashModal
          products={deletedProducts}
          loading={trashLoading}
          onClose={() => setShowTrash(false)}
          onRestore={async (id) => {
            const ok = await restoreProduct(id);
            if (ok) {
              await reloadProducts();
              await reloadTrash();
            } else {
              alert('Ürün geri yüklenemedi.');
            }
          }}
        />
      )}

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ProductTrashModal({
  products,
  loading,
  onClose,
  onRestore,
}: {
  products: Product[];
  loading: boolean;
  onClose: () => void;
  onRestore: (id: string) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[80vh] overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Trash2 size={19} /> Ürün Çöp Kutusu</h2>
            <p className="text-xs text-slate-500 mt-1">Ürünler fiziksel olarak silinmez. Buradan geri yükleyebilirsin.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Yükleniyor...</div>
          ) : products.length === 0 ? (
            <div className="p-10 text-center text-slate-400">Ürün çöp kutusu boş.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {products.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-slate-700">{product.name}</p>
                    <p className="text-xs text-slate-400">{product.barcode || 'Barkod yok'} · {formatCurrency(product.price)}</p>
                  </div>
                  <button
                    onClick={() => onRestore(product.id)}
                    className="flex items-center gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-100"
                  >
                    <RotateCcw size={14} /> Geri Yükle
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name || '');
  const [barcode, setBarcode] = useState(product?.barcode || '');
  const [price, setPrice] = useState(product?.price.toString() || '');
  const [cost, setCost] = useState(product?.cost.toString() || '0');
  const [stock, setStock] = useState(product?.stock.toString() || '0');
  const [minStock, setMinStock] = useState(product?.min_stock.toString() || '5');
  const [categoryId, setCategoryId] = useState(product?.category_id || '');
  const [unit, setUnit] = useState(product?.unit || 'adet');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      min_stock: parseFloat(minStock) || 0,
      category_id: categoryId || null,
      unit,
    };

    if (product) {
      await updateProduct(product.id, data);
    } else {
      await addProduct(data);
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {product ? 'Ürün Düzenle' : 'Yeni Ürün'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Ürün Adı *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="label">Barkod</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barkod veya boş bırak" />
              <button
                type="button"
                onClick={() => setBarcode(generateBarcode())}
                className="btn-secondary whitespace-nowrap"
              >
                <Plus size={16} />
                Oluştur
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Satış Fiyatı (TL) *</label>
              <input type="number" step="0.01" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="label">Alış Fiyatı (TL)</label>
              <input type="number" step="0.01" className="input" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Stok Adedi</label>
              <input type="number" step="0.001" className="input" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <label className="label">Min. Stok Uyarı</label>
              <input type="number" step="0.001" className="input" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Kategori</label>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Kategorisiz</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">
              İptal
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5">
              {saving ? 'Kaydediliyor...' : product ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
