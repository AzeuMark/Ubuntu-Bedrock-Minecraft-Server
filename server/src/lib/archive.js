import archiver from 'archiver'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Stream a single file or zip a folder as a download.
 * Sets appropriate Content-Type / Content-Disposition headers.
 */
export function streamDownload(res, filePath, relPath) {
  const stat = fs.statSync(filePath)
  const name = path.basename(relPath)

  if (stat.isFile()) {
    const ext = path.extname(name).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`)
    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end()
    })
    return
  }

  // Directory — zip on the fly
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.zip"`)

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', () => {
    if (!res.headersSent) res.status(500).end()
  })
  archive.pipe(res)
  archive.directory(filePath, name)
  archive.finalize()
}

const mimeMap = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.properties': 'text/plain',
  '.log': 'text/plain',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.xml': 'text/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mcpack': 'application/zip',
  '.mcaddon': 'application/zip',
  '.mcworld': 'application/zip',
}
