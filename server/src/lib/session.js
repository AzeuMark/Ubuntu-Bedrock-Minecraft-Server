import session from 'express-session'
import config from '../config.js'

export function sessionMiddleware() {
  return session({
    name: 'bedrock-panel.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      // secure: true,  // enable once HTTPS (reverse proxy) is in place (Phase 7/README)
      maxAge: 1000 * 60 * 60 * 4, // 4 hours of inactivity
    },
  })
}

export function requireAuth(req, res, next) {
  if (req.session && req.session.user === 'admin') return next()
  return res.status(401).json({ ok: false, error: 'Not authenticated' })
}

export default { sessionMiddleware, requireAuth }
