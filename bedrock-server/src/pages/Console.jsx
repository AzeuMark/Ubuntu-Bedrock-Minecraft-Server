import { useEffect, useRef, useState } from 'react'
import useLogStream from '../components/LogStream'
import api from '../api'

const MAX_HISTORY = 20

export default function Console() {
  const { lines, scrollRef } = useLogStream()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState([])
  const [serverRunning, setServerRunning] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  // Poll server status so we know whether to enable the input
  useEffect(() => {
    let active = true
    let timer
    function poll() {
      api.status().then((d) => {
        if (!active) return
        setServerRunning(d.running)
        timer = setTimeout(poll, 3000)
      }).catch(() => {
        if (!active) return
        timer = setTimeout(poll, 3000)
      })
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])

  async function handleSend(e) {
    e.preventDefault()
    const cmd = input.trim()
    if (!cmd) return

    setSending(true)
    setError(null)
    try {
      await api.consoleSend(cmd)
      setHistory((prev) => [cmd, ...prev].slice(0, MAX_HISTORY))
      setInput('')
      // Re-focus the input
      inputRef.current?.focus()
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to send command')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-console">
      <div className="page-header">
        <h1>Console</h1>
      </div>

      <div className="log-box" ref={scrollRef}>
        {lines.length === 0 ? (
          <div className="log-placeholder">Waiting for log output…</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="log-line">{line}</div>
          ))
        )}
      </div>

      <form className="console-input-row" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          placeholder={serverRunning ? 'Type a command… (e.g. /say hello)' : 'Start the server first to use console'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!serverRunning || sending}
          maxLength={500}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={!serverRunning || sending || !input.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {error && <div className="banner banner-error">{error}</div>}

      {history.length > 0 && (
        <div className="console-history">
          <h3>Recent commands</h3>
          {history.map((cmd, i) => (
            <div key={i} className="console-history-item">&gt; {cmd}</div>
          ))}
        </div>
      )}
    </div>
  )
}
