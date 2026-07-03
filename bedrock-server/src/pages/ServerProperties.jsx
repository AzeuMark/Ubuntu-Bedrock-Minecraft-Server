import { useEffect, useState, useCallback } from 'react'
import api from '../api'

const GROUP_ORDER = ['Game', 'Network', 'World', 'Players', 'Other']

export default function ServerProperties() {
  const [entries, setEntries] = useState([])
  const [unknownKeys, setUnknownKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [serverRunning, setServerRunning] = useState(false)
  const [missing, setMissing] = useState(false)
  const [restartHint, setRestartHint] = useState(false)

  const fetchProperties = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getProperties()
      if (data.missing) {
        setMissing(true)
        setEntries([])
      } else {
        setMissing(false)
        setEntries(data.entries || [])
        setUnknownKeys(data.unknownKeys || [])
      }
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to load properties')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProperties()
    api.status().then(d => setServerRunning(d.running)).catch(() => {})
  }, [fetchProperties])

  function handleChange(key, value) {
    setEntries((prev) => prev.map(e => e.key === key ? { ...e, value } : e))
    setError(null)
    setSuccess(null)
    setRestartHint(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await api.setProperties(
        entries.map(e => ({ key: e.key, value: String(e.value) }))
      )
      setSuccess('Properties saved successfully.')
      setRestartHint(data.restartHint && data.running)
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to save properties')
    } finally {
      setSaving(false)
    }
  }

  function handleRestart() {
    api.power('restart').catch(() => {})
    setRestartHint(false)
    setSuccess('Server restarting…')
  }

  // Group entries
  const groups = {}
  for (const entry of entries) {
    const g = entry.group || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(entry)
  }

  if (loading) return <div className="muted" style={{ padding: 20 }}>Loading properties…</div>

  if (missing) {
    return (
      <div className="page-properties">
        <div className="page-header"><h1>Server Properties</h1></div>
        <div className="banner banner-warn">
          server.properties not found. Start the server first to generate it, then come back here to edit.
        </div>
      </div>
    )
  }

  return (
    <div className="page-properties">
      <div className="page-header">
        <h1>Server Properties</h1>
        <div className="page-header-actions">
          <button className="btn btn-sm" onClick={fetchProperties} disabled={loading}>Reset</button>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {success && <div className="banner banner-success">{success}</div>}
      {restartHint && (
        <div className="banner banner-warn">
          Some changes only apply after restarting the server.{' '}
          <button className="btn btn-sm btn-warn" onClick={handleRestart} style={{ marginLeft: 8 }}>
            Restart now
          </button>
        </div>
      )}
      {unknownKeys.length > 0 && (
        <div className="banner banner-warn">
          Unknown keys in file (shown read-only): {unknownKeys.join(', ')}
        </div>
      )}

      <form onSubmit={handleSave}>
        {GROUP_ORDER.filter(g => groups[g]).map((group) => (
          <div key={group} className="card properties-group">
            <h2>{group}</h2>
            {groups[group].map((entry) => (
              <div key={entry.key} className="property-field">
                <label className="property-label">
                  {entry.key}
                  {entry.unknown && <span className="muted" style={{ marginLeft: 6, fontSize: '0.8rem' }}>(unknown)</span>}
                </label>
                <FormField entry={entry} onChange={handleChange} />
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn-primary" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FormField({ entry, onChange }) {
  if (entry.unknown) {
    return <input type="text" value={entry.value} disabled />
  }

  if (entry.type === 'bool') {
    return (
      <select
        value={String(entry.value)}
        onChange={(e) => onChange(entry.key, e.target.value === 'true')}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }

  if (entry.type === 'enum' && entry.enumValues) {
    return (
      <select
        value={entry.value}
        onChange={(e) => onChange(entry.key, e.target.value)}
      >
        {entry.enumValues.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    )
  }

  if (entry.type === 'int') {
    return (
      <input
        type="number"
        value={entry.value}
        min={entry.min}
        max={entry.max}
        onChange={(e) => onChange(entry.key, e.target.value)}
      />
    )
  }

  // string
  return (
    <input
      type="text"
      value={entry.value}
      onChange={(e) => onChange(entry.key, e.target.value)}
    />
  )
}
