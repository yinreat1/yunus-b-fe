# ProPOS final production checklist

## Included
- İlk açılışta sistem ana şifresi (PBKDF2 + SHA-256, cihaz bazlı)
- Personel PIN hash altyapısı (Supabase pgcrypto RPC)
- Atomik satış RPC: satış + kalem + ödeme + stok + cari tek transaction içinde
- Offline client_ref ile idempotent senkronizasyon
- Ürün/personel/satış silme ve geri yükleme altyapıları
- WhatsApp cari özeti
- A4 ekonomik barkod 3x9
- Rapor, kasa, mobil/PWA, yedekleme

## Supabase
1. Migration'ları tarih sırasıyla çalıştırın.
2. Supabase Auth + RLS'yi işletme bazlı kurmadan çok kiracılı ticari kullanım iddiasında bulunmayın.
3. `20260906170000_propos_atomic_security.sql` migration'ı özellikle çalıştırılmalıdır.

## Build
- Node 24+ kullanın.
- `npm ci`
- `npm run build`
