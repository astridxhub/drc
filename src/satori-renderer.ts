import satori from 'satori'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { logger } from './utils/logger'

// ─── Types ───────────────────────────────────
type VNode = { type: string; props: Record<string, any> }

function el(type: string, style: Record<string, string | number | undefined>, children?: any): VNode {
  const clean: Record<string, any> = {}
  for (const [k, v] of Object.entries(style)) {
    if (v !== undefined) clean[k] = v
  }
  return { type, props: { style: clean, children } }
}

function div(style: Record<string, any>, children?: any) { return el('div', style, children) }
function span(style: Record<string, any>, children?: any) { return el('span', style, children) }

function flexRow(s: Record<string, any> = {}, c?: any) { return div({ display: 'flex', flexDirection: 'row', ...s }, c) }
function flexCol(s: Record<string, any> = {}, c?: any) { return div({ display: 'flex', flexDirection: 'column', ...s }, c) }

// ─── Font Loader ─────────────────────────────
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')
const FONT_CACHE = new Map<string, Buffer>()

async function getFont(name: string, weight: any, url: string): Promise<{ name: string; data: Buffer; weight: any }> {
  const key = `${name}-${weight}`
  if (FONT_CACHE.has(key)) return { name, data: FONT_CACHE.get(key)!, weight }

  const cachePath = path.join(FONT_DIR, `${key}.woff2`)
  if (fs.existsSync(cachePath)) {
    const data = fs.readFileSync(cachePath)
    FONT_CACHE.set(key, data)
    return { name, data, weight }
  }

  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })
    const buf = Buffer.from(data)
    if (!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR, { recursive: true })
    fs.writeFileSync(cachePath, buf)
    FONT_CACHE.set(key, buf)
    logger.info(`Font cached: ${key}`)
    return { name, data: buf, weight }
  } catch (err: any) {
    throw new Error(`Failed to load font ${key}: ${err.message}`)
  }
}

