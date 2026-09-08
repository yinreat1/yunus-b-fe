# Personel & Yetki

Personel yetkileri uygulama arayüzünde aktif edilmiştir. İlk aktif personel oluşturulduktan sonra uygulama personel seçimi + PIN (atanmışsa) ile giriş ister.

## Roller
- Admin: tüm menüler.
- Müdür: Dashboard, Satış, Ürünler, Kategoriler, Barkod Yazdır, Raporlar, Müşteriler & Cari, Kasa & Gün Sonu. Personel ve Ayarlar kapalı.
- Kasiyer: Satış ve Müşteriler & Cari.

## Oturum
Aktif personel oturumu `localStorage` içinde tutulur. Sol menüden Personel Değiştir / Çıkış ile oturum kapatılabilir.

## Önemli
Bu istemci tarafı yetkilendirmedir. Gerçek ticari dağıtımda Supabase Auth + işletme bazlı RLS ile sunucu tarafı yetkilendirme de uygulanmalıdır.
