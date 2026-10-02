import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import NotFoundPage from './pages/NotFoundPage.jsx'

// Route-level code splitting: the QR scanner library is only loaded on /scan,
// and the librarian dashboard is only loaded by staff.
const LivePage      = lazy(() => import('./pages/LivePage.jsx'))
const LibrarianPage = lazy(() => import('./pages/LibrarianPage.jsx'))
const ScanPage      = lazy(() => import('./pages/ScanPage.jsx'))

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"           element={<Navigate to="/live" replace />} />
        <Route path="/live"       element={<LivePage />} />
        <Route path="/librarian"  element={<LibrarianPage />} />
        <Route path="/scan"       element={<ScanPage />} />
        <Route path="*"           element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
