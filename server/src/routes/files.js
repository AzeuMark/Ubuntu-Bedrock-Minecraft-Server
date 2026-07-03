import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import config from '../config.js'
import { resolveInside } from '../lib/paths.js'
import { streamDownload } from '../lib/archive.js'
import { isRunning } from '../lib/screen.js'

const router = Router()
// Ensure upload tmp dir exists
const TMP_DIR = config.bedrockDir + '/.upload-tmp'
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
const upload = multer({ dest: TMP_DIR })

const BASE = () => config.bedrockDir

// Text file extensions that can be previewed/edited inline
const TEXT_EXTS = new Set([
  '.txt', '.json', '.properties', '.log', '.yml', '.yaml', '.xml',
  '.html', '.htm', '.css', '.js', '.md', '.toml', '.cfg', '.conf', '.ini',
])

/** Guard: if path is under worlds/ and server is running, return 409 */
async function worldsGuard(relPath) {
  if (relPath.startsWith('worlds/') || relPath === 'worlds') {
    const running = await isRunning()
    if (running) {
      const err = new Error('Please stop the server first before changing files in the worlds/ folder.')
      err.status = 409
      throw err
    }
  }
}

// GET /api/files?path=<rel> — list directory (one level)
router.get('/', (req, res) => {
  try {
    const rel = (req.query.path || '')
    const dirPath = resolveInside(BASE(), rel)
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ ok: false, error: 'Path not found.' })
    }
    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return res.status(400).json({ ok: false, error: 'Not a directory.' })
    }

    const entries = fs.readdirSync(dirPath).map((name) => {
      const full = path.join(dirPath, name)
      let stat
      try { stat = fs.statSync(full) } catch { return null }
      return {
        name,
        type: stat.isDirectory() ? 'dir' : 'file',
        size: stat.isDirectory() ? 0 : stat.size,
        mtime: stat.mtimeMs,
      }
    }).filter(Boolean)

    // dirs first, then alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    res.json({ ok: true, path: rel || '/', entries })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ ok: false, error: err.message || 'Failed to list directory.' })
  }
})

// GET /api/files/content?path=<rel> — read a text file
router.get('/content', (req, res) => {
  try {
    const rel = req.query.path || ''
    if (!rel) return res.status(400).json({ ok: false, error: 'path is required.' })

    const filePath = resolveInside(BASE(), rel)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'File not found.' })
    }
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      return res.status(400).json({ ok: false, error: 'Not a file.' })
    }

    const ext = path.extname(filePath).toLowerCase()
    if (!TEXT_EXTS.has(ext)) {
      return res.status(415).json({ ok: false, error: 'File type cannot be previewed inline. Use download instead.' })
    }

    // Cap at 1 MB for inline reading
    const MAX_SIZE = 1024 * 1024
    if (stat.size > MAX_SIZE) {
      return res.status(413).json({ ok: false, error: 'File too large to preview inline (max 1 MB).' })
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    res.json({ ok: true, path: rel, content, size: stat.size })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ ok: false, error: err.message || 'Failed to read file.' })
  }
})

// POST /api/files/content — write a text file (stop-first for worlds/)
router.post('/content', async (req, res) => {
  try {
    const { path: rel, content } = req.body || {}
    if (!rel) return res.status(400).json({ ok: false, error: 'path is required.' })

    await worldsGuard(rel)

    const filePath = resolveInside(BASE(), rel)
    // Atomic write: write to tmp, then rename
    const tmpFile = filePath + '.tmp'
    fs.writeFileSync(tmpFile, content || '', 'utf-8')
    fs.renameSync(tmpFile, filePath)

    res.json({ ok: true, path: rel })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ ok: false, error: err.message || 'Failed to write file.' })
  }
})

// GET /api/files/download?path=<rel> — download file or folder as zip
router.get('/download', (req, res) => {
  try {
    const rel = req.query.path || ''
    if (!rel) return res.status(400).json({ ok: false, error: 'path is required.' })

    const filePath = resolveInside(BASE(), rel)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Path not found.' })
    }

    streamDownload(res, filePath, rel)
  } catch (err) {
    const status = err.status || 500
    if (!res.headersSent) res.status(status).json({ ok: false, error: err.message || 'Download failed.' })
  }
})

// POST /api/files/upload?path=<rel_dir> — upload a file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const rel = req.query.path || ''
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded.' })

    await worldsGuard(rel)

    const dirPath = resolveInside(BASE(), rel)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    const destPath = path.join(dirPath, req.file.originalname)
    fs.renameSync(req.file.path, destPath)

    res.json({ ok: true, name: req.file.originalname })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ ok: false, error: err.message || 'Upload failed.' })
  }
})

// POST /api/files/delete — delete a file or empty directory
router.post('/delete', async (req, res) => {
  try {
    const { path: rel } = req.body || {}
    if (!rel) return res.status(400).json({ ok: false, error: 'path is required.' })
    if (rel === '' || rel === '/') return res.status(400).json({ ok: false, error: 'Cannot delete the root directory.' })

    await worldsGuard(rel)

    const filePath = resolveInside(BASE(), rel)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Path not found.' })
    }

    fs.rmSync(filePath, { recursive: true, force: true })
    res.json({ ok: true, path: rel })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ ok: false, error: err.message || 'Delete failed.' })
  }
})

export default router
