import { Router } from 'express'
import { isRunning } from '../lib/screen.js'

const router = Router()

// GET /api/status
router.get('/', async (_req, res) => {
  try {
    const running = await isRunning()
    res.json({ ok: true, running })
  } catch (err) {
    console.error('[status] error:', err)
    res.status(500).json({ ok: false, error: 'Failed to check server status', running: false })
  }
})

export default router
