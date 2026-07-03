import { useEffect, useRef, useState } from 'react'
import api from '../api'

const TEXT_EXTS = new Set([
  '.json', '.txt', '.properties', '.log', '.yml', '.yaml', '.xml',
  '.html', '.htm', '.css', '.js', '.md', '.toml', '.cfg', '.conf', '.ini',
])

function formatSize(bytes) {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let unitIdx = 0
  let size = bytes
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024
    unitIdx++
  }
  return `${size.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`
}

function formatTime(ms) {
  const d = new Date(ms)
  return d.toLocaleString()
}

export default function Files() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [serverRunning, setServerRunning] = useState(false)
  const [editing, setEditing] = useState(null) // { path, content, name }
  const [editorContent, setEditorContent] = useState('')
  const [savingEditor, setSavingEditor] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const isWorldsPath = currentPath === 'worlds' || currentPath.startsWith('worlds/')
  const worldsBlocked = isWorldsPath && serverRunning

  useEffect(() => {
    api.status().then(d => setServerRunning(d.running)).catch(() => {})
  }, [])

  function fetchDir(dirPath) {
    setLoading(true)
    setError(null)
    setEditing(null)
    api.listFiles(dirPath)
      .then((data) => {
        setCurrentPath(data.path || '')
        setEntries(data.entries || [])
      })
      .catch((err) => setError(err.data?.error || err.message || 'Failed to list directory'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDir('')
  }, [])

  function navigateTo(relPath) {
    fetchDir(relPath)
  }

  // Breadcrumb segments
  const segments = currentPath.split('/').filter(Boolean)
  function breadcrumbTo(idx) {
    const parts = segments.slice(0, idx + 1)
    fetchDir(parts.join('/'))
  }

  function handleFileClick(entry) {
    if (entry.type === 'dir') {
      const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name
      navigateTo(rel)
      return
    }

    const ext = '.' + entry.name.split('.').pop()
    if (!TEXT_EXTS.has(ext)) {
      // Binary — trigger download
      const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name
      window.open(api.downloadFile(rel))
      return
    }

    // Open inline editor
    const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name
    setLoading(true)
    setError(null)
    api.getFileContent(rel)
      .then((data) => {
        setEditing({ path: rel, name: entry.name })
        setEditorContent(data.content || '')
      })
      .catch((err) => setError(err.data?.error || err.message || 'Failed to read file'))
      .finally(() => setLoading(false))
  }

  async function handleEditorSave() {
    if (!editing) return
    setSavingEditor(true)
    setError(null)
    try {
      await api.setFileContent(editing.path, editorContent)
      // Re-fetch to clear editor state and show success
      setEditing(null)
      fetchDir(currentPath)
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to save file')
    } finally {
      setSavingEditor(false)
    }
  }

  function handleEditorClose() {
    setEditing(null)
  }

  function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    api.uploadFile(currentPath, file)
      .then((data) => {
        if (data.ok) fetchDir(currentPath)
        else setError(data.error || 'Upload failed')
      })
      .catch((err) => setError(err.message || 'Upload failed'))
      .finally(() => {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  async function handleDelete() {
    // Placeholder — for now, nothing selected
  }

  return (
    <div className="page-files">
      <div className="page-header">
        <h1>Files</h1>
        <div className="page-header-actions">
          <span className={`connection-dot ${serverRunning ? 'connected' : 'disconnected'}`}
            title={serverRunning ? 'Server running' : 'Server stopped'} />
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {serverRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      {worldsBlocked && (
        <div className="banner banner-warn">
          The server is running. Editing files under worlds/ is blocked for safety. Stop the server first.
        </div>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      {/* Breadcrumb */}
      <div className="file-breadcrumb">
        <span className="file-breadcrumb-item" onClick={() => fetchDir('')}>root</span>
        {segments.map((seg, i) => (
          <span key={i}>
            <span className="file-breadcrumb-sep">/</span>
            <span className="file-breadcrumb-item" onClick={() => breadcrumbTo(i)}>{seg}</span>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div className="file-toolbar">
        <button className="btn btn-sm" onClick={() => fetchDir(currentPath)} disabled={loading}>
          Refresh
        </button>
        <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()} disabled={worldsBlocked || uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {/* Inline editor */}
      {editing && (
        <div className="card file-editor">
          <div className="file-editor-header">
            <h3>Editing: {editing.name}</h3>
            <div>
              <button className="btn btn-sm btn-primary" onClick={handleEditorSave} disabled={savingEditor}
                style={{ marginRight: 6 }}>
                {savingEditor ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-sm" onClick={handleEditorClose}>Cancel</button>
            </div>
          </div>
          <textarea
            className="file-editor-textarea"
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {/* File listing */}
      {loading && !editing ? (
        <div className="muted" style={{ padding: 20 }}>Loading…</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="file-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {currentPath !== '' && (
                <tr className="file-row" onClick={() => {
                  const parent = segments.slice(0, -1).join('/')
                  fetchDir(parent)
                }}>
                  <td className="file-icon">📁</td>
                  <td colSpan={3} className="muted">.. (parent)</td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.name} className="file-row" onClick={() => handleFileClick(entry)}>
                  <td className="file-icon">{entry.type === 'dir' ? '📁' : getFileIcon(entry.name)}</td>
                  <td className="file-name">{entry.name}</td>
                  <td className="file-size">{formatSize(entry.size)}</td>
                  <td className="file-mtime">{formatTime(entry.mtime)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 20, textAlign: 'center' }}>Empty directory</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function getFileIcon(name) {
  const ext = '.' + name.split('.').pop()
  if (ext === '.json') return '📋'
  if (ext === '.properties') return '⚙️'
  if (ext === '.log') return '📝'
  if (ext === '.txt') return '📄'
  if (ext === '.zip' || ext === '.mcpack' || ext === '.mcaddon' || ext === '.mcworld') return '📦'
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) return '🖼️'
  if (['.js', '.ts', '.py', '.sh', '.css', '.html'].includes(ext)) return '💻'
  return '📄'
}
