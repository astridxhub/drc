import path from 'path'
import fs from 'fs'
import { logger } from './utils/logger'

const POSTED_FILE = path.join(process.cwd(), 'data', 'posted.json')
const MAX_ENTRIES = 500

/**
 * Kunci dedup disimpan sebagai array objek { key, title, link, at } agar
 * kita bisa melacak berdasarkan judul (lebih andal untuk link fallback yang
 * sama) maupun link asli.
 */
interface PostedEntry {
  key: string
  title: string
  link: string
  at: string
}

let _cache: Map<string, PostedEntry> | null = null

/** Normalisasi judul agar huruf besar/kecil, spasi, dan tanda baca tidak membuat duplikat palsu. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function load(): Map<string, PostedEntry> {
  if (_cache) return _cache
  try {
    if (fs.existsSync(POSTED_FILE)) {
      const raw = fs.readFileSync(POSTED_FILE, 'utf-8').replace(/^\uFEFF/, '')
      const data: any[] = JSON.parse(raw)
      _cache = new Map()
      for (const item of data) {
        // Entri lama berbentuk string (link) -> kunci l:<link>.
        if (typeof item === 'string') {
          _cache.set(`l:${item}`, { key: `l:${item}`, title: '', link: item, at: '' })
          continue
        }
        const key = item?.key
        if (key) {
          _cache.set(key, {
            key,
            title: typeof item === 'object' ? item.title || '' : '',
            link: typeof item === 'object' ? item.link || '' : '',
            at: typeof item === 'object' ? item.at || '' : '',
          })
        }
      }
      return _cache
    }
  } catch (err) {
    logger.warn(`Failed to load posted file: ${err}`)
  }
  _cache = new Map()
  return _cache
}

function save(map: Map<string, PostedEntry>): void {
  const dir = path.dirname(POSTED_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const arr = Array.from(map.values()).slice(-MAX_ENTRIES)
  fs.writeFileSync(POSTED_FILE, JSON.stringify(arr, null, 2))
}

/** Bikin kunci unik: judul ternormalisasi bila ada, jika kosong pakai link. */
function makeKey(articleLink: string, title: string): string {
  const norm = normalizeTitle(title)
  return norm ? `t:${norm}` : `l:${articleLink}`
}

/** Cek apakah artikel (berdasarkan judul ATAU link) sudah pernah diposting. */
export function isAlreadyPosted(articleLink: string, title?: string): boolean {
  const posted = load()
  // 1) Cocok by judul ternormalisasi (handal untuk link fallback yang sama).
  if (title) {
    const norm = normalizeTitle(title)
    if (norm && posted.has(`t:${norm}`)) return true
  }
  // 2) Cocok by link (untuk entri lama berbentuk string dan link unik per artikel).
  return posted.has(`l:${articleLink}`) || posted.has(articleLink)
}

/** Tandai artikel sebagai sudah diposting. */
export function markAsPosted(articleLink: string, title?: string): void {
  const posted = load()
  const key = makeKey(articleLink, title || '')
  posted.set(key, { key, title: title || '', link: articleLink, at: new Date().toISOString() })
  save(posted)
}

/** Berapa banyak artikel dengan pola sumber tertentu yang sudah diposting (untuk kuota). */
export function countPostedBySource(sourcePattern: string): number {
  const posted = load()
  let count = 0
  for (const entry of posted.values()) {
    if (entry.link && entry.link.includes(sourcePattern)) count++
  }
  return count
}

/** Berapa banyak artikel unik yang tersisa (belum diposting). */
export function remainingCount(articles: { link: string; title: string }[]): number {
  let count = 0
  for (const a of articles) {
    if (!isAlreadyPosted(a.link, a.title)) count++
  }
  return count
}
