import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MARKETING_ORIGIN } from '../config.js'

const Logo = () => (
  <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#F0C987"/>
    <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#F0C987" opacity="0.4"/>
    <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#F0C987" opacity="0.4"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#F0C987" opacity="0.7"/>
  </svg>
)

/** Shared top navigation for the React app pages (mirrors the marketing site nav). */
export default function AppNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const m = (p) => `${MARKETING_ORIGIN}${p}`

  // Close the mobile menu on navigation and on Escape
  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('nav-mobile-open')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('nav-mobile-open') }
  }, [open])

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <a href={m('/')} className="nav-logo" aria-label="DeskGuard home">
            <Logo />
            DeskGuard
          </a>
          <div className={`nav-links${open ? ' open' : ''}`} id="app-nav-links">
            <a href={m('/#how')}>How it works</a>
            <a href={m('/#bookshelf')}>Features</a>
            <NavLink to="/live">Live Map</NavLink>
            <NavLink to="/scan">Scan QR</NavLink>
            <NavLink to="/librarian">Librarian</NavLink>
            <a href={m('/contact')} className="nav-cta">Get early access</a>
          </div>
          <button
            type="button"
            className="nav-hamburger"
            aria-expanded={open}
            aria-controls="app-nav-links"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(o => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>
    </>
  )
}
