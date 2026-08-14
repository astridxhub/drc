import dotenv from 'dotenv'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

dotenv.config()

const APP_ID = process.env.FB_APP_ID || process.env.APP_ID || ''
const APP_SECRET = process.env.FB_APP_SECRET || process.env.APP_SECRET || ''

async function main() {
  const shortToken = process.env.FACEBOOK_ACCESS_TOKEN || ''

  if (!shortToken) { console.error('FACEBOOK_ACCESS_TOKEN tidak ada di .env'); process.exit(1) }
  if (!APP_ID || !APP_SECRET) { console.error('Butuh FB_APP_ID dan FB_APP_SECRET di .env'); process.exit(1) }

  console.log('Menukar short-lived token -> long-lived (60 hari)...')

  const r = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: shortToken,
    },
    timeout: 30000,
  })

  const longToken = r.data.access_token
  const expiresIn = r.data.expires_in
  const expiry = new Date(Date.now() + (expiresIn || 0) * 1000).toISOString()

  console.log('Long-lived token diperoleh!')
  console.log('Expires in:', expiresIn, 'detik (~', Math.round((expiresIn || 0) / 86400), 'hari)')
  console.log('Expiry:', expiry)
  console.log('\nLONG_TOKEN_BEGIN')
  console.log(longToken)
  console.log('LONG_TOKEN_END')

  const envPath = path.join(process.cwd(), '.env')
  const current = fs.readFileSync(envPath, 'utf-8')
  const updated = current
    .split('\n')
    .map(line => {
      if (line.startsWith('FACEBOOK_ACCESS_TOKEN=')) return `FACEBOOK_ACCESS_TOKEN=${longToken}`
      return line
    })
    .join('\n')
  fs.writeFileSync(envPath, updated)
  console.log('\nFACEBOOK_ACCESS_TOKEN di .env sudah diperbarui ke long-lived token.')
}

main().catch(e => {
  const d = e.response?.data
  console.error('GAGAL:', d?.error?.message || e.message)
  process.exit(1)
})