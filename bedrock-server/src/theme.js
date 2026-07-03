const THEME_KEY = 'bedrock-panel-theme'

// Apply the stored theme as early as possible to avoid a flash of the wrong
// theme on refresh. Called in main.jsx BEFORE React renders. See plan.md §7.2.
export function initTheme() {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.classList.toggle('dark', stored === 'dark')
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark')
  }
}

export const THEME_STORAGE_KEY = THEME_KEY
