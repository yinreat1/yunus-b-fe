# İade sistemi

Bu sürüm iade işlemi için yeni Supabase RPC veya yeni refund kolonlarına bağlı değildir.

Mevcut `sales.deleted_reason` alanını iade işareti olarak kullanır. Çöp kutusu migration'ı zaten mevcutsa ayrıca SQL çalıştırmanız gerekmez.

İade: stok geri gelir, veresiye müşteri bakiyesi düşer, satış aktif raporlardan çıkar ve aynı satış ikinci kez iade edilemez.
