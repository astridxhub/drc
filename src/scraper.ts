import axios from 'axios'
import * as cheerio from 'cheerio'
import { Article } from './types'
import { logger } from './utils/logger'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
]

async function fetchWithRetry(url: string, attempt: number = 1): Promise<string> {
  const ua = USER_AGENTS[(attempt - 1) % USER_AGENTS.length]
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000,
    })
    return html
  } catch (err: any) {
    if (attempt < 3 && (err.response?.status === 403 || err.response?.status === 429)) {
      const delay = attempt * 2000
      logger.warn(`Attempt ${attempt} failed (${err.response?.status}), retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
      return fetchWithRetry(url, attempt + 1)
    }
    throw err
  }
}

function parseMetadata(text: string): { country: string; year: string; episodes: string } {
  const country = text.replace(/\s*Drama\s*-\s*.*/, '').replace(/\s*Movie\s*-\s*.*/, '').trim()
  const yearMatch = text.match(/(\d{4})/)
  const year = yearMatch ? yearMatch[1] : ''
  const epMatch = text.match(/(\d+)\s*episodes/)
  const episodes = epMatch ? `${epMatch[1]} episodes` : ''
  return { country, year, episodes }
}

async function scrapeMyDramaList($: cheerio.CheerioAPI): Promise<Article[]> {
  const articles: Article[] = []
  const seenTitles = new Set<string>()

  $('div.box[id^="mdl-"]').each((_, el) => {
    const $el = $(el)

    const title = $el.find('h6.text-primary.title a').first().text().trim()
    if (!title || seenTitles.has(title)) return
    seenTitles.add(title)

    const linkHref = $el.find('h6.text-primary.title a').first().attr('href') || ''
    const link = linkHref.startsWith('http') ? linkHref : `https://mydramalist.com${linkHref}`

    const imgEl = $el.find('img.lazy').first()
    let imageUrl = imgEl.attr('data-src') || imgEl.attr('src') || ''
    imageUrl = imageUrl.replace(/\?v=\d+/, '').replace(/[a-z](\.jpg)$/i, 'f$1')

    if (!imageUrl) return

    const rating = $el.find('span.p-l-xs.score').first().text().trim()
    const ranking = $el.find('div.ranking.pull-right span').first().text().trim()

    const metadataRaw = $el.find('span.text-muted').first().text().trim()
    const { country, year, episodes } = parseMetadata(metadataRaw)

    const descEl = $el.find('div.col-xs-9.row-cell.content p:not(:has(span.rating))').first()
    const description = descEl.text().trim().replace(/\s+/g, ' ').replace(/…$/, '').trim()

    const category = country || 'Korean'

    articles.push({
      title,
      imageUrl,
      link,
      category,
      rating,
      ranking,
      metadata: `${country} Drama - ${year}${episodes ? ', ' + episodes : ''}`,
      date: year,
    })
  })

  return articles
}

function extractNextData(html: string): any {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('__NEXT_DATA__ not found')
  return JSON.parse(match[1])
}

async function scrapeUrl(url: string, label: string): Promise<Article[]> {
  logger.info(`Scraping ${label} from ${url}`)
  const html = await fetchWithRetry(url)
  const $ = cheerio.load(html)
  return scrapeMyDramaList($)
}

async function scrapeIQ(url: string): Promise<Article[]> {
  const html = await fetchWithRetry(url)
  const data = extractNextData(html)
  const items: any[] = data.props?.initialProps?.pageProps?.firstLst || data.initialProps?.pageProps?.firstLst || data.props?.pageProps?.firstLst || []

  return items.map((item: any) => {
    const tags: string[] = item.tag || []
    const cat = tags.filter((t: string) => !/^\d+\+?$/.test(t))[0] || 'Drama'
    const poster = item.poster480 || item.poster260 || item.poster720 || ''
    const imageUrl = poster.startsWith('//') ? `https:${poster}` : poster
    const suffix = item.pcw_album_loc_suffix || ''
    const link = suffix ? `https://www.iq.com/${suffix.startsWith('/') ? suffix.slice(1) : suffix}` : url
    let year = ''
    if (item.publish_date && item.publish_date !== 'Coming soon') {
      year = new Date(parseInt(item.publish_date)).getFullYear().toString()
    }

    return {
      title: item.name || '',
      imageUrl,
      link,
      category: cat,
      rating: '',
      ranking: '',
      metadata: tags.join(', '),
      date: year,
    }
  }).slice(0, 2)
}

