import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import config from './config.js'
import { sessionMiddleware } from './lib/session.js'
import authRoutes from './routes/auth.js'
import statusRoutes from './routes/status.js'
import powerRoutes from './routes/power.js'
import swapRoutes from './routes/swap.js'
import logsRoutes from './routes/logs.js'
import consoleRoutes from './routes/console.js'
import propertiesRoutes from './routes/properties.js'
import filesRoutes from './routes/files.js'
import backupRoutes from './routes/backup.js'
import { requireAuth } from './lib/session.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())
  app.use(sessionMiddleware())

  // --- API routes ---
  // authRoutes defines /login, /logout, /me -> mounted at /api gives /api/login, /api/logout, /api/me
  app.use('/api', authRoutes)
  app.use('/api/status', requireAuth, statusRoutes)
  app.use('/api/power', requireAuth, powerRoutes)
  app.use('/api/swap', requireAuth, swapRoutes)
  app.use('/api/logs', requireAuth, logsRoutes)
  app.use('/api/console', requireAuth, consoleRoutes)
  app.use('/api/properties', requireAuth, propertiesRoutes)
  app.use('/api/files', requireAuth, filesRoutes)
  app.use('/api/backup', requireAuth, backupRoutes)

  // Healthcheck (public) — used by the frontend to detect backend liveness.
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // --- Serve built React panel as static assets (single-port app) ---
  // In dev, the React dev server (Vite) runs separately on 5173 — nothing to serve here.
  // In prod, we serve ../bedrock-server/dist and fall back to index.html for client-side routing.
  if (fs.existsSync(config.panelDistDir)) {
    app.use(express.static(config.panelDistDir))
    // Express 5 uses path-to-regexp v8, which requires a named wildcard.
    // {*pal} matches any path; we route non-API requests to the SPA index.html.
    app.get('{*pal}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      const indexPath = path.join(config.panelDistDir, 'index.html')
      if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
      next()
    })
  }

  return app
}

export default createApp
