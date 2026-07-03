import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import config from '../config.js'

const execFileP = promisify(execFile)

// Thin, safe wrapper around `sudo` for ONLY the whitelisted commands in
// /etc/sudoers.d/bedrock-panel (installed in Phase 7). Every argument here is
// controlled by us (never raw user input) so the sudoers allow-list cannot be
// abused to run arbitrary commands. We always pass arguments as an array
// (never a shell string) to prevent shell injection.
//
// NOTE for local dev: on Windows or a machine without the sudoers rule, these
// calls will fail. That is expected — the swap routes handle the failure and
// return a clear error. See the sudoers rule template in server/deploy/.

export function runSudo(args) {
  return execFileP('sudo', ['-n', ...args], { windowsHide: true })
}

export async function swapoff() {
  return runSudo(['swapoff', config.swapfile]).catch((e) => e)
}

export async function fallocate(sizeGb) {
  const sizeArg = `${sizeGb}G`
  return runSudo(['fallocate', '-l', sizeArg, config.swapfile]).catch((e) => e)
}

export async function chmodSwap() {
  return runSudo(['chmod', '600', config.swapfile]).catch((e) => e)
}

export async function mkswap() {
  return runSudo(['mkswap', config.swapfile]).catch((e) => e)
}

export async function swapon() {
  return runSudo(['swapon', config.swapfile]).catch((e) => e)
}

export default { runSudo, swapoff, fallocate, chmodSwap, mkswap, swapon }
