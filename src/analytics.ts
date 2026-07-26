import path from 'path'
import fs from 'fs'
import { AnalyticsEntry } from './types'
import { logger } from './utils/logger'

const ANALYTICS_FILE = path.join(process.cwd(), 'data', 'analytics.json')

export function logAnalytics(entry: AnalyticsEntry): void {
  try {
    const dir = path.dirname(ANALYTICS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    let entries: AnalyticsEntry[] = []
    if (fs.existsSync(ANALYTICS_FILE)) {
      entries = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'))
    }

    entries.push(entry)

    // Keep last 1000 entries
    if (entries.length > 1000) {
      entries = entries.slice(-1000)
    }

    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(entries, null, 2))
  } catch (err) {
    logger.error(`Failed to write analytics: ${err}`)
  }
}

export function getAnalyticsSummary(): string {
  try {
    if (!fs.existsSync(ANALYTICS_FILE)) return 'No analytics data yet'

    const entries: AnalyticsEntry[] = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'))
    const total = entries.length
    const success = entries.filter(e => e.success).length
    const failed = entries.filter(e => !e.success).length
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0'

    return `
=== Analytics Summary ===
Total posts attempted: ${total}
Successful: ${success}
Failed: ${failed}
Success rate: ${successRate}%
Last 5 entries:
${entries.slice(-5).reverse().map(e =>
  `  [${e.timestamp}] ${e.success ? 'OK' : 'FAIL'} - ${e.articleTitle.substring(0, 50)}${e.facebookPostId ? ` (post: ${e.facebookPostId})` : ''}${e.error ? ` - ${e.error}` : ''}`
).join('\n')}
`
  } catch (err) {
    return `Error reading analytics: ${err}`
  }
}
