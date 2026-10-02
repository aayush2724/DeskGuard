import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDesks } from '../hooks/useDesks.js'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { friendlyError } from '../api.js'
import { countByStatus, STATUS_META } from '../lib/status.js'
import { DESK_ID_RE } from '../lib/deskId.js'
import { VENUE_NAME, VENUE_SUBTITLE, AWAY_MINUTES } from '../config.js'
import AppNav from '../components/AppNav.jsx'
import CSSIsometricMap from '../components/CSSIsometricMap.jsx'
import DetailPanel from '../components/DetailPanel.jsx'
import StillHereModal from '../components/StillHereModal.jsx'
import styles from './LivePage.module.css'

const WAKE_HINT_AFTER_MS = 4000

export default function LivePage() {
  usePageMeta({
    title: `Live desk map — ${VENUE_NAME} | DeskGuard`,
    description: `See which desks are free in ${VENUE_NAME} right now. Check in by scanning the QR code on your desk; abandoned desks are freed automatically.`,
    path: '/live',
  })

  const { desks, loading, error, connection, stillHereDesk, clearStillHere, checkin, away, checkout, stillHere, refetch } = useDesks()
  const [selectedId, setSelectedId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [showWakeHint, setShowWakeHint] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const checkinParam = searchParams.get('checkin')
  const toastTimer = useRef(null)
  const handledParam = useRef(null)

  const selectedDesk = desks.find(d => d.id === selectedId) || null
  const counts = countByStatus(desks)

  const showToast = useCallback((msg, kind = 'ok') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, kind })
    toastTimer.current = setTimeout(() => setToast(null), 3600)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Free hosting can take ~30s to wake the API: tell people why they're waiting
  useEffect(() => {
    if (!loading) { setShowWakeHint(false); return }
    const t = setTimeout(() => setShowWakeHint(true), WAKE_HINT_AFTER_MS)
    return () => clearTimeout(t)
  }, [loading])

  /** Runs a desk action with busy/error handling and a toast on success. */
  const run = useCallback(async (id, fn, successMsg, kind = 'ok') => {
    if (busyId) return false
    setBusyId(id)
    try {
      await fn(id)
      if (successMsg) showToast(successMsg, kind)
      return true
    } catch (e) {
      showToast(friendlyError(e), 'error')
      return false
    } finally {
      setBusyId(null)
    }
  }, [busyId, showToast])

  const handleCheckin   = useCallback((id) => run(id, checkin,   `✓ Checked in to ${id}`), [run, checkin])
  const handleAway      = useCallback((id) => run(id, away,      `⏸ Away mode on ${id} — ${AWAY_MINUTES} min hold`, 'warn'), [run, away])
  const handleStillHere = useCallback((id) => run(id, stillHere, `✓ Session extended on ${id}`), [run, stillHere])
  const handleCheckout  = useCallback(async (id) => {
    const ok = await run(id, checkout, `✓ Checked out of ${id}`)
    if (ok) setSelectedId(null)
  }, [run, checkout])

  // QR deep link: /live?checkin=A-01 → select the desk and check in if it is free
  useEffect(() => {
    if (!checkinParam || loading || handledParam.current === checkinParam) return
    handledParam.current = checkinParam
    const id = checkinParam.toUpperCase()
    const desk = DESK_ID_RE.test(id) ? desks.find(d => d.id === id) : null
    setSearchParams({}, { replace: true })
    if (!desk) { showToast(`Desk "${checkinParam}" was not found on this floor.`, 'error'); return }
    setSelectedId(desk.id)
    if (desk.status === 'free') handleCheckin(desk.id)
  }, [checkinParam, loading, desks, handleCheckin, setSearchParams, showToast])

  // "Still here?" modal actions
  const modalConfirm = useCallback(async () => {
    if (!stillHereDesk) return
    const ok = await run(stillHereDesk, stillHere, `✓ Session extended on ${stillHereDesk}`)
    if (ok) clearStillHere()
  }, [stillHereDesk, run, stillHere, clearStillHere])
  const modalRelease = useCallback(async () => {
    if (!stillHereDesk) return
    const ok = await run(stillHereDesk, checkout, `Desk ${stillHereDesk} released`, 'warn')
    if (ok) clearStillHere()
  }, [stillHereDesk, run, checkout, clearStillHere])
  const modalTimeout = useCallback(() => {
    clearStillHere()
    showToast('No response — the desk will be freed by the server unless you confirm from the desk panel.', 'warn')
  }, [clearStillHere, showToast])

  const connectionLabel = { live: 'Live', connecting: 'Connecting…', reconnecting: 'Reconnecting…', offline: 'Offline — refreshing periodically' }[connection]
  const isEmpty = !loading && !error && desks.length === 0

  return (
    <div className={styles.root}>
      <AppNav />

      {/* TOP BAR */}
      <header className={styles.topBar}>
        <div className={styles.barLeft}>
          <span className={styles.liveDot} title={connectionLabel}>
            <span className={`pulse-dot ${connection === 'live' ? '' : 'pulse-dot--muted'}`} aria-hidden="true" />
          </span>
          <h1 className={styles.title}>{VENUE_NAME}{VENUE_SUBTITLE ? ` · ${VENUE_SUBTITLE}` : ''}</h1>
          <span className={styles.connection} role="status">{connectionLabel}</span>
        </div>
        <ul className={styles.stats} aria-label="Desk counts">
          {Object.entries(counts).map(([k, v]) => (
            <li key={k} className={styles.stat}>
              <span className={styles.statDot} style={{ background: STATUS_META[k].color }} aria-hidden="true" />
              <strong>{v}</strong> {STATUS_META[k].label}
            </li>
          ))}
        </ul>
      </header>

      {/* MAIN */}
      <main id="main" className={styles.main}>
        {loading && (
          <div className={styles.loader} role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Loading library map…</span>
            {showWakeHint && <span className={styles.loaderHint}>The server may be waking up — this can take up to 30 seconds.</span>}
          </div>
        )}

        {error && (
          <div className={styles.errBanner} role="alert">
            <span>⚠ {friendlyError(error)}{desks.length ? ' Showing the last known state.' : ''}</span>
            <button type="button" className={styles.retryBtn} onClick={refetch}>Retry</button>
          </div>
        )}

        {isEmpty ? (
          <div className={styles.empty}>
            <h2>No desks on this floor yet</h2>
            <p>The floor plan hasn't been set up. If you run this DeskGuard instance, seed the desk list on the server (see the README) — the map will appear here automatically.</p>
          </div>
        ) : (
          <section className={styles.canvas} aria-label="Desk map">
            <CSSIsometricMap desks={desks} selectedDeskId={selectedId} onSelectDesk={setSelectedId} />
          </section>
        )}

        {selectedDesk && (
          <aside className={styles.panel} aria-label="Desk details">
            <DetailPanel
              desk={selectedDesk}
              busy={busyId === selectedDesk.id}
              onClose={() => setSelectedId(null)}
              onCheckin={handleCheckin}
              onAway={handleAway}
              onCheckout={handleCheckout}
              onStillHere={handleStillHere}
            />
          </aside>
        )}
      </main>

      {stillHereDesk && (
        <StillHereModal
          deskId={stillHereDesk}
          busy={busyId === stillHereDesk}
          onConfirm={modalConfirm}
          onAbandon={modalRelease}
          onTimeout={modalTimeout}
        />
      )}

      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.kind}`] || ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  )
}
