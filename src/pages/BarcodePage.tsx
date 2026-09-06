import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Printer, X, Plus, Barcode as BarcodeIcon, Camera, Tag, Percent } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { useProducts } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/lib/supabase';
import BarcodeScanner from '@/components/BarcodeScanner';

type LayoutType = 'economic' | 'compact' | 'standard' | 'large';

type LayoutConfig = {
  label: string;
  perSheet: number;
  width: string;
  height: string;
  cols: number;
  rows: number;
  nameSize: number;
  priceSize: number;
  barcodeHeight: number;
  barcodeWidth: number;
  barcodeFontSize: number;
  dateSize: number;
};

type SelectedProduct = {
  product: Product;
  copies: number;
  discountEnabled: boolean;
  oldPrice: number;
  newPrice: number;
};

const LAYOUTS: Record<LayoutType, LayoutConfig> = {
  economic: {
    label: 'Ekonomik · 3 sütun × 9 satır', perSheet: 27, width: '63.3mm', height: '30mm', cols: 3, rows: 9,
    nameSize: 7.5, priceSize: 19, barcodeHeight: 15, barcodeWidth: 1.05, barcodeFontSize: 6.2, dateSize: 5.2,
  },
  compact: {
    label: '80 × 30 mm', perSheet: 18, width: '80mm', height: '30mm', cols: 2, rows: 9,
    nameSize: 9.5, priceSize: 24, barcodeHeight: 20, barcodeWidth: 1.45, barcodeFontSize: 7.5, dateSize: 6.5,
  },
  standard: {
    label: '100 × 38 mm', perSheet: 14, width: '100mm', height: '38mm', cols: 2, rows: 7,
    nameSize: 11, priceSize: 29, barcodeHeight: 23, barcodeWidth: 1.75, barcodeFontSize: 8, dateSize: 6.8,
  },
  large: {
    label: '100 × 50 mm', perSheet: 10, width: '100mm', height: '50mm', cols: 2, rows: 5,
    nameSize: 12.5, priceSize: 37, barcodeHeight: 29, barcodeWidth: 2, barcodeFontSize: 9, dateSize: 7,
  },
};

