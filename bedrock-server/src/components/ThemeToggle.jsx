import { useEffect, useState } from 'react'
import { THEME_STORAGE_KEY } from '../theme'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light')
    setDark(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ fontSize: '1.1rem', lineHeight: 1, padding: '6px 10px' }}
    >
      {dark ? '☀' : '☾'}
    </button>
  )
}
