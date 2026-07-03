import { useEffect, useRef, useState } from 'react'
import api from '../api'

export default function Backups() {
  const [serverRunning, setServerRunning] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const fileInputRef = useRef(null)

  useEffect(() => {
    api.status()
      .then(d => { setServerRunning(d.running); setStatusLoading(false) })
      .catch(() => setStatusLoading(false))
  }, [])

  function handleDownload() {
    if (!confirm('Download the current world as a .zip? This may take a moment for large worlds.')) return
    window.open(api.backupDownloadUrl())
  }

  async function handleFilePick(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      setError('Please select a .zip file.')
      setSuccess(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (!confirm(`Restore world from "${file.name}"? The current world will be backed up to worlds.bak-… and replaced.`)) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (serverRunning) {
      setError('The server is running. Stop it first to restore a world.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setRestoring(true)
    setError(null)
    setSuccess(null)

    try {
      const data = await api.restoreBackup(file)
      setSuccess(`World restored successfully! Previous world saved to "${data.backupDir}".`)
    } catch (err) {
      if (err.status === 409) {
        setError('Please stop the server first before restoring a world.')
      } else {
        setError(err.data?.error || err.message || 'Restore failed.')
      }
    } finally {
      setRestoring(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="page-backups">
      <div className="page-header">
        <h1>Backups</h1>
        <div className="page-header-actions">
          <span className={`connection-dot ${serverRunning ? 'connected' : 'disconnected'}`}
            title={serverRunning ? 'Server running' : 'Server stopped'} />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {serverRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {success && <div className="banner banner-success">{success}</div>}
      {serverRunning && (
        <div className="banner banner-warn">
          The server is running. You can download a backup, but restore is blocked for safety.
        </div>
      )}

      <div className="card">
        <h2>Download</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Download the current world as a timestamped .zip archive. Safe to do while the server is running.
        </p>
        <button className="btn-primary" onClick={handleDownload} disabled={statusLoading}>
          Download current world (.zip)
        </button>
      </div>

      <div className="card">
        <h2>Restore</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Upload a .zip file to replace the current world. The old world is renamed to <code>worlds.bak-&lt;timestamp&gt;</code> so you can roll back.
        </p>
        <p className="muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
          <strong>Note:</strong> The server must be stopped before restoring.
        </p>
        <button
          className="btn-warn"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring || statusLoading}
        >
          {restoring ? 'Restoring…' : 'Upload .zip and restore'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFilePick}
        />
      </div>
    </div>
  )
}
