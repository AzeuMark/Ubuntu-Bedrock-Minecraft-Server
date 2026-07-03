// Fetch helper that talks to the backend API. Adds credentials (the session
// cookie) to every request, parses JSON, and surfaces a consistent error shape.
// On a 401 from an authenticated request the caller should redirect to /login.

const API_BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin', // send the session cookie
    'Content-Type': options.body ? 'application/json' : undefined,
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  let data
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = { ok: false, error: await res.text() }
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  me: () => request('/me'),
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  logout: () => request('/logout', { method: 'POST' }),
  status: () => request('/status'),
  power: (action) => request(`/power/${action}`, { method: 'POST' }),
  getSwap: () => request('/swap'),
  setSwap: (sizeGb) => request('/swap', { method: 'POST', body: { sizeGb } }),
  getLogs: () => request('/logs'),
  logsStreamUrl: () => `${API_BASE}/logs/stream`,
  consoleSend: (command) => request('/console', { method: 'POST', body: { command } }),
  getProperties: () => request('/properties'),
  setProperties: (entries) => request('/properties', { method: 'POST', body: { entries } }),
  listFiles: (path) => request(`/files?path=${encodeURIComponent(path)}`),
  getFileContent: (path) => request(`/files/content?path=${encodeURIComponent(path)}`),
  setFileContent: (path, content) => request('/files/content', { method: 'POST', body: { path, content } }),
  downloadFile: (path) => `${API_BASE}/files/download?path=${encodeURIComponent(path)}`,
  uploadFile: (path, file) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${API_BASE}/files/upload?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    }).then(r => r.json())
  },
  deleteFile: (path) => request('/files/delete', { method: 'POST', body: { path } }),
  backupDownloadUrl: () => `${API_BASE}/backup/download`,
  restoreBackup: (file) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${API_BASE}/backup/restore`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    }).then(async (r) => {
      const data = await r.json()
      if (!r.ok) throw Object.assign(new Error(data.error || 'Restore failed'), { status: r.status, data })
      return data
    })
  },
}

export default api