async function scrapeWeTV(url: string): Promise<Article[]> {
  const html = await fetchWithRetry(url)
  const data = extractNextData(html)
  const modules: any[] = data.props?.pageProps?.data?.modules || data.props?.pageProps?.pageData?.modules || []

  // Cari module "Lagi Viral!" dan module untuk "Terbaru"
  const viralModule = modules.find((m: any) => {
    const n = (m.name || '').toLowerCase()
    return n.includes('viral')
  })
  const terbaruModule = modules.find((m: any) => {
    const n = (m.name || '').toLowerCase()
    return n.includes('terbaru') || n.includes('modern') || n.includes('colossal') || n.includes('latest') || n.includes('newest')
  })

  const found = modules.map((m: any) => m.name)
  logger.info(`WeTV modules found: ${found.join(', ')}`)
  logger.info(`WeTV using: viral="${viralModule?.name || 'N/A'}", terbaru="${terbaruModule?.name || 'N/A'}"`)

  const seen = new Set<string>()
  const all: Article[] = []

  const mapItem = (item: any, sourceLabel: string) => {
    if (!item.title || seen.has(item.cid || item.title)) return
    seen.add(item.cid || item.title)

    const tags: string[] = (item.tag_label_list || []).map((t: any) => t.text).filter(Boolean)
    const pic = item.pic || item.img_list?.img_v || item.img_list?.img_web_big || ''
    const link = item.cid ? `https://wetv.vip/id/play/${item.cid}` : url

    all.push({
      title: item.title,
      imageUrl: pic,
      link,
      category: tags[0] || sourceLabel,
      rating: item.film_score && item.film_score !== '0' ? `${item.film_score}/10` : '',
      ranking: '',
      metadata: item.subtitle || tags.join(', '),
      date: '',
    })
  }

  if (viralModule) {
    for (const item of (viralModule.items || [])) mapItem(item, 'Lagi Viral!')
  }
  if (terbaruModule && terbaruModule !== viralModule) {
    for (const item of (terbaruModule.items || [])) mapItem(item, terbaruModule.name)
  }

  const capped = all.slice(0, 2)
  logger.info(`Scraped ${capped.length} items from WeTV (${all.length} total before cap)`)
  return capped
}

async function scrapeYouku(url: string): Promise<Article[]> {
  const html = await fetchWithRetry(url)
  const match = html.match(/window\.__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|var |<\/script>)/)
  if (!match) throw new Error('__INITIAL_DATA__ not found in youku.tv')
  let raw = match[1].replace(/\bundefined\b/g, 'null')
  const data = JSON.parse(raw)

  const all: Article[] = []
  const seen = new Set<string>()

  for (const mod of (data.moduleList || [])) {
    const section = mod.mainTitleLinks?.[0]?.title || mod.type || ''
    for (const comp of (mod.components || [])) {
      for (const item of (comp.itemList || [])) {
        const title = item.title || ''
        if (!title || seen.has(title)) continue
        seen.add(title)

        const img = item.img || item.vImg || ''
        const imageUrl = img ? (img.startsWith('//') ? `https:${img}` : img) : ''
        if (!imageUrl) continue

        const linkHref = item.link || item.videoLink || ''
        const link = linkHref.startsWith('http') ? linkHref : linkHref.startsWith('//') ? `https:${linkHref}` : `https:${linkHref}`

        const tags: string[] = item.desc || []

        all.push({
          title,
          imageUrl,
          link,
          category: section,
          rating: '',
          ranking: '',
          metadata: tags.join(', '),
          date: '',
        })
      }
    }
  }

  const capped = all.slice(0, 2)
  logger.info(`Scraped ${capped.length} items from Youku (${all.length} total before cap)`)
  return capped
}

export async function scrapeArticles(sourceUrls: string[]): Promise<Article[]> {
  const all = new Map<string, Article>()

  for (let i = 0; i < sourceUrls.length; i++) {
    const url = sourceUrls[i]
    const label = `source-${i + 1}`
    try {
      let items: Article[]

      if (url.includes('iq.com')) {
        items = await scrapeIQ(url)
      } else if (url.includes('wetv.vip')) {
        items = await scrapeWeTV(url)
      } else if (url.includes('youku.tv')) {
        items = await scrapeYouku(url)
      } else if (url.includes('mydramalist.com')) {
        items = await scrapeUrl(url, label)
      } else {
        items = await scrapeUrl(url, label)
      }

      for (const a of items) if (!all.has(a.link)) all.set(a.link, a)
      logger.info(`Scraped ${items.length} from ${label}: ${url}`)
    } catch (err: any) {
      logger.warn(`Failed to scrape ${label} (${url}): ${err.message}`)
    }
  }

  const articles = Array.from(all.values())
  if (articles.length === 0) {
    throw new Error('No drama items found from any source')
  }

  logger.info(`Total ${articles.length} unique drama items`)
  return articles
}
