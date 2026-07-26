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

async function scrapeUrl(url: string, label: string): Promise<Article[]> {
  logger.info(`Scraping ${label} from ${url}`)
  const html = await fetchWithRetry(url)
  const $ = cheerio.load(html)
  return scrapeMyDramaList($)
}

export async function scrapeArticles(sourceUrl?: string): Promise<Article[]> {
  const newestUrl = 'https://mydramalist.com/shows/newest'
  const popularUrl = 'https://mydramalist.com/shows/popular'

  const all = new Map<string, Article>()

  // Primary: newest
  try {
    const newest = await scrapeUrl(newestUrl, 'newest')
    for (const a of newest) all.set(a.link, a)
    logger.info(`Scraped ${newest.length} from newest`)
  } catch (err: any) {
    logger.warn(`Failed to scrape newest: ${err.message}`)
  }

  // Secondary: popular
  try {
    const popular = await scrapeUrl(popularUrl, 'popular')
    for (const a of popular) if (!all.has(a.link)) all.set(a.link, a)
    logger.info(`Scraped ${popular.length} from popular`)
  } catch (err: any) {
    logger.warn(`Failed to scrape popular: ${err.message}`)
  }

  const articles = Array.from(all.values())
  if (articles.length === 0) {
    throw new Error('No drama items found from any source')
  }

  logger.info(`Total ${articles.length} unique drama items`)
  return articles.slice(0, 20)
}
