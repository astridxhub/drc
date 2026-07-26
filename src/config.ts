import dotenv from 'dotenv'
import path from 'path'
import { Config } from './types'

dotenv.config()

export function loadConfig(): Config {
  const required = [
    'OPENROUTER_API_KEY',
    'FACEBOOK_PAGE_ID',
    'FACEBOOK_ACCESS_TOKEN',
  ] as const

  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return {
    openrouterApiKey: process.env.OPENROUTER_API_KEY!,
    aiModel: process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
    facebookPageId: process.env.FACEBOOK_PAGE_ID!,
    facebookAccessToken: process.env.FACEBOOK_ACCESS_TOKEN!,
    postIntervalHours: parseInt(process.env.POST_INTERVAL_HOURS || '6', 10),
    maxPostsPerRun: parseInt(process.env.MAX_POSTS_PER_RUN || '3', 10),
    newsSourceUrl: process.env.NEWS_SOURCE_URL || 'https://mydramalist.com/shows/newest',
    logoPath: process.env.LOGO_PATH || path.join(process.cwd(), 'assets', 'logo.png'),
    imageWidth: parseInt(process.env.IMAGE_WIDTH || '800', 10),
    imageHeight: parseInt(process.env.IMAGE_HEIGHT || '1200', 10),
    imageStyle: (process.env.IMAGE_STYLE || 'dracin').trim(),
  }
}
