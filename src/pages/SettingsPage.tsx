import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Store, Save, Info, Database, Monitor, Smartphone, Trash2, AlertTriangle, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AppSettings = {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  currency: string;
  receiptFooter: string;
  taxRate: string;
  lowStockDefault: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  storeName: 'Pro POS Market',
  storeAddress: '',
  storePhone: '',
  currency: 'TRY',
  receiptFooter: 'Bizi tercih ettiğiniz için teşekkürler!',
  taxRate: '0',
  lowStockDefault: '5',
};

const STORAGE_KEY = 'pos-settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export { loadSettings, saveSettings };
export type { AppSettings };

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearStep, setClearStep] = useState<'idle' | 'confirm' | 'done' | 'error'>('idle');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }

  async function handleClearAll() {
    setClearing(true);
    const order = ['sale_items', 'sales', 'cash_sessions', 'products', 'categories', 'customers'];
    let allOk = true;
    for (const table of order) {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.error(`${table} temizlenemedi:`, error);
        allOk = false;
      }
    }
    setClearing(false);
    if (allOk) {
      localStorage.removeItem(STORAGE_KEY);
      setSettings(DEFAULT_SETTINGS);
      setClearStep('done');
      setTimeout(() => { setShowClearConfirm(false); setClearStep('idle'); }, 2500);
    } else {
      setClearStep('error');
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ayarlar</h1>
            <p className="text-sm text-slate-500">Mağaza bilgileri ve sistem ayarları</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} className="btn-secondary px-4 py-2">
              Sıfırla
            </button>
            <button onClick={handleSave} className="btn-primary px-4 py-2">
              {saved ? 'Kaydedildi!' : 'Kaydet'}
              {!saved && <Save size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Store Info */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
                <Store className="text-teal-600" size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Mağaza Bilgileri</h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">Fiş ve etiketlerde görünecek mağaza bilgileri</p>

            <div className="space-y-4">
              <div>
                <label className="label">Mağaza Adı</label>
                <input
                  className="input"
                  value={settings.storeName}
                  onChange={(e) => update('storeName', e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Telefon</label>
                  <input
                    className="input"
                    value={settings.storePhone}
                    onChange={(e) => update('storePhone', e.target.value)}
                    placeholder="0xxx xxx xx xx"
                  />
                </div>
                <div>
                  <label className="label">Para Birimi</label>
                  <select
                    className="input"
                    value={settings.currency}
                    onChange={(e) => update('currency', e.target.value)}
                  >
                    <option value="TRY">Türk Lirası (TL)</option>
                    <option value="USD">Dolar ($)</option>
                    <option value="EUR">Euro (€)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Adres</label>
                <input
                  className="input"
                  value={settings.storeAddress}
                  onChange={(e) => update('storeAddress', e.target.value)}
                  placeholder="Mağaza adresi"
                />
              </div>
            </div>
          </div>

          {/* Receipt & Label Settings */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <SettingsIcon className="text-blue-600" size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Fiş ve Etiket Ayarları</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Fiş Alt Yazısı</label>
                <input
                  className="input"
                  value={settings.receiptFooter}
                  onChange={(e) => update('receiptFooter', e.target.value)}
                  placeholder="Fişin altında görünecek mesaj"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">KDV Oranı (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={settings.taxRate}
                    onChange={(e) => update('taxRate', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Varsayılan Min. Stok</label>
                  <input
                    type="number"
                    className="input"
                    value={settings.lowStockDefault}
                    onChange={(e) => update('lowStockDefault', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                <Info className="text-slate-600" size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Sistem Bilgisi</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-teal-600" />
                  <span className="text-slate-600">Veritabanı</span>
                </div>
                <span className="font-medium text-slate-800">Supabase (Bulut)</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Monitor size={16} className="text-blue-600" />
                  <span className="text-slate-600">PC Kullanımı</span>
                </div>
                <span className="font-medium text-slate-800">Tarayıcıdan "Yükle" ile masaüstüne kur</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-amber-600" />
                  <span className="text-slate-600">Mobil Kullanım</span>
                </div>
                <span className="font-medium text-slate-800">Telefondan aynı adrese gir</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-teal-50 border border-teal-200 p-4">
              <p className="text-sm text-teal-800">
                Tüm verileriniz (ürünler, satışlar, stok) bulutta güvenle saklanır.
                Bilgisayar veya telefondan girildiğinde veriler otomatik senkronize olur.
                İnternet bağlantısı gereklidir.
              </p>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="card border-red-200 p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                <Trash2 className="text-red-600" size={20} />
              </div>
              <h2 className="text-lg font-bold text-red-700">Tehlikeli Bölge</h2>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              Aşağıdaki işlem tüm ürünleri, kategorileri, satışları, müşterileri ve kasa oturumlarını
              <span className="font-semibold text-red-600"> kalıcı olarak siler</span>. Bu işlem geri alınamaz.
            </p>
            <button
              onClick={() => { setShowClearConfirm(true); setClearStep('confirm'); }}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-700"
            >
              <Trash2 size={18} className="inline mr-1" />
              Tüm Verileri Temizle
            </button>
          </div>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => !clearing && setShowClearConfirm(false)}>
          <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {clearStep === 'confirm' && (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                    <AlertTriangle className="text-red-600" size={26} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Emin Misiniz?</h2>
                    <p className="text-sm text-slate-500">Bu işlem geri alınamaz</p>
                  </div>
                </div>
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-700">
                    Tüm ürünler, kategoriler, satışlar, müşteriler ve kasa oturumları kalıcı olarak silinecek.
                    Bu verileri tekrar geri getiremezsiniz.
                  </p>
                </div>
                <p className="mb-4 text-center text-sm font-medium text-slate-700">
                  Onaylamak için aşağıdaki butona basın
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    disabled={clearing}
                    className="btn-secondary flex-1 py-3"
                  >
                    <X size={18} />
                    Hayır, Vazgeç
                  </button>
                  <button
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-red-700 disabled:opacity-50 flex-1 flex items-center justify-center gap-1"
                  >
                    {clearing ? 'Temizleniyor...' : (
                      <>
                        <Check size={18} />
                        Evet, Sıfırla
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
            {clearStep === 'done' && (
              <div className="text-center py-6">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <Check className="text-emerald-600" size={30} />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Veriler Temizlendi</h2>
                <p className="mt-1 text-sm text-slate-500">Tüm veriler başarıyla silindi</p>
              </div>
            )}
            {clearStep === 'error' && (
              <div className="text-center py-6">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                  <AlertTriangle className="text-red-600" size={30} />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Hata Oluştu</h2>
                <p className="mt-1 text-sm text-slate-500">Bazı veriler silinemedi. Tekrar deneyin.</p>
                <button onClick={() => setClearStep('confirm')} className="btn-secondary mt-4 px-4 py-2">Tekrar Dene</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
