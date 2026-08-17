import path from 'path'
import fs from 'fs'
import { loadConfig } from './config'
import { scrapeArticles } from './scraper'
import { processImage } from './image-processor'
import { generateContent } from './ai-generator'
import { postToFacebook, fbError } from './facebook-poster'
import { loadHealth, saveHealth, recordSuccess, recordError, isHealthy, shouldSkipRun } from './health-check'
import { logAnalytics } from './analytics'
import { logger } from './utils/logger'
import { isAlreadyPosted, markAsPosted } from './dedup'

const AFF_LINKS_FILE = path.join(process.cwd(), 'assets', 'linkaff.txt')

function getSourceName(link: string): string {
  if (link.includes('dramabox.com')) return 'DramaBox'
  if (link.includes('moboreels.com')) return 'MoboReels'
  if (link.includes('reelshort.com')) return 'ReelShort'
  return 'Short Drama'
}

function randomAffLink(): string {
  try {
    const links = fs.readFileSync(AFF_LINKS_FILE, 'utf-8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (links.length > 0) return links[Math.floor(Math.random() * links.length)]
  } catch {}
  return 'https://s.shopee.co.id/1BL3GW2EaJ'
}

async function main(): Promise<void> {
  try {
    logger.info('=== FB Dracin - Drama Poster ===')

    const config = loadConfig()
    const health = loadHealth()

    // Health check
    if (!isHealthy(health)) {
      logger.error(`Skipping run: too many consecutive failures (${health.consecutiveFailures})`)
      return
    }

    // Check interval
    if (shouldSkipRun(health, config.postIntervalHours)) {
      logger.info('Skipping: too soon since last run')
      return
    }

    // Scrape articles
    const articles = await scrapeArticles(config.newsSourceUrls)

    // Per-source allocation: 2 posting per sumber short drama per run
    const dbPool = articles.filter(a => getSourceName(a.link) === 'DramaBox' && !isAlreadyPosted(a.link, a.title))
    const mrPool = articles.filter(a => getSourceName(a.link) === 'MoboReels' && !isAlreadyPosted(a.link, a.title))
    const rsPool = articles.filter(a => getSourceName(a.link) === 'ReelShort' && !isAlreadyPosted(a.link, a.title))

    // Jika tidak ada artikel baru sama sekali, berhenti tanpa memposting apa pun
    // (mencegah postingan berulang saat website target belum menambah konten baru).
    if (dbPool.length === 0 && mrPool.length === 0 && rsPool.length === 0) {
      logger.info('No new short drama to post (semua sudah pernah diposting). Skipping run.')
      return
    }

    const dbQuota = Math.min(2, dbPool.length)
    const mrQuota = Math.min(2, mrPool.length)
    const rsQuota = Math.min(2, rsPool.length)

    const toProcess = [
      ...dbPool.slice(0, dbQuota),
      ...mrPool.slice(0, mrQuota),
      ...rsPool.slice(0, rsQuota),
    ].slice(0, config.maxPostsPerRun)

    logger.info(`DramaBox quota: ${dbQuota}, MoboReels quota: ${mrQuota}, ReelShort quota: ${rsQuota}`)

    // Ensure output dir
    const outputDir = path.join(process.cwd(), 'output')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    for (let i = 0; i < toProcess.length; i++) {
      const article = toProcess[i]
      const startTime = Date.now()

      try {
        logger.info(`Processing [${i + 1}/${toProcess.length}]: ${article.title.substring(0, 60)}...`)

        const sourceName = getSourceName(article.link)

        const aiResponse = await generateContent({
          groqApiKey: config.groqApiKey,
          groqBaseUrl: config.groqBaseUrl,
          openrouterApiKey: config.openrouterApiKey,
          model: config.aiModel,
          articleTitle: article.title,
          articleLink: article.link,
          articleCategory: article.category,
          sourceName,
          rating: article.rating,
          ranking: article.ranking,
          metadata: article.metadata,
        })

        const synopsis = aiResponse.description.replace(/\s*(?:Korean|Chinese|Japanese|Taiwanese|Thai)\s*(?:Drama|Movie)\s*-\s*\d{4}.*?(?:\n|$)/i, '').trim()
        const year = article.date
        const epsMatch = article.metadata?.match(/(\d+\s*episode)/i)
        const episodes = epsMatch ? epsMatch[1] : ''
        const infoParts = [article.category, year, episodes, article.rating ? `Rating: ${article.rating}/10` : '', article.ranking ? `Rank: ${article.ranking}` : ''].filter(Boolean)
        const desc = `${article.title}
${infoParts.join(' | ')}

${synopsis}

Sumber: ${sourceName}
Support me: ${randomAffLink()}`

        // Process image
        const imageFilename = `post_${Date.now()}_${i}.jpg`
        const imagePath = path.join(outputDir, imageFilename)
        await processImage({
          imageUrl: article.imageUrl,
          title: article.title,
          category: article.category,
          logoPath: config.logoPath,
          width: config.imageWidth,
          height: config.imageHeight,
          outputPath: imagePath,
          style: config.imageStyle,
          rating: article.rating,
          ranking: article.ranking,
        })

        // Post to Facebook
        const postId = await postToFacebook({
          pageId: config.facebookPageId,
          accessToken: config.facebookAccessToken,
          imagePath,
          description: desc,
          hashtags: aiResponse.hashtags,
          articleLink: article.link,
        })

        // Mark as posted + record success
        markAsPosted(article.link, article.title)
        const newHealth = recordSuccess(loadHealth())
        saveHealth(newHealth)

        logAnalytics({
          timestamp: new Date().toISOString(),
          articleTitle: article.title,
          articleLink: article.link,
          success: true,
          facebookPostId: postId,
          durationMs: Date.now() - startTime,
        })

        logger.info(`Completed [${i + 1}/${toProcess.length}] in ${Date.now() - startTime}ms`)

        // Random delay between posts (5-10 minutes)
        if (i < toProcess.length - 1) {
          const delay = 300000 + Math.random() * 300000
          logger.info(`Waiting ${Math.round(delay / 1000)}s before next post...`)
          await new Promise(r => setTimeout(r, delay))
        }
      } catch (err: any) {
        logger.error(`Failed processing article: ${fbError(err)}`)

const newHealth = recordError(loadHealth(), fbError(err))
        saveHealth(newHealth)

        logAnalytics({
          timestamp: new Date().toISOString(),
          articleTitle: article.title,
          articleLink: article.link,
          success: false,
          error: err.message,
          durationMs: Date.now() - startTime,
        })

        // Stop if too many failures
        if (!isHealthy(newHealth)) {
          logger.error('Too many consecutive failures, stopping')
          break
        }
      }
    }

    logger.info('=== Run Complete ===')
  } catch (err: any) {
    logger.error(`Fatal error: ${err.message}`)
    const newHealth = recordError(loadHealth(), err.message)
    saveHealth(newHealth)
    process.exit(1)
  }
}

main()
