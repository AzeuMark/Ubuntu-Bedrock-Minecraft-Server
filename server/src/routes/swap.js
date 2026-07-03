import { Router } from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isRunning } from '../lib/screen.js'
import sudo from '../lib/sudoers.js'

const execFileP = promisify(execFile)
const router = Router()

// GET /api/swap
// Parses `free -h` output to report current RAM and swap usage.
// Cite: Ubuntu Bedrock guide step 9 (free -h).
router.get('/', async (_req, res) => {
  try {
    const { stdout } = await execFileP('free', ['-h'], { windowsHide: true }).catch(() => ({ stdout: '' }))
    const parsed = parseFreeH(stdout)
    res.json({ ok: true, ...parsed })
  } catch (err) {
    console.error('[swap] status error:', err)
    res.status(200).json({ ok: true, ram: null, swap: null, raw: '', note: 'free -h not available on this host' })
  }
})

// POST /api/swap  body: { sizeGb: number }
// Resizes the swap file via the guide's "Resizing Swap" sequence (cite: guide step 5):
//   swapoff -> fallocate -l <N>G -> chmod 600 -> mkswap -> swapon
// /etc/fstab is NOT touched (the guide says you don't need to edit it again).
router.post('/', async (req, res) => {
  const sizeGb = Number(req.body && req.body.sizeGb)
  if (!Number.isFinite(sizeGb) || sizeGb < 1 || sizeGb > 64) {
    return res.status(400).json({ ok: false, error: 'sizeGb must be a number between 1 and 64' })
  }

  // Stop-server-first rule (consistent safety across the panel).
  let running
  try {
    running = await isRunning()
  } catch {
    running = false
  }
  if (running) {
    return res
      .status(409)
      .json({ ok: false, error: 'Please stop the server first before changing the swap size.' })
  }

  try {
    // Run the guide's "Resizing Swap" sequence (cite: step 5) step by step so a
    // failure tells us which command broke. Each helper swallows the error and
    // returns either the success result ({stdout,stderr}) or the Error.
    const steps = [
      ['swapoff', sudo.swapoff()],
      ['fallocate', sudo.fallocate(sizeGb)],
      ['chmod', sudo.chmodSwap()],
      ['mkswap', sudo.mkswap()],
      ['swapon', sudo.swapon()],
    ]
    const failures = []
    for (const [name, result] of steps) {
      if (result instanceof Error) {
        console.error(`[swap] ${name} failed:`, result.message)
        failures.push({ name, message: result.message })
      }
    }
    if (failures.length > 0) {
      res.status(500).json({ ok: false, error: 'Failed to resize swap. Ensure the sudoers rule is installed (Phase 7) and the server is not running.' })
      return
    }
    res.json({ ok: true, sizeGb })
  } catch (err) {
    console.error('[swap] resize error:', err)
    res.status(500).json({ ok: false, error: 'Failed to resize swap. Ensure the sudoers rule is installed (Phase 7) and the server is not running.' })
  }
})

export default router

// Naive parser for `free -h` output:
//                 total   used   free   shared  buff/cache  available
//   Mem:           2.0Gi  1.0Gi  400Mi  ...     600Mi       800Mi
//   Swap:          2.0Gi   0.0Gi  2.0Gi
function parseFreeH(stdout) {
  const lines = stdout.split('\n')
  const memLine = lines.find((l) => /^Mem:/.test(l))
  const swapLine = lines.find((l) => /^Swap:/.test(l))
  const pick = (line, label) => {
    if (!line) return null
    const cols = line.trim().split(/\s+/).slice(1, 4)
    return cols.length >= 3
      ? { total: cols[0], used: cols[1], free: cols[2] }
      : null
  }
  return {
    ram: pick(memLine, 'Mem'),
    swap: pick(swapLine, 'Swap'),
    raw: stdout || '',
  }
}
