import { Article } from './types'
import { logger } from './utils/logger'
import { scrapeDramaBox, scrapeMoboReels, scrapeReelShort } from './short-drama-scraper'

export async function scrapeArticles(sourceUrls: string[]): Promise<Article[]> {
  const all = new Map<string, Article>()

  for (let i = 0; i < sourceUrls.length; i++) {
    const url = sourceUrls[i]
    const label = `source-${i + 1}`
    try {
      let items: Article[]

      if (url.includes('dramabox.com')) {
        items = await scrapeDramaBox(url)
      } else if (url.includes('moboreels.com')) {
        items = await scrapeMoboReels(url)
      } else if (url.includes('reelshort.com')) {
        items = await scrapeReelShort(url)
      } else {
        logger.warn(`Unknown source URL, skipping: ${url}`)
        continue
      }

      for (const a of items) if (!all.has(a.link)) all.set(a.link, a)
      logger.info(`Scraped ${items.length} from ${label}: ${url}`)
    } catch (err: any) {
      logger.warn(`Failed to scrape ${label} (${url}): ${err.message}`)
    }
  }

  const articles = Array.from(all.values())
  if (articles.length === 0) {
    throw new Error('No short drama items found from any source')
  }

  logger.info(`Total ${articles.length} unique short drama items`)
  return articles
}