function todayTR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function discountPercent(oldPrice: number, newPrice: number) {
  if (oldPrice <= 0 || newPrice >= oldPrice) return 0;
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

export default function BarcodePage() {
  const { products, loading } = useProducts();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [layout, setLayout] = useState<LayoutType>('economic');
  const [showScanner, setShowScanner] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q));
  }, [products, search]);

  const totalLabels = selected.reduce((sum, item) => sum + item.copies, 0);
  const sheetsNeeded = Math.ceil(totalLabels / LAYOUTS[layout].perSheet);
  const discountedCount = selected.filter((item) => item.discountEnabled).length;

  function addProduct(product: Product) {
    if (!product.barcode) return;
    setSelected((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) => item.product.id === product.id ? { ...item, copies: item.copies + 1 } : item);
      }
      return [...prev, {
        product,
        copies: 1,
        discountEnabled: false,
        oldPrice: Number(product.price),
        newPrice: Number(product.price),
      }];
    });
  }

  function updateItem(id: string, patch: Partial<Omit<SelectedProduct, 'product'>>) {
    setSelected((prev) => prev.map((item) => item.product.id === id ? { ...item, ...patch } : item));
  }

  function handleBarcodeDetected(code: string) {
    const normalized = code.trim();
    const match = products.find((p) => (p.barcode || '').trim() === normalized);
    if (match) {
      addProduct(match);
      setSearch('');
      setShowScanner(false);
    } else {
      setSearch(normalized);
    }
  }

  function updateCopies(id: string, delta: number) {
    setSelected((prev) => prev.map((item) => item.product.id === id
      ? { ...item, copies: Math.max(1, item.copies + delta) }
      : item));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Barkod & İndirim Etiketi</h1>
            <p className="text-sm text-slate-500">A4 sarı kağıda siyah-beyaz basılacak market tipi etiket tasarımı</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
              {totalLabels} etiket · {sheetsNeeded || 0} sayfa
            </div>
            {discountedCount > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {discountedCount} indirimli ürün
              </div>
            )}
            <button onClick={() => setSelected([])} disabled={selected.length === 0} className="btn-secondary px-3 py-2">
              Temizle
            </button>
            <button onClick={() => window.print()} disabled={selected.length === 0} className="btn-primary px-4 py-2">
              <Printer size={17} />
              A4 Yazdır
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Etiket ölçüsü:</span>
          {(Object.keys(LAYOUTS) as LayoutType[]).map((key) => (
            <button
              key={key}
              onClick={() => setLayout(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${layout === key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {LAYOUTS[key].label}
            </button>
          ))}
          <span className="ml-1 text-xs text-slate-400">{LAYOUTS[layout].cols} sütun × {LAYOUTS[layout].rows} satır · A4</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex w-1/2 min-w-0 flex-col overflow-hidden border-r border-slate-200">
          <div className="border-b border-slate-200 bg-white p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="input pl-10 pr-12"
                placeholder="Ürün ara veya barkod okut..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && search.trim()) {
                    const match = products.find((p) => (p.barcode || '').trim() === search.trim());
                    if (match) { addProduct(match); setSearch(''); }
                  }
                }}
              />
              <button onClick={() => setShowScanner(true)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-teal-600 hover:bg-teal-50" title="Barkod okut">
                <Camera size={19} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? <div className="py-12 text-center text-slate-400">Ürünler yükleniyor...</div> : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400"><BarcodeIcon size={42} /><p>Ürün bulunamadı</p></div>
            ) : (
              <div className="space-y-2">
                {filtered.map((product) => (
                  <button key={product.id} onClick={() => addProduct(product)} disabled={!product.barcode} className="card flex w-full items-center gap-3 p-3 text-left hover:border-teal-400 hover:shadow-md disabled:opacity-40">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100"><BarcodeIcon size={19} className="text-slate-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">{product.name}</p>
                      <p className="font-mono text-xs text-slate-400">{product.barcode || 'Barkod yok'}</p>
                    </div>
                    <span className="font-bold text-teal-700">{formatCurrency(product.price)}</span>
                    <Plus size={18} className="text-teal-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-1/2 min-w-0 flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Etiket ayarları</p>
            <p className="text-xs text-slate-500">İndirim kutusunu açıp eski ve yeni fiyatı girin. Ürün satış fiyatı değiştirilmez; sadece basılan etikete uygulanır.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selected.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                <Tag size={46} /><p className="text-sm">Soldan ürün seçerek etiket hazırlayın</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {selected.map((item) => {
                    const percent = discountPercent(item.oldPrice, item.newPrice);
                    const validDiscount = item.discountEnabled && item.oldPrice > item.newPrice && item.newPrice >= 0;
                    return (
                      <div key={item.product.id} className={`rounded-xl border p-3 ${validDiscount ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{item.product.name}</p>
                            <p className="font-mono text-xs text-slate-400">{item.product.barcode}</p>
                          </div>
                          <button onClick={() => setSelected((prev) => prev.filter((x) => x.product.id !== item.product.id))} className="text-slate-300 hover:text-red-500"><X size={18} /></button>
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={item.discountEnabled} onChange={(e) => updateItem(item.product.id, { discountEnabled: e.target.checked })} />
                            <Percent size={16} /> İndirim etiketi
                          </label>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateCopies(item.product.id, -1)} className="h-8 w-8 rounded-md bg-slate-100">−</button>
                            <input className="h-8 w-14 rounded-md border border-slate-300 text-center text-sm" value={item.copies} onChange={(e) => updateItem(item.product.id, { copies: Math.max(1, Number(e.target.value) || 1) })} />
                            <button onClick={() => updateCopies(item.product.id, 1)} className="h-8 w-8 rounded-md bg-slate-100">+</button>
                          </div>
                        </div>
                        {item.discountEnabled && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div><label className="label text-xs">Eski fiyat</label><input type="number" min="0" step="0.01" className="input" value={item.oldPrice} onChange={(e) => updateItem(item.product.id, { oldPrice: Math.max(0, Number(e.target.value) || 0) })} /></div>
                            <div><label className="label text-xs">Yeni indirimli fiyat</label><input type="number" min="0" step="0.01" className="input font-bold" value={item.newPrice} onChange={(e) => updateItem(item.product.id, { newPrice: Math.max(0, Number(e.target.value) || 0) })} /></div>
                            <div className="col-span-2 text-right text-xs font-bold text-amber-700">{validDiscount ? `%${percent} indirim · ${formatCurrency(item.oldPrice - item.newPrice)} avantaj` : 'Eski fiyat yeni fiyattan büyük olmalı.'}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-600">Canlı önizleme</span><span className="text-xs text-slate-400">Sarı kağıtta beyaz alan basılmaz, kağıt rengi görünür.</span></div>
                  <div className="flex justify-center overflow-auto rounded-lg border-2 border-dashed border-slate-200 p-4">
                    <PreviewLabel item={selected[0]} config={LAYOUTS[layout]} />
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                  <b>{totalLabels}</b> etiket · <b>{sheetsNeeded}</b> A4 sayfa. İndirimli etikette eski fiyat üstü çizilir, yeni fiyat büyük yazılır ve indirim yüzdesi gösterilir.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div id="print-area" className="hidden">
        <PrintLayout selected={selected} config={LAYOUTS[layout]} />
      </div>

      {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

function PrintLayout({ selected, config }: { selected: SelectedProduct[]; config: LayoutConfig }) {
  const labels: SelectedProduct[] = [];
  selected.forEach((item) => {
    for (let i = 0; i < item.copies; i += 1) labels.push(item);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.cols}, ${config.width})`, gridAutoRows: config.height, columnGap: config.cols === 3 ? '1.8mm' : '0.8mm', rowGap: '0.8mm', width: config.cols === 3 ? '194.7mm' : '200.8mm' }}>
      {labels.map((item, index) => <BarcodeLabel key={`${item.product.id}-${index}`} item={item} config={config} />)}
    </div>
  );
}

function LabelContent({ item, config, svgRef, scale = 1 }: { item: SelectedProduct; config: LayoutConfig; svgRef: React.RefObject<SVGSVGElement>; scale?: number }) {
  const percent = discountPercent(item.oldPrice, item.newPrice);
  const discounted = item.discountEnabled && item.oldPrice > item.newPrice && item.newPrice >= 0;
  const price = discounted ? item.newPrice : item.product.price;
  const s = (v: number) => v * scale;

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', color: '#111', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ fontSize: s(config.nameSize), fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</div>
      <div style={{ marginTop: s(1), fontSize: s(6.5), fontWeight: 700, letterSpacing: '0.05em' }}>KDV DAHİL SATIŞ FİYATI</div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'space-between', gap: s(2) }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: s(2) }}>
          {discounted && (
            <div style={{ textAlign: 'center', minWidth: s(31) }}>
              <div style={{ fontSize: s(7), fontWeight: 900, lineHeight: 1 }}>ÖNCE</div>
              <div style={{ position: 'relative', display: 'inline-block', fontSize: s(config.priceSize * 0.55), fontWeight: 900, lineHeight: 0.95 }}>
                {formatCurrency(item.oldPrice)}
                <span style={{ position: 'absolute', left: '-4%', right: '-4%', top: '48%', borderTop: `${Math.max(1, s(1.1))}px solid #111`, transform: 'rotate(-8deg)' }} />
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            {discounted && <div style={{ fontSize: s(7), fontWeight: 900, lineHeight: 1 }}>{`%${percent} İNDİRİM`}</div>}
            <div style={{ fontSize: s(config.priceSize), fontWeight: 900, letterSpacing: '-0.6px', lineHeight: 0.9, whiteSpace: 'nowrap' }}>{formatCurrency(price)}</div>
          </div>
        </div>

        <svg ref={svgRef} style={{ width: discounted ? '43%' : '48%', height: s(config.barcodeHeight), display: 'block' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: s(2), borderTop: `${Math.max(0.6, s(0.45))}px solid #111`, paddingTop: s(1), fontSize: s(config.dateSize), fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
        <span>FİYAT DEĞİŞİKLİK TARİHİ: {todayTR()}</span>
        <span>{discounted ? `YENİ FİYAT: ${formatCurrency(price)}` : `BİRİM FİYATI: ${formatCurrency(price)}`}</span>
      </div>
    </div>
  );
}

function BarcodeLabel({ item, config }: { item: SelectedProduct; config: LayoutConfig }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !item.product.barcode) return;
    try {
      JsBarcode(ref.current, item.product.barcode, {
        format: 'CODE128', width: config.barcodeWidth, height: config.barcodeHeight, displayValue: true,
        fontSize: config.barcodeFontSize, margin: 0, textMargin: 1,
      });
    } catch (error) {
      console.error('Barkod oluşturulamadı:', error);
    }
  }, [item.product.barcode, config]);

  return (
    <div style={{ width: config.width, height: config.height, boxSizing: 'border-box', padding: '2mm 2.5mm 1.3mm', border: '1px solid #111', overflow: 'hidden', pageBreakInside: 'avoid', breakInside: 'avoid', background: 'transparent' }}>
      <LabelContent item={item} config={config} svgRef={ref} />
    </div>
  );
}

function PreviewLabel({ item, config }: { item: SelectedProduct; config: LayoutConfig }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !item.product.barcode) return;
    try {
      JsBarcode(ref.current, item.product.barcode, { format: 'CODE128', width: config.barcodeWidth, height: config.barcodeHeight, displayValue: true, fontSize: config.barcodeFontSize, margin: 0, textMargin: 1 });
    } catch {
      // Preview can fail gracefully.
    }
  }, [item.product.barcode, config]);

  return (
    <div style={{ width: `calc(${config.width} * 1.55)`, height: `calc(${config.height} * 1.55)`, boxSizing: 'border-box', padding: '3mm 3.8mm 2mm', border: '1px solid #111', background: 'transparent', overflow: 'hidden' }}>
      <LabelContent item={item} config={config} svgRef={ref} scale={1.55} />
    </div>
  );
}
