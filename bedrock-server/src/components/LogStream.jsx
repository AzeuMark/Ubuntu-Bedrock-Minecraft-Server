import { useEffect, useRef, useState } from 'react'
import api from '../api'

const STORAGE_KEY = 'bedrock-panel-lines'
const MAX_LINES = 5000

function loadStoredLines() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function useLogStream() {
  const [lines, setLines] = useState(loadStoredLines)
  const [paused, setPaused] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const isAtBottomRef = useRef(true)

  // Track whether the user is scrolled to the bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      const threshold = 20
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }
    el.addEventListener('scroll', check, { passive: true })
    check()
    return () => el.removeEventListener('scroll', check)
  }, [])

  // Auto-scroll when new lines arrive (only if user is at bottom)
  useEffect(() => {
    if (!paused && isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, paused])

  // Persist lines to sessionStorage (bounded)
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines.slice(-MAX_LINES)))
    } catch { /* quota exceeded, ignore */ }
  }, [lines])

  // Seed fetch + SSE stream
  useEffect(() => {
    let eventSource = null
    let reconnectTimer = null
    let reconnectDelay = 1000

    api
      .getLogs()
      .then((data) => {
        if (data.lines && data.lines.length > 0) {
          setLines((prev) => {
            if (prev.length === 0) return data.lines
            return prev
          })
        }
      })
      .catch(() => { /* logs dir may not exist yet */ })

    function connect() {
      if (eventSource) eventSource.close()
      eventSource = new EventSource(api.logsStreamUrl())
      setConnected(true)
      setError(null)
      reconnectDelay = 1000

      eventSource.onmessage = (e) => {
        try {
          const line = JSON.parse(e.data)
          setLines((prev) => {
            const next = [...prev, line]
            return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
          })
        } catch { /* ignore malformed */ }
      }

      eventSource.onerror = () => {
        setConnected(false)
        setError('Connection lost. Reconnecting…')
        eventSource.close()
        eventSource = null
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
          connect()
        }, reconnectDelay)
      }
    }

    connect()

    return () => {
      if (eventSource) eventSource.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [])

  function handleClear() {
    setLines([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }

  return { lines, paused, connected, error, scrollRef, setPaused, handleClear }
}
