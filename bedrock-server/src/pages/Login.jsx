import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [alreadyIn, setAlreadyIn] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // If already logged in, bounce to the dashboard.
  useEffect(() => {
    api
      .me()
      .then((data) => {
        if (data.loggedIn) {
          setAlreadyIn(true)
          const dest = location.state?.from?.pathname || '/'
          navigate(dest, { replace: true })
        }
      })
      .catch(() => {})
  }, [navigate, location])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login(password)
      const dest = location.state?.from?.pathname || '/'
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.status === 401 ? 'Invalid password' : 'Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 320,
          padding: 28,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <h1 style={{ textAlign: 'center', marginBottom: 6 }}>⛏ Bedrock Panel</h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 22, fontSize: '0.9rem' }}>
          Sign in to manage your server
        </p>

        <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Admin password</label>
        <input
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          disabled={loading || alreadyIn}
        />

        {error && <div className="banner banner-error" style={{ marginTop: 12 }}>{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading || !password} style={{ width: '100%', marginTop: 16 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
