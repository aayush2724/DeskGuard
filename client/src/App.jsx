import { Routes, Route, Navigate } from 'react-router-dom'
import LivePage from './pages/LivePage.jsx'
import LibrarianPage from './pages/LibrarianPage.jsx'
import ScanPage from './pages/ScanPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/"           element={<Navigate to="/live" replace />} />
      <Route path="/live"       element={<LivePage />} />
      <Route path="/librarian"  element={<LibrarianPage />} />
      <Route path="/scan"       element={<ScanPage />} />
    </Routes>
  )
}
