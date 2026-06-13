import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDesks } from '../hooks/useDesks.js'
import CSSIsometricMap from '../components/CSSIsometricMap.jsx'
import DetailPanel from '../components/DetailPanel.jsx'
import StillHereModal from '../components/StillHereModal.jsx'
import styles from './LivePage.module.css'

const STATUS_COLORS = { free: '#4ADE80', occupied: '#F87171', away: '#FBBF24', abandoned: '#6B7280' }

export default function LivePage() {
  const { desks, loading, error, stillHereDesk, clearStillHere, checkin, away, checkout, stillHere, abandon } = useDesks()
  const [selectedId, setSelectedId] = useState(null)
  const [toast, setToast] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const checkinParam = searchParams.get('checkin')

  const selectedDesk = desks.find(d => d.id === selectedId) || null

  const showToast = (msg, color = 'green') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 3200)
  }

  const handleCheckin = useCallback(async (id) => {
    await checkin(id); showToast(`✓ Checked in to ${id}`)
  }, [checkin])

  useEffect(() => {
    if (checkinParam && desks.length > 0) {
      const desk = desks.find(d => d.id === checkinParam)
      if (desk) {
        setSelectedId(desk.id)
        if (desk.status === 'free') {
          handleCheckin(desk.id)
        }
        setSearchParams({}, { replace: true })
      }
    }
  }, [checkinParam, desks, handleCheckin, setSearchParams])

  const handleAway = useCallback(async (id) => {
    await away(id); showToast(`⏸ Away mode on ${id} — 20 min hold`, 'amber')
  }, [away])

  const handleCheckout = useCallback(async (id) => {
    await checkout(id); setSelectedId(null); showToast(`✓ Checked out of ${id}`)
  }, [checkout])

  const handleStillHere = useCallback(async () => {
    if (!stillHereDesk) return
    await stillHere(stillHereDesk)
    clearStillHere()
    showToast(`✓ Session extended on ${stillHereDesk}`)
  }, [stillHereDesk, stillHere, clearStillHere])

  const handleAbandon = useCallback(async () => {
    if (!stillHereDesk) return
    await abandon(stillHereDesk)
    clearStillHere()
    showToast(`Desk ${stillHereDesk} released`, 'red')
  }, [stillHereDesk, abandon, clearStillHere])

  // Counts
  const counts = { free: 0, occupied: 0, away: 0, abandoned: 0 }
  desks.forEach(d => { const k = d.status === 'still_here_pending' ? 'away' : d.status; if (counts[k] !== undefined) counts[k]++ })

  return (
    <div className={styles.root}>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-inner">
          <a href={import.meta.env.DEV ? "http://localhost:3001/" : "/"} className="nav-logo">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/>
              <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.7"/>
            </svg>
            DeskGuard
          </a>
          <div className="nav-links">
            <a href={import.meta.env.DEV ? "http://localhost:3001/index.html#how" : "/index.html#how"}>How it works</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/index.html#bookshelf" : "/index.html#bookshelf"}>Features</a>
            <a href="/live" className={window.location.pathname.startsWith('/live') ? "active" : ""}>Live Map</a>
            <a href="/scan" className={window.location.pathname.startsWith('/scan') ? "active" : ""}>Scan QR</a>
            <a href="/librarian" className={window.location.pathname.startsWith('/librarian') ? "active" : ""}>Librarian</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/contact.html" : "/contact.html"} className="nav-cta">Get early access</a>
          </div>
        </div>
      </nav>

      {/* TOP BAR */}
      <div className={styles.topBar}>
        <div className={styles.barLeft}>
          <span className={styles.liveDot}><span className="pulse-dot" /></span>
          <span className={styles.title}>Reading Room B · Floor 2</span>
        </div>
        <div className={styles.stats}>
          {Object.entries(counts).map(([k,v]) => (
            <span key={k} className={styles.stat}>
              <span className={styles.statDot} style={{ background: STATUS_COLORS[k] }} />
              <strong>{v}</strong> {k.charAt(0).toUpperCase()+k.slice(1)}
            </span>
          ))}
        </div>
        <div className={styles.legend}>
          {Object.entries(STATUS_COLORS).map(([k,c]) => (
            <span key={k} className={styles.legendItem}>
              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:c }} />
              {k.charAt(0).toUpperCase()+k.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div className={styles.main}>
        {loading && <div className={styles.loader}>Loading library map…</div>}
        {error   && <div className={styles.errBanner}>⚠ Cannot reach server — {error}. Showing last known state.</div>}

        {/* 3D Isometric Map */}
        <div className={styles.canvas}>
          <CSSIsometricMap
            desks={desks}
            selectedDeskId={selectedId}
            onSelectDesk={setSelectedId}
          />
        </div>

        {/* Detail panel */}
        {selectedDesk && (
          <div className={styles.panel}>
            <DetailPanel
              desk={selectedDesk}
              onClose={() => setSelectedId(null)}
              onCheckin={handleCheckin}
              onAway={handleAway}
              onCheckout={handleCheckout}
            />
          </div>
        )}
      </div>

      {/* Still Here Modal */}
      {stillHereDesk && (
        <StillHereModal
          deskId={stillHereDesk}
          onConfirm={handleStillHere}
          onAbandon={handleAbandon}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={styles.toast} style={{
          borderColor: toast.color === 'red' ? 'rgba(248,113,113,.35)' : toast.color === 'amber' ? 'rgba(251,191,36,.35)' : 'rgba(74,222,128,.35)',
          color:       toast.color === 'red' ? '#F87171' : toast.color === 'amber' ? '#FBBF24' : '#4ADE80',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
