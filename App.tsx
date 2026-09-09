import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Package, Tags, Barcode, BarChart3, Store, Smartphone, Download, X, Settings, Users, Calculator } from 'lucide-react';
import POSPage from '@/pages/POSPage';
import ProductsPage from '@/pages/ProductsPage';
import CategoriesPage from '@/pages/CategoriesPage';
import BarcodePage from '@/pages/BarcodePage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import CustomersPage from '@/pages/CustomersPage';
import StaffPage from '@/pages/StaffPage';
import CashPage from '@/pages/CashPage';
import DashboardPage from '@/pages/DashboardPage';
import MobilePage from '@/pages/MobilePage';
import { useStaff } from '@/lib/hooks';
import { hasMasterPassword, setMasterPassword, verifyMasterPassword } from '@/lib/security';
import type { Staff } from '@/lib/supabase';

type Page = 'dashboard' | 'pos' | 'products' | 'categories' | 'barcode' | 'reports' | 'customers' | 'cash' | 'staff' | 'settings';


class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Uygulama hatası:', error, info); }
  render() {
    if (this.state.error) return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
          <h1 className="mb-2 text-lg font-bold text-red-700">Sayfa yüklenemedi</h1>
          <p className="mb-4 text-sm text-slate-600">Bir uygulama hatası oluştu. Bu ekran beyaz kalmak yerine hatayı gösteriyor.</p>
          <pre className="mb-4 max-h-48 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-700">{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Yenile</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

const navItems: { key: Page; label: string; icon: typeof ShoppingCart }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'pos', label: 'Satış', icon: ShoppingCart },
  { key: 'products', label: 'Ürünler', icon: Package },
  { key: 'categories', label: 'Kategoriler', icon: Tags },
  { key: 'barcode', label: 'Barkod Yazdır', icon: Barcode },
  { key: 'reports', label: 'Raporlar', icon: BarChart3 },
  { key: 'customers', label: 'Müşteriler & Cari', icon: Users },
  { key: 'cash', label: 'Kasa & Gün Sonu', icon: Calculator },
  { key: 'staff', label: 'Personel & Yetki', icon: Users },
  { key: 'settings', label: 'Ayarlar', icon: Settings },
];

function isMobile() {
  return window.innerWidth < 768;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};


const STAFF_SESSION_KEY = 'propos-current-staff-v2';

function canAccess(role: Staff['role'] | null, page: Page) {
  if (!role) return true;
  if (role === 'admin') return true;
  if (role === 'manager') return page !== 'staff' && page !== 'settings';
  return page === 'pos' || page === 'customers';
}

function roleLabel(role: Staff['role']) {
  return role === 'admin' ? 'Yönetici / Admin' : role === 'manager' ? 'Müdür' : 'Kasiyer';
}

function readSession(): Staff | null {
  try { const raw = sessionStorage.getItem(STAFF_SESSION_KEY); return raw ? JSON.parse(raw) as Staff : null; } catch { return null; }
}
function writeSession(staff: Staff | null) {
  try {
    if (staff) sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(staff));
    else sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {}
}

function MasterPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const firstRun = !hasMasterPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (firstRun && password !== confirm) { setError('Şifreler aynı değil.'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı.'); return; }
    setBusy(true);
    try {
      if (firstRun) await setMasterPassword(password);
      else if (!await verifyMasterPassword(password)) { setError('Şifre hatalı.'); setBusy(false); return; }
      sessionStorage.setItem('propos-master-unlocked', '1'); onUnlock();
    } catch (err) { setError(err instanceof Error ? err.message : 'Şifre işlemi başarısız.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white"><Settings size={28}/></div>
      <h1 className="text-center text-xl font-bold text-slate-800">{firstRun ? 'Pro POS İlk Kurulum' : 'Pro POS Sistem Şifresi'}</h1>
      <p className="mt-1 text-center text-sm text-slate-500">{firstRun ? 'Sisteme erişim için bir ana şifre belirleyin.' : 'Devam etmek için sistem şifresini girin.'}</p>
      <div className="mt-6 space-y-3">
        <input autoFocus className="input" type="password" placeholder="Sistem şifresi" value={password} onChange={e=>setPassword(e.target.value)} />
        {firstRun && <input className="input" type="password" placeholder="Şifreyi tekrar girin" value={confirm} onChange={e=>setConfirm(e.target.value)} />}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button disabled={busy} className="btn-primary w-full py-3">{busy ? 'Kontrol ediliyor...' : firstRun ? 'Şifreyi Belirle ve Devam Et' : 'Giriş Yap'}</button>
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-400">Bu cihazdaki uygulama erişimini korur. Veritabanı güvenliği için Supabase Auth/RLS kurulumu ayrıca önerilir.</p>
    </form>
  </div>;
}

function StaffLogin({ staff, onLogin }: { staff: Staff[]; onLogin: (s: Staff) => void }) {
  const [selected, setSelected] = useState(staff.find(s => s.active)?.id || '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const active = staff.filter(s => s.active);
  const current = active.find(s => s.id === selected) || active[0];
  useEffect(() => { if (!selected && current) setSelected(current.id); }, [selected, current]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const s = active.find(x => x.id === selected);
    if (!s) { setError('Aktif personel bulunamadı.'); return; }
    if (s.pin_hash) {
      try {
        const { data, error: verifyError } = await import('@/lib/supabase').then(({ supabase }) =>
          supabase.rpc('verify_staff_pin', { p_staff_id: s.id, p_pin: pin.trim() })
        );
        if (verifyError) {
          setError("PIN doğrulanamadı. Supabase personel migration'ını çalıştırın.");
          return;
        }
        if (data !== true) { setError('PIN hatalı.'); return; }
      } catch {
        setError('PIN doğrulama işlemi başarısız.');
        return;
      }
    } else if (s.pin && s.pin !== pin.trim()) {
      setError('PIN hatalı.');
      return;
    }
    onLogin(s);
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white"><Store size={28}/></div>
      <h1 className="text-center text-xl font-bold text-slate-800">Pro POS Personel Girişi</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Yetkilerinize göre menüler ve işlemler açılır.</p>
      <div className="mt-6 space-y-3">
        <select className="input" value={selected} onChange={e=>setSelected(e.target.value)}>
          {active.map(s=><option key={s.id} value={s.id}>{s.name} — {roleLabel(s.role)}</option>)}
        </select>
        {(current?.pin_hash || current?.pin) && <input className="input font-mono" autoFocus type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)} maxLength={8}/>} 
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full py-3" type="submit">Giriş Yap</button>
      </div>
    </form>
  </div>;
}

function AppContent() {
  const { staff } = useStaff();
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(() => readSession());
  const [mobile, setMobile] = useState(isMobile());
  const [page, setPage] = useState<Page>('pos');
  const [forceMobile, setForceMobile] = useState(false);
  const [forcePC, setForcePC] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [masterUnlocked, setMasterUnlocked] = useState(() => sessionStorage.getItem('propos-master-unlocked') === '1');
  const activeStaff = useMemo(() => staff.filter(s => s.active), [staff]);
  useEffect(() => {
    if (!activeStaff.length) { setCurrentStaff(null); writeSession(null); return; }
    const saved = currentStaff && activeStaff.find(s => s.id === currentStaff.id);
    if (saved) { setCurrentStaff(saved); writeSession(saved); }
    else { setCurrentStaff(null); writeSession(null); }
  }, [activeStaff]);

  useEffect(() => {
    const onlineHandler=()=>setOnline(navigator.onLine); window.addEventListener('online',onlineHandler); window.addEventListener('offline',onlineHandler);
    const handler = () => setMobile(isMobile());
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); window.removeEventListener('online',onlineHandler); window.removeEventListener('offline',onlineHandler); };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      if (!sessionStorage.getItem('install-dismissed')) {
        setShowInstallBanner(true);
      }
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallBanner(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowInstallBanner(false);
  }

  function dismissInstall() {
    setShowInstallBanner(false);
    sessionStorage.setItem('install-dismissed', '1');
  }

  const useMobileView = mobile || forceMobile;
  const allowedItems = navItems.filter(item => canAccess(currentStaff?.role || null, item.key));
  useEffect(() => {
    if (!canAccess(currentStaff?.role || null, page)) setPage('pos');
  }, [currentStaff, page]);
  if (!masterUnlocked) return <MasterPasswordGate onUnlock={() => setMasterUnlocked(true)} />;
  if (activeStaff.length && !currentStaff) return <StaffLogin staff={activeStaff} onLogin={(s) => { writeSession(s); setCurrentStaff(s); setPage('pos'); }} />;

  if (useMobileView && !forceMobile && !forcePC) {
    return <MobilePage onSwitchToPC={() => setForcePC(true)} />;
  }

  if (forcePC) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex items-center justify-between bg-teal-700 px-4 py-2 text-white">
          <span className="text-sm font-medium">Pro POS (PC Görünümü)</span>
          <button onClick={() => setForcePC(false)} className="rounded bg-teal-600 px-3 py-1 text-sm hover:bg-teal-500">
            Mobil Moda Geç
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <PCLayout page={page} setPage={setPage} setForceMobile={setForceMobile} online={online} currentStaff={currentStaff} allowedItems={allowedItems} onLogout={() => { writeSession(null); sessionStorage.removeItem('propos-master-unlocked'); setMasterUnlocked(false); setCurrentStaff(null); }} />
        </div>
      </div>
    );
  }

  if (forceMobile) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex items-center justify-between bg-teal-700 px-4 py-2 text-white">
          <span className="text-sm font-medium">Mobil Önizleme (El Terminali)</span>
          <button onClick={() => setForceMobile(false)} className="rounded bg-teal-600 px-3 py-1 text-sm hover:bg-teal-500">
            PC Moduna Geç
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <MobilePage />
        </div>
      </div>
    );
  }

  return (
    <>
      {showInstallBanner && !isInstalled && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-white p-4 shadow-2xl border border-slate-200 animate-slide-up max-w-sm">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-600">
            <Download className="text-white" size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">Bilgisayara Yükle</p>
            <p className="text-xs text-slate-500">Pro POS'u masaüstü uygulaması olarak kurun, tek tıkla açın.</p>
          </div>
          <button onClick={handleInstall} className="btn-primary px-3 py-1.5 text-xs whitespace-nowrap">
            Yükle
          </button>
          <button onClick={dismissInstall} className="text-slate-300 hover:text-slate-500">
            <X size={18} />
          </button>
        </div>
      )}
      <PCLayout page={page} setPage={setPage} setForceMobile={setForceMobile} online={online} currentStaff={currentStaff} allowedItems={allowedItems} onLogout={() => { writeSession(null); sessionStorage.removeItem('propos-master-unlocked'); setMasterUnlocked(false); setCurrentStaff(null); }} />
    </>
  );
}

