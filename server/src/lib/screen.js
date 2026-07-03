import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import config from '../config.js'

const execFileP = promisify(execFile)

export const SCREEN_NAME = 'bedrock'

function parseScreenList(stdout, stderr) {
  const combined = `${stdout}\n${stderr}`
  return combined
    .split('\n')
    .filter((line) => line.includes('.'))
    .map((line) => line.trim())
}

export async function listSessions() {
  try {
    const { stdout, stderr } = await execFileP('screen', ['-ls'], { windowsHide: true })
    return parseScreenList(stdout, stderr)
  } catch (err) {
    // screen -ls exits non-zero when there are no sessions
    if (err.stderr || err.stdout) {
      return parseScreenList(err.stdout || '', err.stderr || '')
    }
    return []
  }
}

export function sessionMatches(line, name = SCREEN_NAME) {
  // lines look like: "12345.bedrock  (Detached)" or "... (Dead ???)"
  if (!line.includes(`.${name}\t`) && !line.includes(`.${name} `)) return false
  if (/Dead/i.test(line)) return false
  return true
}

export function stateOf(line) {
  const m = line.match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim().toLowerCase() : 'unknown'
}

export async function isRunning() {
  const sessions = await listSessions()
  return sessions.some((line) => sessionMatches(line))
}

export function getSessionLine() {
  return listSessions().then((sessions) => sessions.find((line) => sessionMatches(line)) || null)
}

export async function start() {
  const running = await isRunning()
  if (running) return { ok: true, running: true, started: false, message: 'already running' }
  // screen -dmS <name> -L: detached session with logging. We run a shell that cd's into the
  // bedrock dir and launches the binary with LD_LIBRARY_PATH=. (cite: guide step 6 + step 8).
  const dir = config.bedrockDir
  const launcher = `cd ${JSON.stringify(dir)} && LD_LIBRARY_PATH=. ./bedrock_server`
  await runCmd('screen', ['-dmS', SCREEN_NAME, '-L', '-Logfile', 'screen.log', '--', 'sh', '-c', launcher])
  await sleep(1500)
  const now = await isRunning()
  return { ok: now, running: now, started: now, message: now ? 'started' : 'failed to start' }
}

export async function stop() {
  const running = await isRunning()
  if (!running) return { ok: true, running: false, stopped: true, message: 'already stopped' }
  // Send the graceful "stop" command into the screen session stdin (cite: guide step 8).
  await runCmd('screen', ['-S', SCREEN_NAME, '-X', 'stuff', 'stop\n'])
  // Give the server a few seconds to shut down gracefully.
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    if (!(await isRunning())) return { ok: true, running: false, stopped: true, message: 'stopped gracefully' }
  }
  // Still alive after 5s -> force-quit the screen session.
  await runCmd('screen', ['-S', SCREEN_NAME, '-X', 'quit'])
  await sleep(500)
  return { ok: !(await isRunning()), running: await isRunning(), stopped: !(await isRunning()), message: 'force-stopped' }
}

export async function restart() {
  await stop()
  return start()
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }))
      resolve({ stdout, stderr })
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export default {
  SCREEN_NAME,
  listSessions,
  isRunning,
  getSessionLine,
  start,
  stop,
  restart,
}
