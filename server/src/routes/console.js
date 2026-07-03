import { Router } from 'express'
import { execFile } from 'node:child_process'
import { SCREEN_NAME, isRunning } from '../lib/screen.js'

const router = Router()

const MAX_LENGTH = 500

// POST /api/console — send a command into the screen session stdin
router.post('/', async (req, res) => {
  // Guard: server must be running
  const running = await isRunning()
  if (!running) {
    return res.status(409).json({ ok: false, error: 'The server is not running.' })
  }

  let { command } = req.body
  if (typeof command !== 'string') {
    return res.status(400).json({ ok: false, error: 'command must be a string.' })
  }

  command = command.trim()
  if (!command) {
    return res.status(400).json({ ok: false, error: 'command cannot be empty.' })
  }

  if (command.length > MAX_LENGTH) {
    return res.status(400).json({ ok: false, error: `command must be ${MAX_LENGTH} characters or fewer.` })
  }

  // Reject embedded newlines / null bytes — one line only
  if (command.includes('\n') || command.includes('\0')) {
    return res.status(400).json({ ok: false, error: 'command must be a single line.' })
  }

  // Send the command into the screen session via execFile (never shell string)
  await new Promise((resolve, reject) => {
    execFile('screen', ['-S', SCREEN_NAME, '-X', 'stuff', `${command}\n`], (err) => {
      if (err) return reject(err)
      resolve()
    })
  })

  res.json({ ok: true, command })
})

export default router
