import axios from 'axios'
import { AiResponse } from './types'
import { logger } from './utils/logger'

interface AiGenOptions {
  groqApiKey: string
  groqBaseUrl: string
  openrouterApiKey: string
  model: string
  articleTitle: string
  articleLink: string
  articleCategory: string
  sourceName: string
  rating?: string
  ranking?: string
  metadata?: string
}

export async function generateContent(opts: AiGenOptions): Promise<AiResponse> {
  const { groqApiKey, groqBaseUrl, openrouterApiKey, articleTitle, articleLink, articleCategory, sourceName, rating, ranking, metadata } = opts

  const models = opts.model.split(',').map(m => m.trim()).filter(Boolean)

  const metaInfo = [metadata, rating ? `Rating: ${rating}/10` : '', ranking ? `Peringkat: ${ranking}` : ''].filter(Boolean).join(' | ')

  const systemPrompt = `Anda adalah AI yang hanya merespon dalam format JSON. JANGAN menulis apapun di luar JSON.
Anda adalah content creator drama Indonesia.

Buat object JSON dengan format:
{"description": "...sinopsis 1 paragraf...", "hashtags": ["#tag1", "#tag2", ...]}

Aturan sinopsis:
- WAJIB Bahasa Indonesia. JANGAN pernah menggunakan Bahasa Inggris.
- 1 paragraf pendek sinopsis drama yang menarik dalam Bahasa Indonesia
- HANYA sinopsis cerita, jangan sertakan genre/tahun/episode/rating/rank
- Jangan emoji
- Jangan ulang judul

Aturan hashtags:
- 10 hashtag relevan (termasuk #kdrama #dracin #dramakorea atau #dramachina sesuai negara)
- Huruf kecil semua`

  const userPrompt = `Judul: ${articleTitle}
Negara: ${articleCategory}
${metaInfo ? `Info: ${metaInfo}` : ''}
Link: ${articleLink}

RESPON HANYA DENGAN JSON:`

  for (const model of models) {
    const isGroq = model.startsWith('groq/')
    const actualModel = isGroq ? model.slice(5) : model
    const apiKey = isGroq ? groqApiKey : openrouterApiKey
    const baseUrl = isGroq ? groqBaseUrl : 'https://openrouter.ai/api/v1'

    if (!apiKey) {
      logger.warn(`[${model}] No API key configured, skipping`)
      continue
    }

    logger.info(`Trying AI model: ${model}`)
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
      if (!isGroq) {
        headers['HTTP-Referer'] = 'https://github.com/fb-dracin'
        headers['X-Title'] = 'FB Dracin'
      }

      const { data } = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: actualModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 800,
        },
        { headers, timeout: 30000 }
      )

      const rawContent = data.choices?.[0]?.message?.content || ''
      logger.info(`[${model}] Raw response (${rawContent.length} chars): ${rawContent}`)
      try { require('fs').appendFileSync('ai-raw.log', `${new Date().toISOString()} [${model}]\n${rawContent}\n\n`) } catch {}

      const parsed = tryParseJson(rawContent)

      if (!parsed) {
        logger.warn(`[${model}] Not valid JSON, trying next model`)
        continue
      }

      const desc = parsed.description?.trim() || ''
      const hashtags = parsed.hashtags?.filter((h: any) => typeof h === 'string' && h.startsWith('#')) || []

      if (desc.length < 30 || desc.replace(/[.#\s]/g, '').length < 10) {
        logger.warn(`[${model}] Description too short (${desc.length} chars), trying next model`)
        continue
      }

      if (!hashtags.length) {
        logger.warn(`[${model}] No valid hashtags, trying next model`)
        continue
      }

      logger.info(`[${model}] Success (${desc.length} chars, ${hashtags.length} tags)`)
      return { description: desc, hashtags: hashtags.slice(0, 10) }

    } catch (err: any) {
      if (err.response?.status === 402 || err.response?.status === 429) {
        logger.warn(`[${model}] ${err.response.status === 402 ? 'insufficient credits' : 'rate limited'}, trying next model`)
      } else {
        logger.warn(`[${model}] Failed: ${err.message}, trying next model`)
      }
    }
  }

  logger.warn('All AI models failed, using fallback')
  return generateFallback(articleTitle, articleCategory, sourceName, rating, ranking, metadata)
}

function tryParseJson(content: string): any | null {
  let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  cleaned = cleaned
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')

  try {
    return JSON.parse(cleaned)
  } catch { }

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    let json = match[0]
      .replace(/,(\s*[}\]])/g, '$1')
    try {
      return JSON.parse(json)
    } catch { }
    json = json
      .replace(/:\s*'([^']+)'/g, ':"$1"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
    try {
      return JSON.parse(json)
    } catch { }
  }

  const descMatch = cleaned.match(/"description"\s*:\s*"([^"]*)"/)
  const hashMatch = cleaned.match(/"hashtags"\s*:\s*\[(.*?)\]/s)

  if (descMatch && hashMatch) {
    const description = descMatch[1]
    const hashtagsRaw = hashMatch[1]
    const hashtags = hashtagsRaw.match(/"([^"]+)"/g)?.map(h => h.replace(/"/g, '')) || []
    return { description, hashtags }
  }

  return null
}

function generateFallback(_title: string, category: string, _sourceName: string, _rating?: string, _ranking?: string, _metadata?: string): AiResponse {
  const country = category.toLowerCase()
  const countryTag = country === 'korean' ? '#kdrama' : country === 'chinese' ? '#dramachina' : '#drama'

  const description = _title

  const words = _title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2)
  const uniqueWords = [...new Set(words)].slice(0, 3)
  const hashtags = [
    countryTag,
    '#dracin',
    '#dramarekomendasi',
    '#dramaseries',
    '#myDramaList',
    '#ratingtinggi',
    '#sinopsis',
    ...(_rating ? ['#dramapopuler'] : []),
    ...uniqueWords.map(w => `#${w}`),
  ].slice(0, 10)

  return { description, hashtags }
}