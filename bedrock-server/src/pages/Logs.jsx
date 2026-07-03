import useLogStream from '../components/LogStream'

export default function Logs() {
  const { lines, paused, connected, error, scrollRef, setPaused, handleClear } = useLogStream()

  return (
    <div className="page-logs">
      <div className="page-header">
        <h1>Logs</h1>
        <div className="page-header-actions">
          {error && <span className="error-banner-inline">{error}</span>}
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}
            title={connected ? 'Connected' : 'Disconnected'} />
          <button className="btn btn-sm" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn btn-sm" onClick={handleClear}>Clear</button>
        </div>
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
    </div>
  )
}
