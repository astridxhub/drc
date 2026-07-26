import path from 'path'
import fs from 'fs'
import { logger } from './utils/logger'

const POSTED_FILE = path.join(process.cwd(), 'data', 'posted.json')
const MAX_ENTRIES = 500

let _cache: Set<string> | null = null

function load(): Set<string> {
  if (_cache) return _cache
  try {
    if (fs.existsSync(POSTED_FILE)) {
      const data: string[] = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'))
      _cache = new Set(data)
      return _cache
    }
  } catch (err) {
    logger.warn(`Failed to load posted file: ${err}`)
  }
  _cache = new Set()
  return _cache
}

function save(set: Set<string>): void {
  const dir = path.dirname(POSTED_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const arr = Array.from(set).slice(-MAX_ENTRIES)
  fs.writeFileSync(POSTED_FILE, JSON.stringify(arr, null, 2))
}

export function isAlreadyPosted(articleLink: string): boolean {
  const posted = load()
  return posted.has(articleLink)
}

export function markAsPosted(articleLink: string): void {
  const posted = load()
  posted.add(articleLink)
  save(posted)
}
