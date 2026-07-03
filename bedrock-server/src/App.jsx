import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import api from './api'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Logs from './pages/Logs'
import Console from './pages/Console'
import ServerProperties from './pages/ServerProperties'
import Files from './pages/Files'
import Backups from './pages/Backups'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    api
      .me()
      .then((data) => setLoggedIn(!!data.loggedIn))
      .catch(() => setLoggedIn(false))
      .finally(() => setBootstrapped(true))
  }, [])

  if (!bootstrapped) {
    return <div style={{ padding: 40 }} className="muted">Loading…</div>
  }

  if (!loggedIn) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated shell: sidebar + routed pages
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute loggedIn={loggedIn}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/logs" element={<ProtectedRoute loggedIn={loggedIn}><Logs /></ProtectedRoute>} />
          <Route path="/console" element={<ProtectedRoute loggedIn={loggedIn}><Console /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute loggedIn={loggedIn}><ServerProperties /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute loggedIn={loggedIn}><Files /></ProtectedRoute>} />
          <Route path="/backups" element={<ProtectedRoute loggedIn={loggedIn}><Backups /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
