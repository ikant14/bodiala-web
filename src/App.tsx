import { useEffect, useState } from 'react'
import SearchView from './components/SearchView'
import BookingsView from './components/BookingsView'
import { IconMoon, IconSparkle, IconSun } from './icons'

type Tab = 'search' | 'bookings'
type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'light' // bright by default; toggle in the header switches to dark
}

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [bookingsKey, setBookingsKey] = useState(0)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function handleBooked() {
    setBookingsKey((k) => k + 1)
    setTab('bookings')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">
            <IconSparkle size={22} />
          </span>
          <div>
            <h1>Bodiala</h1>
            <p>RezLive hotel search &amp; booking</p>
          </div>
        </div>

        <div className="header-right">
          <nav className="tabs">
            <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
              Search
            </button>
            <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>
              My bookings
            </button>
          </nav>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'search' ? (
          <SearchView onBooked={handleBooked} />
        ) : (
          <BookingsView key={bookingsKey} />
        )}
      </main>

      <footer className="app-footer">
        Demo UI · talks to bodiala at <code>/api</code> (proxied to :8080). Live actions need the{' '}
        <code>stub</code> profile or real RezLive credentials.
      </footer>
    </div>
  )
}
