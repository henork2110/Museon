import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

const isDev = import.meta.env.DEV

async function mount() {
  if (isDev) {
    await import('dialkit/styles.css')
  }

  const { DialRoot } = isDev ? await import('dialkit') : { DialRoot: null }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <Analytics />
      {isDev && DialRoot && <DialRoot />}
    </StrictMode>,
  )
}

mount()
