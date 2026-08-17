import vm from 'vm'
import { Article } from './types'
import { logger } from './utils/logger'

/**
 * Scraper untuk aplikasi short drama yang punya katalog web:
 * - DramaBox  (www.dramabox.com)  -> __NEXT_DATA__ -> pageProps.bookList[]
 * - MoboReels (www.moboreels.com) -> window.__NUXT__ (function call, perlu evaluasi)
 * - ReelShort (www.reelshort.com) -> __NEXT_DATA__ -> pageProps.list[]
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/** Fetch halaman HTML dengan retry sederhana. */
export async function fetchHtml(url: string): Promise<string> {
  const axios = (await import('axios')).default
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        timeout: 20000,
      })
      return data
    } catch (err: any) {
      if (attempt < 3 && (err.response?.status === 403 || err.response?.status === 429)) {
        logger.warn(`[short-drama] attempt ${attempt} failed (${err.response?.status}), retrying...`)
        await new Promise(r => setTimeout(r, attempt * 2000))
        continue
      }
      throw err
    }
  }
  throw new Error(`Failed to fetch ${url}`)
}

/** Ekstrak & parse __NEXT_DATA__ (toleran terhadap atribut type yang berbeda). */
function extractNextData(html: string): any {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('__NEXT_DATA__ not found')
  return JSON.parse(match[1])
}

/** Ekstrak & evaluasi window.__NUXT__ (Nuxt SSR: fungsi yang dipanggil dengan argumen). */
function extractNuxtData(html: string): any {
  const match = html.match(/window\.__NUXT__=([\s\S]*?)<\/script>/)
  if (!match) throw new Error('__NUXT__ not found')
  const expr = match[1].replace(/;\s*$/, '')
  const sandbox: Record<string, any> = {
    window: {},
    document: { cookie: '', createElement: () => ({}), getElementById: () => null },
    console: { log: () => {}, warn: () => {}, error: () => {} },
  }
  vm.createContext(sandbox)
  const result = vm.runInContext(`(${expr})`, sandbox, { timeout: 10000 })
  return result
}

/** Buat slug URL dari judul (mis. "Came Back Hotter With Lord's Twins" -> "came-back-hotter-with-lords-twins"). */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** ----- DramaBox ----- */
export async function scrapeDramaBox(url: string): Promise<Article[]> {
  const html = await fetchHtml(url)
  const data = extractNextData(html)
  const pp = data.props?.pageProps || {}
  const bookList: any[] = pp.bookList || []

  const articles: Article[] = []
  for (const item of bookList) {
    const title = item.bookName || ''
    if (!title) continue

    const cover = (item.cover || '').replace(/@w=\d+&h=\d+/, '@w=800&h=1200')
    if (!cover) continue

    const bookId = item.bookId
    const bookNameEn = item.bookNameEn || slugify(title)
    const link = bookId ? `https://www.dramabox.com/drama/${bookId}/${bookNameEn}` : url

    const tags: string[] = item.typeTwoNames?.length ? item.typeTwoNames : (item.tags || [])
    const category = tags[0] || 'Drama'

    const chapterCount = item.chapterCount ? `${item.chapterCount} episode` : ''
    const rating = item.ratings ? String(item.ratings) : ''
    const metaParts = [chapterCount, ...tags].filter(Boolean)

    articles.push({
      title,
      imageUrl: cover,
      link,
      category,
      rating,
      ranking: '',
      metadata: metaParts.join(', '),
      date: '',
    })
  }

  logger.info(`Scraped ${articles.length} items from DramaBox`)
  return articles
}

/** ----- MoboReels ----- */
export async function scrapeMoboReels(url: string): Promise<Article[]> {
  const html = await fetchHtml(url)
  const data = extractNuxtData(html)
  const list: any[] = data?.data?.[0]?.list || []

  const articles: Article[] = []
  for (const item of list) {
    const title = item.seriesName || ''
    if (!title) continue

    const coverUrl = item.coverUrl || ''
    if (!coverUrl) continue

    const seriesId = item.seriesId
    const slug = slugify(title)
    const link = seriesId ? `https://www.moboreels.com/drama/${slug}-${seriesId}` : url

    const types: string[] = item.types || []
    const category = types[0] || 'Drama'
    const heat = item.heat ? String(item.heat) : ''
    const summary = (item.summary || '').slice(0, 120)

    articles.push({
      title,
      imageUrl: coverUrl,
      link,
      category,
      rating: '',
      ranking: heat ? `heat ${heat}` : '',
      metadata: [...types, summary].filter(Boolean).join(', '),
      date: '',
    })
  }

  logger.info(`Scraped ${articles.length} items from MoboReels`)
  return articles
}

/** ----- ReelShort ----- */
export async function scrapeReelShort(url: string): Promise<Article[]> {
  const html = await fetchHtml(url)
  const data = extractNextData(html)
  const list: any[] = data.props?.pageProps?.list || []

  const articles: Article[] = []
  for (const item of list) {
    const title = item.book_title || ''
    if (!title) continue

    const bookPic = item.book_pic || item.default_pic || ''
    if (!bookPic) continue

    const bookId = item.book_id
    const slug = slugify(title)
    const link = bookId ? `https://www.reelshort.com/movie/${slug}-${bookId}` : url

    const themes: string[] = item.theme || []
    const category = themes[0] || 'Short Drama'
    const chapterCount = item.chapter_count ? `${item.chapter_count} episode` : ''
    const specialDesc = (item.special_desc || '').slice(0, 120)

    articles.push({
      title,
      imageUrl: bookPic,
      link,
      category,
      rating: '',
      ranking: '',
      metadata: [chapterCount, ...themes, specialDesc].filter(Boolean).join(', '),
      date: '',
    })
  }

  logger.info(`Scraped ${articles.length} items from ReelShort`)
  return articles
}