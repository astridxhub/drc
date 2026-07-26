import sharp from 'sharp'
import axios from 'axios'
import path from 'path'
import fs from 'fs'
import { logger } from './utils/logger'
import { generateSatoriOverlay, type SatoriStyleName } from './satori-renderer'

interface ProcessOptions {
  imageUrl: string
  title: string
  category: string
  logoPath: string
  width: number
  height: number
  outputPath: string
  style: string
  rating?: string
  ranking?: string
}

export async function processImage(opts: ProcessOptions): Promise<string> {
  const { imageUrl, title, category, logoPath, width, height, outputPath, style, rating, ranking } = opts

  logger.info(`Processing image [style: ${style}]: ${imageUrl}`)

  const { data: imageBuffer } = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
  })

  const svgString = await generateSatoriOverlay(title, style as SatoriStyleName, category, rating, ranking, width, height)

  const bgBuffer = await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .toBuffer()

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svgString), top: 0, left: 0 },
  ]

  if (fs.existsSync(logoPath)) {
    const logoMeta = await sharp(fs.readFileSync(logoPath)).metadata()
    const lw = Math.min(logoMeta.width || 100, 60)
    const lh = Math.round(lw * ((logoMeta.height || 30) / (logoMeta.width || 100)))
    const logoResized = await sharp(fs.readFileSync(logoPath)).resize(lw, lh, { fit: 'inside' }).toBuffer()
    composites.push({ input: logoResized, top: Math.round(height - lh - 20), left: 20 })
  }

  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  await sharp(bgBuffer).composite(composites).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(outputPath)
  logger.info(`Image saved to ${outputPath}`)
  return outputPath
}
