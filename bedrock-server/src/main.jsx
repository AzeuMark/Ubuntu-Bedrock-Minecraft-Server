import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initTheme } from './theme'
import './index.css'
import App from './App.jsx'

// Apply the stored theme BEFORE React renders so there's no flash of the
// wrong theme on refresh. See plan.md §7.2.
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
