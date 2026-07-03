import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'
import { isRunning } from '../lib/screen.js'

const router = Router()

// Known schema — every property Bedrock uses, grouped by section.
// type: 'string' | 'int' | 'bool' | 'enum'
const SCHEMA = {
  'gamemode':     { type: 'enum', values: ['survival', 'creative', 'adventure', 'spectator'], group: 'Game', default: 'survival' },
  'difficulty':   { type: 'enum', values: ['peaceful', 'easy', 'normal', 'hard'], group: 'Game', default: 'easy' },
  'server-name':  { type: 'string', group: 'Game', default: 'Dedicated Server' },
  'level-name':   { type: 'string', group: 'World', default: 'level' },
  'level-seed':   { type: 'string', group: 'World', default: '' },
  'level-type':   { type: 'enum', values: ['DEFAULT', 'FLAT', 'LEGACY', 'NETHER', 'END'], group: 'World', default: 'DEFAULT' },
  'max-players':  { type: 'int', min: 1, max: 999, group: 'Players', default: 10 },
  'online-mode':  { type: 'bool', group: 'Network', default: true },
  'server-port':  { type: 'int', min: 1, max: 65535, group: 'Network', default: 19132 },
  'server-portv6':{ type: 'int', min: 1, max: 65535, group: 'Network', default: 19133 },
  'allow-list':   { type: 'bool', group: 'Players', default: false },
  'default-player-permission-level': { type: 'enum', values: ['visitor', 'member', 'operator'], group: 'Players', default: 'member' },
  'text-cycle-packet-permission': { type: 'enum', values: ['normal', 'disabled'], group: 'Game', default: 'normal' },
  'view-distance':{ type: 'int', min: 4, max: 96, group: 'World', default: 32 },
  'tick-distance':{ type: 'int', min: 4, max: 12, group: 'World', default: 4 },
  'player-idle-timeout': { type: 'int', min: 0, max: 999999, group: 'Players', default: 30 },
  'max-threads':  { type: 'int', min: 1, max: 64, group: 'Game', default: 8 },
  'emit-server-telemetry': { type: 'bool', group: 'Network', default: true },
  'compression-algorithm': { type: 'enum', values: ['zlib', 'snappy'], group: 'Network', default: 'zlib' },
  'enable-lan-visibility': { type: 'bool', group: 'Network', default: true },
  'chat-restriction': { type: 'enum', values: ['None', 'Dropped', 'Disabled'], group: 'Game', default: 'None' },
  'disable-player-interaction': { type: 'bool', group: 'Game', default: false },
  'content-log-file-enabled': { type: 'bool', group: 'Game', default: false },
  'force-game': { type: 'string', group: 'Game', default: '' },
  'joinscreen-capability': { type: 'enum', values: ['drop-in', 'multiplayer-none'], group: 'Game', default: 'drop-in' },
}

const PROPERTIES_FILE = () => path.join(config.bedrockDir, 'server.properties')

/* A "line" is either a comment, a blank, or a parsed key=value */
function parseLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      lines.push({ type: 'raw', raw: rawLine })
    } else {
      const eqIdx = rawLine.indexOf('=')
      if (eqIdx === -1) {
        lines.push({ type: 'raw', raw: rawLine })
      } else {
        const key = rawLine.slice(0, eqIdx).trim()
        const value = rawLine.slice(eqIdx + 1).trim()
        lines.push({ type: 'entry', key, value, raw: rawLine })
      }
    }
  }
  return lines
}

function linesToFile(lines) {
  return lines.map(l => {
    if (l.type === 'raw') return l.raw
    return `${l.key}=${l.value}`
  }).join('\n')
}

function getProperties() {
  const filePath = PROPERTIES_FILE()
  if (!fs.existsSync(filePath)) return { missing: true, entries: [] }

  const lines = parseLines(filePath)
  const entries = []
  const unknownKeys = []

  for (const line of lines) {
    if (line.type !== 'entry') continue
    const schema = SCHEMA[line.key]
    if (!schema) {
      unknownKeys.push(line.key)
      entries.push({
        key: line.key,
        value: line.value,
        type: 'unknown',
        group: 'Other',
        unknown: true,
      })
    } else {
      entries.push({
        key: line.key,
        value: coerceValue(line.value, schema),
        type: schema.type,
        group: schema.group,
        enumValues: schema.values || undefined,
        min: schema.min,
        max: schema.max,
      })
    }
  }

  return { missing: false, entries, unknownKeys }
}

function coerceValue(value, schema) {
  if (schema.type === 'int') {
    const n = Number(value)
    return Number.isNaN(n) ? value : n
  }
  if (schema.type === 'bool') {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  }
  return value
}

function validateEntries(entries) {
  for (const e of entries) {
    const schema = SCHEMA[e.key]
    if (!schema) {
      return { ok: false, error: `Unknown property: "${e.key}".` }
    }

    if (schema.type === 'int') {
      const n = Number(e.value)
      if (Number.isNaN(n) || !Number.isInteger(n)) {
        return { ok: false, error: `"${e.key}" must be a whole number.` }
      }
      if (schema.min !== undefined && n < schema.min) {
        return { ok: false, error: `"${e.key}" must be at least ${schema.min}.` }
      }
      if (schema.max !== undefined && n > schema.max) {
        return { ok: false, error: `"${e.key}" must be at most ${schema.max}.` }
      }
    }

    if (schema.type === 'bool') {
      if (e.value !== true && e.value !== false) {
        return { ok: false, error: `"${e.key}" must be true or false.` }
      }
    }

    if (schema.type === 'enum') {
      if (!schema.values.includes(e.value)) {
        return { ok: false, error: `"${e.key}" must be one of: ${schema.values.join(', ')}.` }
      }
    }
  }
  return { ok: true }
}

// GET /api/properties — read the current server.properties
router.get('/', (req, res) => {
  try {
    const data = getProperties()
    if (data.missing) {
      return res.json({ ok: true, entries: [], missing: true, note: 'server.properties not found. Start the server first to generate it.' })
    }
    res.json({ ok: true, ...data })
  } catch (err) {
    console.error('[properties] GET error:', err)
    res.status(500).json({ ok: false, error: 'Failed to read server.properties.' })
  }
})

// POST /api/properties — update selected entries atomically
router.post('/', async (req, res) => {
  const { entries } = req.body || {}
  if (!Array.isArray(entries)) {
    return res.status(400).json({ ok: false, error: 'entries must be an array.' })
  }

  // Validate all entries first
  const validation = validateEntries(entries)
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.error })
  }

  const filePath = PROPERTIES_FILE()
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'server.properties not found.' })
  }

  try {
    const lines = parseLines(filePath)
    const updateMap = new Map(entries.map(e => [e.key, e.value]))

    // Apply updates while preserving comments and order
    for (const line of lines) {
      if (line.type === 'entry' && updateMap.has(line.key)) {
        line.value = String(updateMap.get(line.key))
        updateMap.delete(line.key)
      }
    }

    // Append any new keys at the end
    const running = await isRunning()
    for (const [key, value] of updateMap) {
      lines.push({ type: 'entry', key, value: String(value), raw: `${key}=${value}` })
    }

    // Atomic write
    const tmpFile = filePath + '.tmp'
    fs.writeFileSync(tmpFile, linesToFile(lines), 'utf-8')
    fs.renameSync(tmpFile, filePath)

    res.json({ ok: true, running, restartHint: running })
  } catch (err) {
    console.error('[properties] POST error:', err)
    res.status(500).json({ ok: false, error: 'Failed to write server.properties.' })
  }
})

export default router
