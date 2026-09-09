# ProPOS Production 1.0

## Deployment
Use Node 24+.

```bash
npm ci
npm run typecheck
npm run build
```

Vercel environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase
Apply the migrations in `supabase/migrations` in order. The production Supabase project used during hardening is configured with the production-hardened schema.

## Backup
Settings → Yedekleme ve Geri Yükleme.

- Sadece eksikleri ekle: safe import, leaves existing rows unchanged.
- Birleştir / güncelle: upsert by id.
- Tam geri yükle: explicit confirmation, clears current business records first.

## Important
The current build is designed for the current single-business FERHAT BÜFE deployment. The `business_id` foundation and scoped policies are in place, but a future multi-business SaaS release should bind `business_members` to Supabase Auth users before enabling multiple businesses in one database.
