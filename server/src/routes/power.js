import { Router } from 'express'
import screen from '../lib/screen.js'

const router = Router()

// POST /api/power/start | /stop | /restart
const actionMap = {
  start: screen.start,
  stop: screen.stop,
  restart: screen.restart,
}

router.post('/:action', async (req, res) => {
  const { action } = req.params
  const fn = actionMap[action]
  if (!fn) return res.status(400).json({ ok: false, error: 'Unknown action' })
  try {
    const result = await fn()
    res.json(result)
  } catch (err) {
    console.error(`[power:${action}] error:`, err)
    res.status(500).json({ ok: false, error: 'Power action failed' })
  }
})

export default router
