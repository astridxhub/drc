# FB Dracin

Otomatis posting drama China/Korea populer dari MyDramaList ke Facebook dengan AI-generated sinopsis + edited poster.

## Cara Kerja

1. **Scrape** drama populer dari `https://mydramalist.com/shows/popular`
2. **Generate caption** via OpenRouter AI (sinopsis Bahasa Indonesia)
3. **Edit poster** (composite dengan overlay Satori style ungu)
4. **Post** ke Facebook Page MovieFeed

## Setup

```bash
npm install
cp .env.example .env
# isi .env dengan credentials
npm run build
npm start
```

## GitHub Actions

Posting otomatis 6x sehari: 09:00, 10:00, 13:00, 15:00, 19:00, 21:00 WIB.

### Secrets yang diperlukan:
- `OPENROUTER_API_KEY`
- `AI_MODEL`
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_ACCESS_TOKEN`
- `NEWS_SOURCE_URL`
- `IMAGE_STYLE`

## Konfigurasi

Lihat `.env.example` untuk semua opsi.
