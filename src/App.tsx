import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import SearchView from './components/SearchView'
import BookingsView from './components/BookingsView'
import { IconMoon, IconSparkle, IconSun } from './icons'
import { lastSearchHref } from './searchState'

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'light' // bright by default; toggle in the header switches to dark
}

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const navigate = useNavigate()
  useLocation() // re-render on navigation, so the Search tab always links back to the latest search

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="app">
      <header className="app-header">
        <NavLink to={lastSearchHref()} className="brand" aria-label="Bodiala home">
          <span className="logo">
            <IconSparkle size={18} />
          </span>
          <div>
            <h1>bodiala</h1>
            <p>Hotel search &amp; booking</p>
          </div>
        </NavLink>

        <nav className="tabs">
          <NavLink to={lastSearchHref()} end className={tabClass}>
            Search
          </NavLink>
          <NavLink to="/bookings" className={tabClass}>
            My bookings
          </NavLink>
        </nav>

        <div className="header-right">
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
        <Routes>
          <Route path="/" element={<SearchView onBooked={() => navigate('/bookings')} />} />
          <Route path="/bookings" element={<BookingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Bodiala demo · talks to the backend at <code>/api</code> (proxied to :8080) · live availability from
        Hotelbeds
      </footer>
    </div>
  )
}
