import { useState, useEffect } from 'react';
import { ShoppingCart, Package, Tags, Barcode, BarChart3, Store, Smartphone, Download, X, Settings, Users, Calculator } from 'lucide-react';
import POSPage from '@/pages/POSPage';
import ProductsPage from '@/pages/ProductsPage';
import CategoriesPage from '@/pages/CategoriesPage';
import BarcodePage from '@/pages/BarcodePage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import CustomersPage from '@/pages/CustomersPage';
import CashPage from '@/pages/CashPage';
import MobilePage from '@/pages/MobilePage';

type Page = 'pos' | 'products' | 'categories' | 'barcode' | 'reports' | 'customers' | 'cash' | 'settings';

const navItems: { key: Page; label: string; icon: typeof ShoppingCart }[] = [
  { key: 'pos', label: 'Satış', icon: ShoppingCart },
  { key: 'products', label: 'Ürünler', icon: Package },
  { key: 'categories', label: 'Kategoriler', icon: Tags },
  { key: 'barcode', label: 'Barkod Yazdır', icon: Barcode },
  { key: 'reports', label: 'Raporlar', icon: BarChart3 },
  { key: 'customers', label: 'Müşteriler & Cari', icon: Users },
  { key: 'cash', label: 'Kasa & Gün Sonu', icon: Calculator },
  { key: 'settings', label: 'Ayarlar', icon: Settings },
];

function isMobile() {
  return window.innerWidth < 768;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function App() {
  const [mobile, setMobile] = useState(isMobile());
  const [page, setPage] = useState<Page>('pos');
  const [forceMobile, setForceMobile] = useState(false);
  const [forcePC, setForcePC] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = () => setMobile(isMobile());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
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
          <PCLayout page={page} setPage={setPage} setForceMobile={setForceMobile} />
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
      <PCLayout page={page} setPage={setPage} setForceMobile={setForceMobile} />
    </>
  );
}

function PCLayout({ page, setPage, setForceMobile }: { page: Page; setPage: (p: Page) => void; setForceMobile: (v: boolean) => void }) {
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
            <p className="text-xs text-slate-400">Market Satış Sistemi</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
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
        {page === 'pos' && <POSPage onNavigate={(p) => setPage(p as Page)} />}
        {page === 'products' && <ProductsPage />}
        {page === 'categories' && <CategoriesPage />}
        {page === 'barcode' && <BarcodePage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'customers' && <CustomersPage />}
        {page === 'cash' && <CashPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
