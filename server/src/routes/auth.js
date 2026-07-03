import { Router } from 'express'
import bcrypt from 'bcryptjs'
import config from '../config.js'

const router = Router()

// POST /api/login  body: { password }
// Verifies the password against the bcrypt hash in .env, then sets the session.
router.post('/login', (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ ok: false, error: 'Password is required' })
  }
  bcrypt.compare(password, config.adminPasswordHash, (err, match) => {
    if (err) {
      console.error('[auth] bcrypt error:', err)
      return res.status(500).json({ ok: false, error: 'Internal error' })
    }
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid password' })
    }
    req.session.user = 'admin'
    res.json({ ok: true, user: 'admin' })
  })
})

// POST /api/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bedrock-panel.sid')
    res.json({ ok: true })
  })
})

// GET /api/me  (public — used by the frontend to decide login vs dashboard)
router.get('/me', (req, res) => {
  res.json({ ok: true, loggedIn: !!(req.session && req.session.user === 'admin') })
})

export default router
