# ProPOS — GitHub / Vercel Yayınlama

## 1) GitHub
Bu klasörün içeriğini GitHub repository'sine yükleyin. `node_modules` yüklemeyin.

## 2) Supabase
`supabase/migrations/` altındaki migration dosyalarını sırasıyla Supabase SQL Editor / CLI ile uygulayın.

## 3) Vercel Environment Variables
Vercel > Project > Settings > Environment Variables bölümüne:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ekleyin.

## 4) Build
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`

## 5) SPA
`vercel.json` içindeki rewrite ile uygulama route'ları `/` üzerinden açılır.

## 6) Yayına almadan önce
Gerçek mağaza cihazında şu akışı test edin: ürün ekleme > barkod > satış > karma ödeme > veresiye > ödeme > kısmi iade > rapor > offline satış > online senkronizasyon > barkod/A4 baskı > personel yetkisi.
