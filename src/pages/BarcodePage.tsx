import { useState, useRef, useEffect } from 'react';
import { Search, Printer, X, Plus, Barcode as BarcodeIcon, Camera } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { useProducts } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/lib/supabase';
import BarcodeScanner from '@/components/BarcodeScanner';

type SelectedProduct = {
  product: Product;
  copies: number;
};

type LayoutType = 'small' | 'medium' | 'large';

type LayoutConfig = {
  variant: LayoutType;
  cols: number;
  rows: number;
  label: string;
  perSheet: number;
  width: string;
  height: string;
  nameSize: number;
  priceSize: number;
  barcodeHeight: number;
  barcodeWidth: number;
  barcodeFontSize: number;
  dateSize: number;
};

const LAYOUTS: Record<LayoutType, LayoutConfig> = {
  small: {
    variant: 'small', cols: 3, rows: 9, label: '80 x 30 mm', perSheet: 27,
    width: '80mm', height: '30mm',
    nameSize: 10, priceSize: 25, barcodeHeight: 24, barcodeWidth: 1.6, barcodeFontSize: 8, dateSize: 7,
  },
  medium: {
    variant: 'medium', cols: 3, rows: 7, label: '100 x 38 mm', perSheet: 21,
    width: '100mm', height: '38mm',
    nameSize: 12, priceSize: 31, barcodeHeight: 30, barcodeWidth: 2.1, barcodeFontSize: 9, dateSize: 7,
  },
  large: {
    variant: 'large', cols: 3, rows: 5, label: '100 x 50 mm', perSheet: 15,
    width: '100mm', height: '50mm',
    nameSize: 14, priceSize: 38, barcodeHeight: 40, barcodeWidth: 2.3, barcodeFontSize: 10, dateSize: 8,
  },
};

