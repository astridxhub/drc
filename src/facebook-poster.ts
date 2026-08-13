import axios from 'axios'
import fs from 'fs'
import FormData from 'form-data'
import { logger } from './utils/logger'

interface PostOptions {
  pageId: string
  accessToken: string
  imagePath: string
  description: string
  hashtags: string[]
  articleLink: string
}

export async function postToFacebook(opts: PostOptions): Promise<string> {
  const { pageId, accessToken, imagePath, description, hashtags, articleLink } = opts

  const fullMessage = `${description}\n\n${hashtags.join(' ')}\n\nBaca selengkapnya: ${articleLink}`

  logger.info(`Posting to Facebook page ${pageId}`)

  // Cara 1 (paling andal): upload foto + caption sekaligus dalam satu panggilan.
  // Menghindari publish terpisah (POST /{photoId}) yang ditolak error #3.
  const form = new FormData()
  form.append('source', fs.createReadStream(imagePath))
  form.append('access_token', accessToken)
  form.append('message', fullMessage)
  form.append('published', 'true')

  try {
    const { data: photoData } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      form,
      { headers: form.getHeaders(), timeout: 60000 }
    )

    logger.info(`Photo post published directly! Post ID: ${photoData.id}`)
    return photoData.id
  } catch (directErr: any) {
    logger.warn(`Direct photo+message publish failed (${fbError(directErr)}), trying upload + feed post`)

    // Cara 2: upload unpublished lalu attach ke feed post
    const form2 = new FormData()
    form2.append('source', fs.createReadStream(imagePath))
    form2.append('access_token', accessToken)
    form2.append('published', 'false')

    const { data: photoData } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      form2,
      { headers: form2.getHeaders(), timeout: 60000 }
    )

    const photoId = photoData.id
    logger.info(`Photo uploaded, ID: ${photoId}`)

    const { data: postData } = await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        message: fullMessage,
        attached_media: JSON.stringify([{ media_fbid: photoId }]),
        access_token: accessToken,
      },
      { timeout: 60000 }
    )

    logger.info(`Posted to feed! Post ID: ${postData.id}`)
    return postData.id
  }
}

/** Helper untuk menampilkan error asli dari Facebook (status 400 dsb). */
export function fbError(err: unknown): string {
  const e: any = err
  const fbMsg = e?.response?.data?.error?.message
  const fbCode = e?.response?.data?.error?.code
  const fbSubcode = e?.response?.data?.error?.error_subcode
  if (fbMsg) return `Facebook error ${fbCode ?? ''} (subcode ${fbSubcode ?? ''}): ${fbMsg}`
  return e?.message ?? String(err)
}
