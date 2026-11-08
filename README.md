# Jackpot Casino MVP

Türkçe casino iskeleti: PAM (hesap), cüzdan, manuel kasa, admin panelinden iframe oyun ekleme.

## Çalıştırma (local)

```bash
cd server
cp .env.example .env
npm install
npm run db:setup
npm start
```

Tarayıcı: http://localhost:3000

## Slotopol motor (ek slotlar)

`server-main` = [Slotopol](https://github.com/slotopol/server) kaynakları. Çalıştırmak için:

```bat
tools\start-slotopol.cmd
```

Jackpot API (`:3000`) spin’leri Slotopol’e (`:8080`) iletir; bakiye Jackpot cüzdanından düşülür/eklenir. Lobide: Joker Dolphin, Book of Ra, Book of Ra Deluxe, Tiki Wonders, Sun City.

## Canlıya alma (Render)

Netlify / sadece-static hosting **çalışmaz**. Node sunucu gerekir.

1. Projeyi GitHub’a push et
2. [Render](https://dashboard.render.com) → **New** → **Blueprint** → bu repo’yu seç (`render.yaml` otomatik okunur)
3. Environment’ta `ADMIN_EMAIL` ve `ADMIN_PASSWORD` gir (güçlü şifre)
4. Deploy bitince URL: `https://jackpot-xxxx.onrender.com`
5. Admin: `https://.../admin/`

SQLite verisi **Disk** (`/var/data`) üzerinde tutulur. Disk yoksa her restart’ta veritabanı sıfırlanır.

Elle Web Service kuracaksan:

| Ayar | Değer |
|------|--------|
| Root Directory | `server` |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `npm run start:prod` |
| `DATABASE_URL` | `file:/var/data/jackpot.db` |
| Disk mount | `/var/data` |

## Canlıya alma (VPS)

```bash
git clone <repo-url> && cd jackpot/server
cp .env.example .env   # JWT_SECRET ve admin şifresini değiştir
npm install
npm run start:prod
```

Önerilen: Nginx reverse proxy + HTTPS (Let’s Encrypt) + `pm2 start npm --name jackpot -- run start:prod`

## Varsayılan admin

- E-posta: `admin@jackpot.local` (veya `.env` / Render’daki `ADMIN_EMAIL`)
- Şifre: `Admin123!` (canlıda mutlaka değiştir)
- Panel: http://localhost:3000/admin/

## Akış

1. Kullanıcı kayıt olur (`/signup.html`) — TC, adres, il/ilçe
2. Kasa’dan yatırım talebi açar (Papara/Havale/USDT/BTC/Skrill)
3. Admin paneli → Kasa Kuyruğu → Onayla (düşük riskli küçük çekimler otomatik)
4. KYC belge yükleme (`/kyc.html`) → Admin KYC onayı
5. Admin → Oyunlar’dan sağlayıcı linki ekler / kategoriler
6. Kullanıcı Oyunlar’dan filtreleyip oyunu açar (iframe)

## Admin modülleri

Dashboard (GGR/NGR), Oyuncu 360°, KYC, Kasa kuyruğu, Risk/Fraud, Bonus motoru, Affiliate, Canlı destek, Ödeme yöntemleri

Admin: http://localhost:3000/admin/

> Not: Gerçek Curaçao/MGA lisansı, BetConstruct ve Pragmatic Seamless Wallet entegrasyonları için resmi sözleşme + API anahtarları gerekir. Bu MVP’de yapı, kuyruklar ve admin operasyonu hazırdır.
