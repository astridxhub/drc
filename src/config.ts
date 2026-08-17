import dotenv from 'dotenv'
import path from 'path'
import { Config } from './types'

dotenv.config()

export function loadConfig(): Config {
  const required = [
    'FACEBOOK_PAGE_ID',
    'FACEBOOK_ACCESS_TOKEN',
  ] as const

  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return {
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    aiModel: process.env.AI_MODEL || 'groq/llama-3.3-70b-versatile,groq/llama-4-scout-17b-16e-instruct,groq/qwen-2.5-32b',
    facebookPageId: process.env.FACEBOOK_PAGE_ID!,
    facebookAccessToken: process.env.FACEBOOK_ACCESS_TOKEN!,
    postIntervalHours: parseInt(process.env.POST_INTERVAL_HOURS || '6', 10),
    maxPostsPerRun: parseInt(process.env.MAX_POSTS_PER_RUN || '3', 10),
    newsSourceUrls: (process.env.NEWS_SOURCE_URLS || 'https://www.dramabox.com/browse,https://www.moboreels.com/dramas,https://www.reelshort.com/shelf/new-release-short-movies-dramas-51001290').split(',').map(s => s.trim()).filter(Boolean),
    logoPath: process.env.LOGO_PATH || path.join(process.cwd(), 'assets', 'logo.png'),
    imageWidth: parseInt(process.env.IMAGE_WIDTH || '800', 10),
    imageHeight: parseInt(process.env.IMAGE_HEIGHT || '1200', 10),
    imageStyle: (process.env.IMAGE_STYLE || 'dracin').trim(),
  }
}