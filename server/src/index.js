import config from './config.js'
import { createApp } from './server.js'

const app = createApp()

app.listen(config.port, () => {
  console.log(`[bedrock-panel] backend listening on http://localhost:${config.port}`)
  console.log(`[bedrock-panel] bedrock dir: ${config.bedrockDir}`)
  console.log(`[bedrock-panel] node env: ${config.nodeEnv}`)
  if (config.nodeEnv !== 'production' || !require('node:fs').existsSync(config.panelDistDir)) {
    console.log('[bedrock-panel] (dev) React dev server expected on http://localhost:5173 — Vite proxies /api')
  }
})