async function findFontUrl(family: string, weight: number): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`
  const { data: css } = await axios.get(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  const m = css.match(/url\(([^)]+)\)/)
  if (!m) throw new Error(`No font URL found for ${family} ${weight}`)
  return m[1]
}

let _fonts: any[] | null = null

async function ensureFonts() {
  if (_fonts) return _fonts
  const [poppins400, poppins600, poppins700, poppins800, notoSans400, notoSans700] = await Promise.all([
    findFontUrl('Poppins', 400),
    findFontUrl('Poppins', 600),
    findFontUrl('Poppins', 700),
    findFontUrl('Poppins', 800),
    findFontUrl('Noto+Sans+SC', 400).catch(() => null),
    findFontUrl('Noto+Sans+SC', 700).catch(() => null),
  ])

  const fontTasks = [
    getFont('Poppins', 400 as any, poppins400),
    getFont('Poppins', 600 as any, poppins600),
    getFont('Poppins', 700 as any, poppins700),
    getFont('Poppins', 800 as any, poppins800),
  ]

  if (notoSans400) fontTasks.push(getFont('Noto+Sans+SC', 400 as any, notoSans400))
  if (notoSans700) fontTasks.push(getFont('Noto+Sans+SC', 700 as any, notoSans700))

  _fonts = (await Promise.all(fontTasks)) as any
  return _fonts
}

// ─── Style Builders ──────────────────────────

function buildViral(title: string): VNode {
  const wrap = wrapText(title, 36)
  const fs_ = wrap.length > 2 ? 40 : 48
  return flexCol({
    width: '100%', height: '100%',
    justifyContent: 'flex-end',
    padding: '0 0 50px 0',
    position: 'relative',
    background: 'linear-gradient(to top, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 70%, transparent 100%)',
  }, [
    div({ position: 'absolute', top: 0, left: 0, width: 6, height: '100%', background: '#FF2222' }),
    flexCol({ padding: '0 45px', gap: 2 }, wrap.map(line =>
      div({ fontSize: fs_, fontWeight: 800, color: '#fff', lineHeight: 1.35, textShadow: '0 2px 8px rgba(0,0,0,0.6)', fontFamily: 'Poppins' }, line)
    )),
  ])
}

function buildModern(title: string, category: string): VNode {
  const wrap = wrapText(title, 36)
  const fs_ = wrap.length > 2 ? 34 : 42
  const panelH = 60 + wrap.length * fs_ * 1.3 + 30
  return flexCol({
    width: '100%', height: '100%',
    justifyContent: 'flex-end',
    padding: '0 30px 30px 30px',
  }, [
    flexCol({
      background: 'rgba(255,255,255,0.94)',
      borderRadius: 16,
      padding: '24px 30px',
      boxShadow: '0 4px 30px rgba(0,0,0,0.25)',
      gap: 2,
    }, [
      flexRow({ alignItems: 'center', gap: 10, marginBottom: 8 }, [
        div({ background: '#FF2222', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 1, fontFamily: 'Poppins' }, category.toUpperCase()),
        div({ fontSize: 11, color: '#999', letterSpacing: 1, fontFamily: 'Poppins' }, 'TRENDING'),
      ]),
      ...wrap.map(line =>
        div({ fontSize: fs_, fontWeight: 600, color: '#111', lineHeight: 1.3, fontFamily: 'Poppins' }, line)
      ),
    ]),
  ])
}

function buildBreaking(title: string): VNode {
  const wrap = wrapText(title, 34)
  const fs_ = wrap.length > 2 ? 36 : 44
  return flexCol({
    width: '100%', height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.5) 100%)',
  }, [
    div({ position: 'absolute', top: 0, left: 0, width: '100%', height: 50, background: '#FF2222' }),
    div({ position: 'absolute', top: 0, left: 0, width: '100%', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      div({ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: 6, fontFamily: 'Poppins' }, 'BREAKING NEWS'),
    ),
    flexCol({ alignItems: 'center', padding: '0 50px', gap: 2 }, wrap.map(line =>
      div({ fontSize: fs_, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.35, textShadow: '0 2px 10px rgba(0,0,0,0.7)', fontFamily: 'Poppins' }, line)
    )),
    div({ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 50, background: '#FF2222' }),
  ])
}

function buildMagazine(title: string, category: string, date: string): VNode {
  const wrap = wrapText(title, 30)
  return flexCol({
    width: '100%', height: '100%',
    position: 'relative',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)',
  }, [
    flexRow({
      position: 'absolute', top: 0, left: 0, width: '100%', height: 80,
      background: '#FF2222', alignItems: 'center', padding: '0 40px',
    }, [
      div({ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 4, fontFamily: 'Poppins' }, 'BERITA PILIHAN'),
      div({ flex: 1 }),
      div({ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'Poppins', letterSpacing: 1 }, date),
    ]),
    flexCol({
      flex: 1, justifyContent: 'center', padding: '80px 40px 60px',
    }, wrap.map((line, i) =>
      div({ fontSize: i === 0 ? 48 : 44, fontWeight: 600, color: '#fff', lineHeight: 1.2, textShadow: '0 2px 6px rgba(0,0,0,0.5)', fontFamily: 'Poppins' }, line)
    )),
    div({ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 40, background: 'rgba(0,0,0,0.5)' }),
    div({ position: 'absolute', bottom: 12, left: 40, fontSize: 11, color: '#ccc', letterSpacing: 1, fontFamily: 'Poppins' }, 'SWIPE UNTUK BERITA LAINNYA →'),
  ])
}

function buildDracin(title: string, category: string, rating: string, ranking: string): VNode {
  const wrap = wrapText(title, 22)
  const fs_ = wrap.length > 3 ? 48 : 60
  return flexCol({
    width: '100%', height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  }, [
    div({ position: 'absolute', top: 0, left: 0, width: '100%', height: 8, background: 'linear-gradient(to right, #7c3aed, #a855f7, #c084fc)' }),
    flexRow({
      position: 'absolute', top: 20, left: 24, gap: 10,
    }, [
      div({ background: 'rgba(124,58,237,0.92)', borderRadius: 16, padding: '6px 16px', fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 1, fontFamily: 'Poppins' }, (category || 'DRAMA').toUpperCase()),
      ...(rating ? [div({ background: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: '6px 14px', fontSize: 14, fontWeight: 600, color: '#fbbf24', letterSpacing: 1, fontFamily: 'Poppins' }, `★ ${rating}`)] : []),
      ...(ranking ? [div({ background: 'rgba(0,0,0,0.65)', borderRadius: 16, padding: '6px 14px', fontSize: 14, fontWeight: 600, color: '#e2e8f0', letterSpacing: 1, fontFamily: 'Poppins' }, ranking)] : []),
    ]),
    div({
      position: 'absolute', bottom: 0, left: 0, width: '100%', height: '55%',
      background: 'linear-gradient(to top, rgba(10,0,25,0.85) 0%, rgba(10,0,25,0.4) 50%, transparent 100%)',
    }),
    flexCol({ padding: '0 28px 50px 28px', gap: 6 }, wrap.map((line, i) =>
      div({ fontSize: i === 0 ? fs_ : fs_ - 6, fontWeight: i === 0 ? 800 : 700, color: '#fff', lineHeight: 1.3, textShadow: '0 3px 12px rgba(0,0,0,0.8)', fontFamily: 'Poppins' }, line)
    )),
    div({ position: 'absolute', bottom: 16, right: 28, fontSize: 12, color: 'rgba(192,132,252,0.5)', letterSpacing: 1.5, fontFamily: 'Poppins' }, 'MovieFeed'),
  ])
}

function buildCinematic(title: string): VNode {
  const wrap = wrapText(title, 40)
  return flexCol({
    width: '100%', height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  }, [
    div({
      position: 'absolute', bottom: 0, left: 0, width: '100%', height: 200,
      background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)',
    }),
    div({ position: 'absolute', left: 50, bottom: 175, width: 100, height: 3, background: '#FF2222' }),
    div({ position: 'absolute', top: 0, left: 0, width: 8, height: '100%', background: '#FF2222', opacity: 0.7 }),
    flexCol({ padding: '0 50px 40px 50px', gap: 4 }, wrap.map((line, i) =>
      div({ fontSize: i === wrap.length - 1 ? 38 : 44, fontWeight: i === wrap.length - 1 ? 700 : 300, color: '#fff', lineHeight: 1.3, fontFamily: 'Poppins' }, line)
    )),
  ])
}

// ─── Text Wrapper ────────────────────────────
function wrapText(t: string, max: number): string[] {
  const r: string[] = []
  let c = ''
  for (const w of t.split(/\s+/)) {
    if ((c + ' ' + w).trim().length > max && c) { r.push(c); c = w }
    else if (c) c += ' ' + w
    else c = w
  }
  if (c) r.push(c)
  return r.length ? r : [t]
}

function formatDate(): string {
  const d = new Date()
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Public API ──────────────────────────────
export type SatoriStyleName = 'viral' | 'modern' | 'breaking' | 'magazine' | 'cinematic' | 'dracin'

export async function generateSatoriOverlay(
  title: string,
  style: SatoriStyleName,
  category?: string,
  rating?: string,
  ranking?: string,
  canvasWidth: number = 1200,
  canvasHeight: number = 630,
): Promise<string> {
  const fonts = (await ensureFonts()) as any[]
  const date = formatDate()

  let node: VNode
  switch (style) {
    case 'modern':
      node = buildModern(title, category || 'Berita')
      break
    case 'breaking':
      node = buildBreaking(title)
      break
    case 'magazine':
      node = buildMagazine(title, category || 'Berita', date)
      break
    case 'cinematic':
      node = buildCinematic(title)
      break
    case 'dracin':
      node = buildDracin(title, category || 'Drama', rating || '', ranking || '')
      break
    default:
      node = buildViral(title)
  }

  const svg = await satori(node, { width: canvasWidth, height: canvasHeight, fonts })
  return svg
}