function formatDateTR(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export default function BarcodePage() {
  const { products, loading } = useProducts();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [layout, setLayout] = useState<LayoutType>('medium');
  const [showScanner, setShowScanner] = useState(false);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search))
  );

  const totalLabels = selected.reduce((sum, s) => sum + s.copies, 0);
  const sheetsNeeded = Math.ceil(totalLabels / LAYOUTS[layout].perSheet);

  function addProduct(product: Product) {
    setSelected((prev) => {
      const existing = prev.find((s) => s.product.id === product.id);
      if (existing) {
        return prev.map((s) =>
          s.product.id === product.id ? { ...s, copies: s.copies + 1 } : s
        );
      }
      return [...prev, { product, copies: 1 }];
    });
  }

  function updateCopies(productId: string, delta: number) {
    setSelected((prev) =>
      prev.map((s) => (s.product.id === productId ? { ...s, copies: Math.max(1, s.copies + delta) } : s))
    );
  }

  function setCopies(productId: string, val: number) {
    setSelected((prev) =>
      prev.map((s) => (s.product.id === productId ? { ...s, copies: Math.max(1, val) } : s))
    );
  }

  function removeProduct(productId: string) {
    setSelected((prev) => prev.filter((s) => s.product.id !== productId));
  }

  function clearAll() {
    setSelected([]);
  }

  function handleBarcodeValue(code: string) {
    const normalized = code.trim();
    if (!normalized) return;

    const product = products.find((p) => p.barcode?.trim() === normalized);
    if (!product) {
      setSearch(normalized);
      return;
    }

    // Barkod okutulduğu anda ürünü doğrudan sağdaki "Seçilen Ürünler" listesine ekle.
    addProduct(product);
    setSearch('');
    setShowScanner(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    handleBarcodeValue(search);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Etiket & Barkod Yazdırma (A4)</h1>
            <p className="text-sm text-slate-500">Market stili etiket: büyük fiyat, barkod, ürün adı ve tarih</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">Etiket:</span>
              <span className="text-sm font-bold text-teal-700">{totalLabels} adet</span>
              {totalLabels > 0 && (
                <span className="text-xs text-slate-400">({sheetsNeeded} sayfa)</span>
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex gap-2">
                <button onClick={clearAll} className="btn-secondary px-4 py-2">Temizle</button>
                <button onClick={() => window.print()} className="btn-primary px-4 py-2">
                  <Printer size={18} />
                  Yazdır / PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Etiket Düzeni:</span>
          {(Object.keys(LAYOUTS) as LayoutType[]).map((key) => (
            <button
              key={key}
              onClick={() => setLayout(key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                layout === key
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {LAYOUTS[key].label}
            </button>
          ))}
          <span className="ml-2 text-xs text-slate-400">
            {LAYOUTS[layout].cols} sütun x {LAYOUTS[layout].rows} satır
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Product Selection */}
        <div className="flex w-1/2 flex-col overflow-hidden border-r border-slate-200">
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className="input pl-10"
                  placeholder="Ürün ara veya barkod okut..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
                title="Kamerayla barkod okut"
              >
                <Camera size={20} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Barkodu okutunca ürün otomatik olarak <span className="font-medium text-teal-600">Seçilen Ürünler</span> listesine eklenir.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                <BarcodeIcon size={40} />
                <p className="text-sm">Ürün bulunamadı</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={!product.barcode}
                    className="card flex w-full items-center gap-3 p-3 text-left transition-all hover:border-teal-400 hover:shadow-md active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                      <BarcodeIcon className="text-slate-500" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-slate-800">{product.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{product.barcode || 'Barkod yok'}</p>
                    </div>
                    <p className="font-bold text-teal-700">{formatCurrency(product.price)}</p>
                    <Plus size={18} className="text-teal-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Products + Preview */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">
              Seçilen Ürünler ({selected.length})
            </p>
            {totalLabels > 0 && (
              <p className="text-sm font-bold text-teal-700">
                Toplam {totalLabels} etiket
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selected.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                <BarcodeIcon size={48} />
                <p className="text-sm">Yazdırmak için ürün seçin</p>
                <p className="text-xs">Soldan ürün ekleyin</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {selected.map((item) => (
                    <div key={item.product.id} className="card flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-slate-800">{item.product.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{item.product.barcode}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateCopies(item.product.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">-</button>
                        <input
                          type="number"
                          className="w-14 rounded-md border border-slate-300 px-2 py-1 text-center text-sm"
                          value={item.copies}
                          onChange={(e) => setCopies(item.product.id, parseInt(e.target.value) || 1)}
                        />
                        <button onClick={() => updateCopies(item.product.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">+</button>
                      </div>
                      <span className="text-xs text-slate-400 w-12 text-right">adet</span>
                      <button onClick={() => removeProduct(item.product.id)} className="text-slate-300 hover:text-red-500">
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Live Preview */}
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-slate-500">Önizleme:</p>
                  <div className="flex justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4">
                    <PreviewLabel product={selected[0].product} config={LAYOUTS[layout]} />
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-teal-50 border border-teal-200 p-3">
                  <p className="text-sm text-teal-800">
                    <span className="font-bold">{totalLabels}</span> etiket yazdırılacak.
                    Her sayfada {LAYOUTS[layout].perSheet} etiket.
                    {sheetsNeeded > 1 && ` Toplam ${sheetsNeeded} sayfa.`}
                  </p>
                  <p className="mt-1 text-xs text-teal-600">
                    "Yazdır / PDF" butonuna bastığınızda tarayıcının yazdırma penceresi açılır.
                    Hedef olarak "PDF olarak kaydet" seçip bilgisayara indirebilir veya doğrudan yazıcıya gönderebilirsiniz.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeValue}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Print Area (hidden on screen) */}
      <div id="print-area" className="hidden">
        <PrintLayout selected={selected} layout={layout} />
      </div>
    </div>
  );
}

function PrintLayout({ selected, layout }: { selected: SelectedProduct[]; layout: LayoutType }) {
  const config = LAYOUTS[layout];
  const allBarcodes: { product: Product; key: string }[] = [];
  selected.forEach((item) => {
    for (let i = 0; i < item.copies; i++) {
      allBarcodes.push({ product: item.product, key: `${item.product.id}-${i}` });
    }
  });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
        gap: '3mm',
        padding: '0',
      }}
    >
      {allBarcodes.map((item) => (
        <BarcodeLabel key={item.key} product={item.product} config={config} />
      ))}
    </div>
  );
}

function LabelInfo({ product, config, svgRef, scale = 1 }: { product: Product; config: LayoutConfig; svgRef: React.RefObject<SVGSVGElement>; scale?: number }) {
  const scaled = (value: number): number => value * scale;
  const isLarge = config.variant === 'large';

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: `${scaled(2)}px` }}>
      <div style={{ fontSize: `${scaled(config.nameSize)}px`, fontWeight: 800, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
      <div style={{ fontSize: `${scaled(config.nameSize - 1)}px`, lineHeight: 1.05 }}>KDV DAHİL SATIŞ FİYATI</div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: isLarge ? 'column' : 'row', alignItems: isLarge ? 'stretch' : 'center', justifyContent: isLarge ? 'flex-start' : 'space-between', gap: `${scaled(3)}px` }}>
        <div style={{ fontSize: `${scaled(config.priceSize)}px`, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>{formatCurrency(product.price)}</div>
        <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%', width: isLarge ? '100%' : '46%', height: `${scaled(config.barcodeHeight)}px` }}></svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: isLarge ? '1px solid #444' : 'none', paddingTop: isLarge ? `${scaled(1)}px` : 0, fontSize: `${scaled(config.dateSize)}px`, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {!isLarge && config.variant === 'small' ? <span /> : <span>FİYAT DEĞİŞİKLİK TARİHİ: {formatDateTR()}</span>}
        {config.variant !== 'small' && <span>BİRİM FİYATI: {formatCurrency(product.price)}</span>}
      </div>
    </div>
  );
}

function BarcodeLabel({ product, config }: { product: Product; config: LayoutConfig }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: 'CODE128',
          width: config.barcodeWidth,
          height: config.barcodeHeight,
          displayValue: true,
          fontSize: config.barcodeFontSize,
          margin: 0,
          textMargin: 1,
        });
      } catch (err) {
        console.error('Barkod oluşturulamadı:', err);
      }
    }
  }, [product.barcode, config]);

  return (
    <div style={{ border: '1px solid #222', borderRadius: '2px', padding: '2mm 2.5mm 1.5mm', width: config.width, height: config.height, display: 'flex', pageBreakInside: 'avoid', overflow: 'hidden', boxSizing: 'border-box', background: '#fff', color: '#111' }}>
      <LabelInfo product={product} config={config} svgRef={svgRef} />
    </div>
  );
}

function PreviewLabel({ product, config }: { product: Product; config: LayoutConfig }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: 'CODE128',
          width: config.barcodeWidth,
          height: config.barcodeHeight,
          displayValue: true,
          fontSize: config.barcodeFontSize,
          margin: 0,
          textMargin: 1,
        });
      } catch {
        // ignore in preview
      }
    }
  }, [product.barcode, config]);

  const scale = 1.5;

  return (
    <div style={{ border: '1px solid #222', borderRadius: '2px', padding: `${2 * scale}px ${2.5 * scale}px ${1.5 * scale}px`, width: `calc(${config.width} * ${scale})`, height: `calc(${config.height} * ${scale})`, display: 'flex', overflow: 'hidden', boxSizing: 'border-box', background: '#fff', color: '#111' }}>
      <LabelInfo product={product} config={config} svgRef={svgRef} scale={scale} />
    </div>
  );
}
