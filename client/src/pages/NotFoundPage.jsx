import { Link } from 'react-router-dom'
import AppNav from '../components/AppNav.jsx'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { MARKETING_ORIGIN } from '../config.js'

export default function NotFoundPage() {
  usePageMeta({
    title: 'Page not found — DeskGuard',
    description: 'The page you were looking for could not be found.',
    path: '/404',
    noindex: true,
  })
  return (
    <div className="app-page">
      <AppNav />
      <main id="main" className="not-found">
        <span className="eyebrow">Error 404</span>
        <h1>This desk<br />doesn't exist</h1>
        <p>The page you're looking for was moved, removed, or never existed. Check the address, or pick up where you left off below.</p>
        <div className="not-found-actions">
          <a href={`${MARKETING_ORIGIN}/`} className="btn-primary">Back to home</a>
          <Link to="/live" className="btn-outline">Open the live map</Link>
          <a href={`${MARKETING_ORIGIN}/contact`} className="btn-ghost">Contact us</a>
        </div>
      </main>
    </div>
  )
}
