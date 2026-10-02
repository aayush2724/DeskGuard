import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import styles from './LibrarianPage.module.css'
import { API_BASE } from '../config.js'
import { apiFetch, friendlyError } from '../api.js'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { statusMeta, countByStatus, timeSince, STATUS_META } from '../lib/status.js'
import { VENUE_NAME, VENUE_SUBTITLE } from '../config.js'
import AppNav from '../components/AppNav.jsx'

const KEY_STORAGE = 'deskguard_librarian_key'
const readKey = () => { try { return localStorage.getItem(KEY_STORAGE) || '' } catch { return '' } }
const writeKey = (v) => { try { v ? localStorage.setItem(KEY_STORAGE, v) : localStorage.removeItem(KEY_STORAGE) } catch { /* storage unavailable */ } }

const FILTERS = ['all', 'free', 'occupied', 'away', 'abandoned']

export default function LibrarianPage() {
  usePageMeta({
    title: 'Librarian dashboard — DeskGuard',
    description: 'Staff dashboard for monitoring and resetting desks.',
    path: '/librarian',
    noindex: true,
  })

  const [apiKey, setApiKey] = useState(readKey)
  const [authState, setAuthState] = useState(() => (readKey() ? 'checking' : 'signed-out')) // signed-out | checking | signed-in
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [desks, setDesks] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(null) // desk id | 'all' | 'qr'
  const [toast, setToast] = useState(null)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, ok = true) => {
    clearTimeout(toastTimer.current)
    setToast({ msg, ok })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const signOut = useCallback((reason) => {
    writeKey('')
    setApiKey('')
    setAuthState('signed-out')
    setDesks([]); setLog([])
    if (reason) setLoginError(reason)
  }, [])

  const authHeaders = useCallback((key = apiKey) => ({ 'X-Api-Key': key }), [apiKey])

  /** Loads desks + log. Also used to verify a key on sign-in. */
  const load = useCallback(async (key = apiKey, { signal } = {}) => {
    const [d, l] = await Promise.all([
      apiFetch('/desks', { signal }),
      apiFetch('/librarian/log', { headers: authHeaders(key), signal }),
    ])
    setDesks(Array.isArray(d) ? d : [])
    setLog(Array.isArray(l) ? l : [])
  }, [apiKey, authHeaders])

  // Initial load / re-verify a stored key
  useEffect(() => {
    if (!apiKey) { setLoading(false); return }
    const ctrl = new AbortController()
    setLoading(true)
    load(apiKey, { signal: ctrl.signal })
      .then(() => { setAuthState('signed-in'); setLoadError(null) })
      .catch((e) => {
        if (e.name === 'AbortError') return
        if (e.status === 401) signOut('Your saved key is no longer valid. Please sign in again.')
        else { setAuthState('signed-in'); setLoadError(e) } // keep key; server may just be down
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [apiKey, load, signOut])

  // Live updates while signed in
  useEffect(() => {
    if (authState !== 'signed-in' || typeof EventSource === 'undefined') return
    const es = new EventSource(`${API_BASE}/events`)
    es.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'desk_update' && msg.desk?.id) {
        setDesks(prev => prev.map(d => d.id === msg.desk.id ? { ...d, ...msg.desk } : d))
        setLog(prev => [{ id: `live-${Date.now()}-${msg.desk.id}`, event_type: msg.desk.status, message: `Desk ${msg.desk.id} → ${statusMeta(msg.desk.status).label.toLowerCase()}`, created_at: new Date().toISOString() }, ...prev.slice(0, 99)])
      }
    }
    return () => es.close()
  }, [authState])

  const handleLogin = async (e) => {
    e.preventDefault()
    const val = e.currentTarget.elements.key.value.trim()
    if (!val) { setLoginError('Enter the librarian access key.'); return }
    setLoginBusy(true); setLoginError('')
    try {
      await load(val)
      writeKey(val)
      setApiKey(val)
      setAuthState('signed-in')
      setLoadError(null)
      showToast('Signed in')
    } catch (err) {
      setLoginError(err.status === 401 ? 'That key was not accepted. Check it and try again.' : friendlyError(err))
    } finally {
      setLoginBusy(false)
    }
  }

  const handleAuthFailure = (e) => {
    if (e.status === 401) { signOut('Your session has expired or the key was changed. Please sign in again.'); return true }
    return false
  }

  const reset = async (id) => {
    if (busy) return
    setBusy(id)
    try {
      await apiFetch(`/librarian/reset/${encodeURIComponent(id)}`, { method: 'POST', headers: authHeaders() })
      showToast(`✓ Desk ${id} reset`)
      load().catch(() => {})
    } catch (e) {
      if (!handleAuthFailure(e)) showToast(friendlyError(e), false)
    } finally { setBusy(null) }
  }

  const resetAll = async () => {
    if (busy) return
    setBusy('all'); setConfirmResetAll(false)
    try {
      const d = await apiFetch('/librarian/reset-all', { method: 'POST', headers: authHeaders() })
      showToast(`✓ Reset ${d?.count ?? 0} abandoned desk${d?.count === 1 ? '' : 's'}`)
      load().catch(() => {})
    } catch (e) {
      if (!handleAuthFailure(e)) showToast(friendlyError(e), false)
    } finally { setBusy(null) }
  }

  /** Opens the printable QR sheet without putting the key in a URL. */
  const printQrs = async () => {
    if (busy) return
    const win = window.open('', '_blank')
    if (!win) { showToast('Allow pop-ups for this site to print the QR sheet.', false); return }
    win.opener = null
    win.document.title = 'Preparing QR sheet…'
    win.document.body.textContent = 'Preparing QR sheet…'
    setBusy('qr')
    try {
      const html = await apiFetch('/librarian/qr-sheet', { headers: { ...authHeaders(), Accept: 'text/html' } })
      const blob = new Blob([html], { type: 'text/html' })
      win.location.href = URL.createObjectURL(blob)
    } catch (e) {
      win.close()
      if (!handleAuthFailure(e)) showToast(friendlyError(e), false)
    } finally { setBusy(null) }
  }

  const counts = countByStatus(desks)
  const total = desks.length
  const util = total ? Math.round(((counts.occupied + counts.away) / total) * 100) : 0
  const filtered = desks.filter(d => filter === 'all' || d.status === filter || (filter === 'away' && d.status === 'still_here_pending'))
  const abandoned = desks.filter(d => d.status === 'abandoned')

  /* ── Signed out / verifying ─────────────────────────────── */
  if (authState !== 'signed-in') {
    return (
      <div className={styles.root}>
        <AppNav />
        <main id="main" className={styles.authWrap}>
          {authState === 'checking' ? (
            <div className={styles.authCard} role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Checking your saved key…
            </div>
          ) : (
            <form onSubmit={handleLogin} className={styles.authCard} noValidate>
              <h1 className={styles.authTitle}>Librarian access</h1>
              <p className={styles.authSub}>Enter the librarian access key to manage desks. Students don't need this — they can use the <Link to="/live">live map</Link>.</p>
              <label htmlFor="lib-key" className={styles.authLabel}>Access key</label>
              <input
                id="lib-key" name="key" type="password" autoComplete="current-password" required
                className={styles.authInput}
                aria-invalid={loginError ? 'true' : undefined}
                aria-describedby={loginError ? 'lib-key-error' : undefined}
                disabled={loginBusy}
              />
              {loginError && <p id="lib-key-error" className={styles.authError} role="alert">{loginError}</p>}
              <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }} disabled={loginBusy}>
                {loginBusy ? 'Checking…' : 'Sign in'}
              </button>
            </form>
          )}
        </main>
      </div>
    )
  }

  /* ── Signed in ─────────────────────────────────────────── */
  return (
    <div className={styles.root}>
      <AppNav />
      <header className={styles.header}>
        <div>
          <div className={styles.badge}><span className="pulse-dot" aria-hidden="true" />Librarian dashboard · Live</div>
          <h1 className={styles.title}>{VENUE_NAME}</h1>
          {VENUE_SUBTITLE && <p className={styles.sub}>{VENUE_SUBTITLE}</p>}
        </div>
        <div className={styles.headerActions}>
          <Link to="/live" className="btn-outline" style={{ fontSize: 12, padding: '9px 18px' }}>← Back to map</Link>
          <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '9px 18px' }} onClick={printQrs} disabled={busy === 'qr'}>
            <span aria-hidden="true">🖨️</span> {busy === 'qr' ? 'Preparing…' : 'Print QRs'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => signOut()} style={{ fontSize: 11, padding: '8px 14px' }}>Sign out</button>
          {abandoned.length > 0 && !confirmResetAll && (
            <button type="button" className="btn-primary" onClick={() => setConfirmResetAll(true)} disabled={!!busy}>
              Reset all abandoned ({abandoned.length})
            </button>
          )}
          {confirmResetAll && (
            <span className={styles.confirmRow} role="group" aria-label="Confirm reset all">
              <span>Free {abandoned.length} desk{abandoned.length === 1 ? '' : 's'}?</span>
              <button type="button" className="btn-primary" onClick={resetAll} autoFocus>Yes, reset</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmResetAll(false)}>Cancel</button>
            </span>
          )}
        </div>
      </header>

      <main id="main" className={styles.content}>
        {loadError && (
          <div className={styles.errBanner} role="alert">
            ⚠ {friendlyError(loadError)}
            <button type="button" className={styles.filterBtn} onClick={() => load().then(() => setLoadError(null)).catch(setLoadError)}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className={styles.loadingBox} role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> Loading dashboard…</div>
        ) : (
          <>
            {/* STATS */}
            <ul className={styles.statsRow} aria-label="Desk summary">
              {Object.entries(counts).map(([k, v]) => (
                <li key={k} className={`${styles.statCard} ${styles[k]}`}>
                  <span className={styles.statNum}>{v}</span>
                  <span className={styles.statLabel}>{STATUS_META[k].label}</span>
                  <span className={styles.statDot} style={{ background: STATUS_META[k].color }} aria-hidden="true" />
                </li>
              ))}
              <li className={styles.statCard}>
                <span className={styles.statNum}>{util}%</span>
                <span className={styles.statLabel}>Utilisation</span>
                <div className={styles.utilBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={util} aria-label="Utilisation">
                  <div style={{ width: `${util}%`, background: '#F0C987' }} />
                </div>
              </li>
            </ul>

            {abandoned.length > 0 && (
              <section className={styles.section} aria-labelledby="aban-title">
                <div className={styles.sectionHead}>
                  <div><span className="eyebrow">Action required</span><h2 className={styles.sectionTitle} id="aban-title">Abandoned desks</h2></div>
                </div>
                <ul className={styles.abanList}>
                  {abandoned.map(d => (
                    <li key={d.id} className={styles.abanRow}>
                      <span className={styles.tdId}>{d.id}</span>
                      <span className={styles.tdZone}>{d.zone}</span>
                      <span className={styles.tdTime} style={{ color: '#F08AA3' }}>{timeSince(d.state_at)}</span>
                      <button type="button" className={styles.btnReset} onClick={() => reset(d.id)} disabled={!!busy} aria-label={`Reset desk ${d.id}`}>
                        {busy === d.id ? 'Resetting…' : 'Reset'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className={styles.twoCol}>
              <section className={styles.section} aria-labelledby="registry-title">
                <div className={styles.sectionHead}>
                  <div><span className="eyebrow">All desks</span><h2 className={styles.sectionTitle} id="registry-title">Desk registry</h2></div>
                  <div className={styles.filters} role="group" aria-label="Filter desks by status">
                    {FILTERS.map(f => (
                      <button type="button" key={f} className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                        {f === 'all' ? 'All' : STATUS_META[f].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className="visually-hidden">Desks{filter !== 'all' ? ` with status ${filter}` : ''}</caption>
                    <thead>
                      <tr><th scope="col">Desk</th><th scope="col">Zone</th><th scope="col">Status</th><th scope="col">Time in state</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={5} className={styles.emptyCell}>{total === 0 ? 'No desks have been set up yet. Seed the desk list on the server to get started.' : `No ${filter} desks right now.`}</td></tr>
                      )}
                      {filtered.map(d => {
                        const m = statusMeta(d.status)
                        return (
                          <tr key={d.id}>
                            <th scope="row" className={styles.tdId}>{d.id}</th>
                            <td className={styles.tdZone}>{d.zone}</td>
                            <td>
                              <span className={styles.badge2} style={{ color: m.onDark, background: `${m.color}18`, border: `1px solid ${m.color}55` }}>{m.label}</span>
                            </td>
                            <td className={styles.tdMono}>{timeSince(d.state_at)}</td>
                            <td>
                              {d.status !== 'free' && (
                                <button type="button" className={styles.btnReset} onClick={() => reset(d.id)} disabled={!!busy} aria-label={`Free desk ${d.id}`}>
                                  {busy === d.id ? 'Freeing…' : 'Free desk'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="log-title">
                <div className={styles.sectionHead}>
                  <div><span className="eyebrow">System log</span><h2 className={styles.sectionTitle} id="log-title">Activity log</h2></div>
                  <button type="button" className={styles.filterBtn} onClick={() => setLog([])} title="Clears this view only; the server log is kept">Clear view</button>
                </div>
                {log.length === 0 ? (
                  <p className={styles.emptyCell}>No activity yet. Check-ins, releases and resets will appear here as they happen.</p>
                ) : (
                  <ol className={styles.logList} aria-live="polite" aria-relevant="additions">
                    {log.slice(0, 50).map(e => (
                      <li key={e.id} className={styles.logRow}>
                        <time className={styles.logTime} dateTime={e.created_at}>{new Date(e.created_at).toLocaleTimeString()}</time>
                        <span className={styles.logDot} style={{ background: STATUS_META[e.event_type]?.color || '#7A5C79' }} aria-hidden="true" />
                        <span className={styles.logMsg}>{e.message}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  )
}