function PCLayout({ page, setPage, setForceMobile, online, currentStaff, allowedItems, onLogout }: { page: Page; setPage: (p: Page) => void; setForceMobile: (v: boolean) => void; online: boolean; currentStaff: Staff | null; allowedItems: typeof navItems; onLogout: () => void }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-slate-800 text-white">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
            <Store size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Pro POS</h1>
            <p className="text-xs text-slate-400">Market Satış Sistemi</p><p className={`mt-1 text-[10px] font-semibold ${online?'text-emerald-400':'text-amber-300'}`}>{online?'● Çevrimiçi':'● Çevrimdışı · Kuyruk aktif'}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  active
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {currentStaff && <div className="border-t border-slate-700 p-3"><div className="mb-2 rounded-lg bg-slate-700/60 px-3 py-2"><p className="text-sm font-semibold text-white">{currentStaff.name}</p><p className="text-xs text-slate-400">{roleLabel(currentStaff.role)}</p></div><button onClick={onLogout} className="mb-2 flex w-full items-center justify-center rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600">Personel Değiştir / Çıkış</button></div>}
        <div className="border-t border-slate-700 p-3">
          <button
            onClick={() => setForceMobile(true)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
          >
            <Smartphone size={20} />
            El Terminali Modu
          </button>
          <p className="mt-2 px-4 text-xs text-slate-500">
            Telefondan da aynı adrese girerek el terminalini kullanabilirsiniz.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {page === 'dashboard' && <DashboardPage />}
        {page === 'pos' && <POSPage onNavigate={(p) => setPage(p as Page)} />}
        {page === 'products' && <ProductsPage />}
        {page === 'categories' && <CategoriesPage />}
        {page === 'barcode' && <BarcodePage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'customers' && <CustomersPage />}
        {page === 'cash' && <CashPage />}
        {page === 'staff' && <StaffPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }
