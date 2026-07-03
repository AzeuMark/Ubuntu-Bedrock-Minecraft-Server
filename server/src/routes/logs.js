import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'

const router = Router()
const LOG_DIR = () => path.resolve(config.bedrockDir, 'logs')

/**
 * Find the newest log file in BEDROCK_DIR/logs/ by modification time.
 * Returns the full path, or null if no log file exists.
 */
function findNewestLog() {
  try {
    const dir = LOG_DIR()
    if (!fs.existsSync(dir)) return null
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.txt') || f.endsWith('.log'))
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
    return files.length > 0 ? path.join(dir, files[0].name) : null
  } catch {
    return null
  }
}

/**
 * Read the last N lines from a file efficiently.
 */
function readTail(filePath, numLines) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  return lines.slice(-numLines)
}

// GET /api/logs — return the last 200 lines to seed the page
router.get('/', (req, res) => {
  const newest = findNewestLog()
  if (!newest) return res.json({ lines: [] })
  const lines = readTail(newest, 200)
  res.json({ lines, file: path.basename(newest) })
})

// GET /api/logs/stream — SSE endpoint that pushes new log lines live
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const dir = LOG_DIR()
  let currentFile = null
  let currentSize = 0

  function refreshFile() {
    const newest = findNewestLog()
    if (!newest) {
      currentFile = null
      currentSize = 0
      return
    }
    try {
      const stat = fs.statSync(newest)
      currentFile = newest
      currentSize = stat.size
    } catch {
      currentFile = null
      currentSize = 0
    }
  }

  refreshFile()

  // Send keepalive every 30 s so proxies don't close the connection
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 30_000)

  // Watch the logs directory for file changes / rotations
  let watcher
  try {
    watcher = fs.watch(dir, (_eventType) => {
      const newest = findNewestLog()
      if (!newest) return

      // File rotation — a newer file appeared
      if (newest !== currentFile) {
        try {
          const stat = fs.statSync(newest)
          const content = fs.readFileSync(newest, 'utf-8')
          const lines = content.split('\n').filter(l => l.length > 0)
          for (const line of lines) {
            res.write(`data: ${JSON.stringify(line)}\n\n`)
          }
          currentFile = newest
          currentSize = stat.size
        } catch { /* ignore */ }
        return
      }

      // Same file — read only the new bytes since last check
      try {
        const stat = fs.statSync(newest)
        if (stat.size > currentSize) {
          const fd = fs.openSync(newest, 'r')
          const buf = Buffer.alloc(stat.size - currentSize)
          fs.readSync(fd, buf, 0, buf.length, currentSize)
          fs.closeSync(fd)
          const newContent = buf.toString('utf-8')
          const lines = newContent.split('\n').filter(l => l.length > 0)
          for (const line of lines) {
            res.write(`data: ${JSON.stringify(line)}\n\n`)
          }
          currentSize = stat.size
        }
      } catch { /* ignore */ }
    })
  } catch {
    // Log directory doesn't exist yet — stream stays open, waiting
  }

  req.on('close', () => {
    clearInterval(keepalive)
    if (watcher) watcher.close()
  })
})

export default router
