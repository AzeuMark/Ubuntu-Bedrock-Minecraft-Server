import { useEffect, useState, useRef } from 'react'
import api from '../api'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'

export default function Dashboard() {
  const [running, setRunning] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [busy, setBusy] = useState(false) // a power action is in progress
  const [msg, setMsg] = useState(null) // { type, text }

  // Swap state
  const [swap, setSwap] = useState(null) // { ram, swap } or null
  const [swapSize, setSwapSize] = useState('')
  const [swapBusy, setSwapBusy] = useState(false)

  const statusTimer = useRef(null)

  const refreshStatus = async () => {
    try {
      const data = await api.status()
      setRunning(data.running)
    } catch {
      // ignore transient errors during polling
    } finally {
      setStatusLoading(false)
    }
  }

  const refreshSwap = async () => {
    try {
      const data = await api.getSwap()
      setSwap(data)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refreshStatus()
    refreshSwap()
    statusTimer.current = setInterval(refreshStatus, 3000) // poll every 3s
    return () => clearInterval(statusTimer.current)
  }, [])

  const powerAction = async (action) => {
    setBusy(true)
    setMsg(null)
    try {
      const result = await api.power(action)
      if (!result.ok && result.message === 'failed to start') {
        setMsg({ type: 'error', text: 'Failed to start the server. Is the bedrock binary present and executable on the VPS?' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Power action failed.' })
    } finally {
      setBusy(false)
      setTimeout(refreshStatus, 500)
    }
  }

  const applySwap = async () => {
    const sizeGb = Number(swapSize)
    if (!Number.isFinite(sizeGb) || sizeGb < 1 || sizeGb > 64) {
      setMsg({ type: 'error', text: 'Swap size must be a number between 1 and 64 GB.' })
      return
    }
    setSwapBusy(true)
    setMsg(null)
    try {
      await api.setSwap(sizeGb)
      setMsg({ type: 'success', text: `Swap resized to ${sizeGb} GB.` })
      setSwapSize('')
      refreshSwap()
    } catch (err) {
      if (err.status === 409) {
        setMsg({ type: 'warn', text: err.data?.error || 'Please stop the server first before changing the swap size.' })
      } else {
        setMsg({ type: 'error', text: err.data?.error || 'Could not resize swap (run this on the Ubuntu VPS with the sudoers rule installed).' })
      }
    } finally {
      setSwapBusy(false)
    }
  }

  const fmt = (o) => (o ? `${o.used} / ${o.total}` : '—')

  return (
    <>
      <div className="topbar">
        <h1>Dashboard</h1>
        <ThemeToggle />
      </div>

      {msg && <div className={`banner banner-${msg.type}`}>{msg.text}</div>}

      {/* Server control card */}
      <div className="card">
        <h2>Server control</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatusBadge running={running} loading={statusLoading} />
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            The game runs inside a <code>screen</code> session named "bedrock".
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => powerAction('start')} disabled={busy || running}>
            ▶ Start
          </button>
          <button className="btn-danger" onClick={() => powerAction('stop')} disabled={busy || !running}>
            ■ Stop
          </button>
          <button className="btn-warn" onClick={() => powerAction('restart')} disabled={busy || !running}>
            ↻ Restart
          </button>
        </div>
      </div>

      {/* Memory & Swap card */}
      <div className="card">
        <h2>Memory & Swap</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>RAM (used / total)</div>
            <div style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>{fmt(swap?.ram)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>Swap (used / total)</div>
            <div style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>{fmt(swap?.swap)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 140 }}>
            <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>New swap size (GB)</label>
            <input
              type="number"
              min="1"
              max="64"
              value={swapSize}
              onChange={(e) => setSwapSize(e.target.value)}
              placeholder="4"
            />
          </div>
          <button className="btn-primary" onClick={applySwap} disabled={swapBusy}>
            {swapBusy ? 'Applying…' : 'Apply'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          Resizing swap requires the server to be stopped first. The backend follows the guide's
          "Resizing Swap" sequence (swapoff → fallocate → chmod → mkswap → swapon).
        </p>
      </div>
    </>
  )
}
