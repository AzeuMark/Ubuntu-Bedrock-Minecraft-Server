import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import config from '../config.js'
import { isRunning } from '../lib/screen.js'
import { resolveInside } from '../lib/paths.js'

const router = Router()

const WORLDS_DIR = () => path.join(config.bedrockDir, 'worlds')

// Ensure upload tmp dir exists
const TMP_DIR = config.bedrockDir + '/.backup-tmp'
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
const upload = multer({ dest: TMP_DIR, limits: { fileSize: 1024 * 1024 * 1024 } }) // 1 GB max

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

// GET /api/backup/download — stream worlds/ as a timestamped .zip
router.get('/download', (req, res) => {
  const worldsDir = WORLDS_DIR()
  if (!fs.existsSync(worldsDir)) {
    return res.status(404).json({ ok: false, error: 'No worlds directory found.' })
  }

  const filename = `bedrock-worlds-${timestamp()}.zip`
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', (err) => {
    console.error('[backup] archive error:', err)
    if (!res.headersSent) res.status(500).end()
  })
  archive.pipe(res)
  archive.directory(worldsDir, 'worlds')
  archive.finalize()
})

// POST /api/backup/restore — restore a world from an uploaded .zip
router.post('/restore', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded.' })

    // Stop-first guard
    const running = await isRunning()
    if (running) {
      // Clean up the uploaded file
      fs.rmSync(req.file.path, { force: true })
      return res.status(409).json({ ok: false, error: 'Please stop the server first before restoring a world.' })
    }

    const worldsDir = WORLDS_DIR()

    // Validate the uploaded zip and check for path traversal
    let zip
    try {
      zip = new AdmZip(req.file.path)
    } catch {
      fs.rmSync(req.file.path, { force: true })
      return res.status(400).json({ ok: false, error: 'Invalid zip file.' })
    }

    // Check every entry for path traversal
    const entries = zip.getEntries()
    if (entries.length === 0) {
      fs.rmSync(req.file.path, { force: true })
      return res.status(400).json({ ok: false, error: 'Zip file is empty.' })
    }

    // The zip should contain a worlds/ folder (or flat world files)
    // Validate that no entry escapes the worlds/ boundary
    for (const entry of entries) {
      if (entry.entryName.includes('..')) {
        fs.rmSync(req.file.path, { force: true })
        return res.status(400).json({ ok: false, error: 'Zip contains invalid path entries.' })
      }
    }

    // Strip the worlds/ prefix if present in the zip entries
    // Some zip archives include the worlds/ prefix, some don't
    const hasWorldsPrefix = entries.some(e => e.entryName.startsWith('worlds/'))

    // Rename current worlds/ to worlds.bak-<timestamp>/
    const bakDir = `worlds.bak-${timestamp()}`
    const bakPath = path.join(config.bedrockDir, bakDir)
    if (fs.existsSync(worldsDir)) {
      fs.renameSync(worldsDir, bakPath)
    }

    // Create fresh worlds/ directory
    fs.mkdirSync(worldsDir, { recursive: true })

    // Extract the zip
    zip.extractAllTo(worldsDir, true)

    // If the zip had a worlds/ prefix, move contents up one level
    if (hasWorldsPrefix) {
      const nested = path.join(worldsDir, 'worlds')
      if (fs.existsSync(nested)) {
        const tmpDir = path.join(config.bedrockDir, `.worlds-extract-${timestamp()}`)
        fs.renameSync(nested, tmpDir)
        // Remove the now-empty worldsDir
        fs.rmSync(worldsDir, { recursive: true, force: true })
        fs.renameSync(tmpDir, worldsDir)
      }
    }

    // Clean up uploaded zip
    fs.rmSync(req.file.path, { force: true })

    res.json({ ok: true, backupDir: bakDir })
  } catch (err) {
    console.error('[backup] restore error:', err)
    if (req.file) fs.rmSync(req.file.path, { force: true })
    res.status(500).json({ ok: false, error: err.message || 'Restore failed.' })
  }
})

export default router
