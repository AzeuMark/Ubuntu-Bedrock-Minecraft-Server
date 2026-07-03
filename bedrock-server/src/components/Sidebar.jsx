import { NavLink, useNavigate } from 'react-router-dom'
import api from '../api'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/logs', label: 'Logs' },
  { to: '/console', label: 'Console' },
  { to: '/properties', label: 'Server Properties' },
  { to: '/files', label: 'Files' },
  { to: '/backups', label: 'Backups' },
]

const sidebarStyle = {
  background: 'var(--color-sidebar-bg)',
  color: 'var(--color-sidebar-text)',
  padding: '20px 0',
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  position: 'sticky',
  top: 0,
}

const brandStyle = {
  padding: '0 20px 20px',
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#fff',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  marginBottom: 12,
}

const linkBase = {
  display: 'block',
  padding: '10px 20px',
  color: 'inherit',
  textDecoration: 'none',
  fontSize: '0.95rem',
  borderLeft: '3px solid transparent',
}

const linkActive = {
  background: 'rgba(255,255,255,0.06)',
  borderLeftColor: 'var(--color-sidebar-active)',
  color: '#fff',
}

export default function Sidebar() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    navigate('/login')
  }

  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>⛏ Bedrock Panel</div>
      <nav style={{ flex: 1 }}>
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            style={({ isActive }) => (isActive ? { ...linkBase, ...linkActive } : linkBase)}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={handleLogout}
        style={{
          margin: '0 16px',
          background: 'transparent',
          color: 'var(--color-sidebar-text)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        Log out
      </button>
    </aside>
  )
}
