import 'dotenv/config'
import path from 'node:path'
import os from 'node:os'

function expandHome(p) {
  if (!p) return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret || sessionSecret === 'change-me-to-a-long-random-string') {
  console.warn('[config] WARNING: SESSION_SECRET is not set to a real value. Set it in .env before production use.')
}

const adminHash = process.env.ADMIN_PASSWORD_HASH
if (!adminHash || adminHash.includes('replace-with-your-bcrypt-hash')) {
  console.warn('[config] WARNING: ADMIN_PASSWORD_HASH is not set to a real value. Login will not work.')
}

export const config = {
  sessionSecret: sessionSecret || 'dev-only-insecure-secret-change-me',
  adminPasswordHash: adminHash || '$2a$10$replace-with-your-bcrypt-hash',
  port: Number(process.env.PORT) || 3000,
  bedrockDir: expandHome(process.env.BEDROCK_DIR) || expandHome('~/bedrock-server'),
  swapfile: process.env.SWAPFILE || '/swapfile',
  nodeEnv: process.env.NODE_ENV || 'development',
  panelDistDir: path.resolve(import.meta.dirname, '../../bedrock-server/dist'),
}

export default config
