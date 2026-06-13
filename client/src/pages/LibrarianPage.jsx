import { useState, useEffect, useCallback } from 'react'
import styles from './LibrarianPage.module.css'

const BASE = '/api'

function timeSince(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ${m%60}m ago`
}

const STATUS_COLOR = { free:'#4ADE80', occupied:'#F87171', away:'#FBBF24', still_here_pending:'#FBBF24', abandoned:'#6B7280' }

export default function LibrarianPage() {
  const [desks, setDesks]   = useState([])
  const [log,   setLog]     = useState([])
  const [filter, setFilter] = useState('all')
  const [toast, setToast]   = useState(null)

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    const [dr, lr] = await Promise.all([fetch(`${BASE}/desks`), fetch(`${BASE}/librarian/log`)])
    if (dr.ok) setDesks(await dr.json())
    if (lr.ok) setLog(await lr.json())
  }, [])

  useEffect(() => {
    load()
    // SSE
    const es = new EventSource(`${BASE}/events`)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'desk_update') {
          setDesks(prev => prev.map(d => d.id === msg.desk.id ? { ...d, ...msg.desk } : d))
          setLog(prev => [{ id: Date.now(), event_type: msg.desk.status, message: `Desk ${msg.desk.id} → ${msg.desk.status}`, created_at: new Date().toISOString() }, ...prev.slice(0,99)])
        }
      } catch {}
    }
    return () => es.close()
  }, [load])

  const reset = async (id) => {
    const r = await fetch(`${BASE}/librarian/reset/${id}`, { method: 'POST' })
    if (r.ok) { showToast(`✓ Desk ${id} reset`); load() }
  }
  const resetAll = async () => {
    const r = await fetch(`${BASE}/librarian/reset-all`, { method: 'POST' })
    if (r.ok) { const d = await r.json(); showToast(`✓ Reset ${d.count} abandoned desks`); load() }
  }

  const counts = { free:0, occupied:0, away:0, abandoned:0 }
  desks.forEach(d => {
    const k = d.status === 'still_here_pending' ? 'away' : d.status
    if (counts[k] !== undefined) counts[k]++
  })
  const total = desks.length
  const used  = counts.occupied + counts.away
  const util  = total ? Math.round((used/total)*100) : 0

  const filtered = desks.filter(d => filter === 'all' || d.status === filter || (filter === 'away' && d.status === 'still_here_pending'))
  const abandoned = desks.filter(d => d.status === 'abandoned')

  return (
    <div className={styles.root}>
      <nav className="nav">
        <div className="nav-inner">
          <a href={import.meta.env.DEV ? "http://localhost:3001/" : "/"} className="nav-logo">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/>
              <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity=".4"/>
              <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity=".4"/>
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity=".7"/>
            </svg>
            DeskGuard
          </a>
          <div className="nav-links">
            <a href="/live">Live Map</a>
            <a href="/scan">Scan QR</a>
            <a href="/librarian" className="active">Librarian</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/" : "/"} className="nav-cta">Back to Site</a>
          </div>
        </div>
      </nav>

      <div className={styles.header}>
        <div>
          <div className={styles.badge}><span className="pulse-dot" />Librarian Dashboard · Live</div>
          <h1 className={styles.title}>Reading Room B</h1>
          <p className={styles.sub}>Floor 2 · Central Library</p>
        </div>
        <div className={styles.headerActions}>
          <a href="/live" className="btn-outline" style={{fontSize:12,padding:'9px 18px'}}>← Back to Map</a>
          {abandoned.length > 0 && (
            <button className="btn-primary" onClick={resetAll}>Reset All Abandoned ({abandoned.length})</button>
          )}
        </div>
      </div>

      <div className={styles.content}>

        {/* STATS */}
        <div className={styles.statsRow}>
          {Object.entries(counts).map(([k,v]) => (
            <div key={k} className={`${styles.statCard} ${styles[k]}`}>
              <span className={styles.statNum}>{v}</span>
              <span className={styles.statLabel}>{k.charAt(0).toUpperCase()+k.slice(1)}</span>
              <span className={styles.statDot} style={{ background: STATUS_COLOR[k] }} />
            </div>
          ))}
          <div className={styles.statCard}>
            <span className={styles.statNum}>{util}%</span>
            <span className={styles.statLabel}>Utilisation</span>
            <div className={styles.utilBar}><div style={{ width:`${util}%`, background:'#4ADE80' }} /></div>
          </div>
        </div>

        {/* ABANDONED PANEL */}
        {abandoned.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <div><span className="eyebrow">Action required</span><h2 className={styles.sectionTitle}>Abandoned Desks</h2></div>
            </div>
            <div className={styles.abanList}>
              {abandoned.map(d => (
                <div key={d.id} className={styles.abanRow}>
                  <span className={styles.tdId}>{d.id}</span>
                  <span className={styles.tdZone}>{d.zone}</span>
                  <span className={styles.tdTime} style={{color:'#F87171'}}>{timeSince(d.state_at)}</span>
                  <button className={styles.btnReset} onClick={() => reset(d.id)}>Reset</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DESK TABLE */}
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div><span className="eyebrow">All desks</span><h2 className={styles.sectionTitle}>Desk Registry</h2></div>
            <div className={styles.filters}>
              {['all','free','occupied','away','abandoned'].map(f => (
                <button key={f} className={`${styles.filterBtn} ${filter===f?styles.active:''}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Desk</th><th>Zone</th><th>Status</th><th>Time in State</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td className={styles.tdId}>{d.id}</td>
                    <td className={styles.tdZone}>{d.zone}</td>
                    <td>
                      <span className={styles.badge2} style={{ color: STATUS_COLOR[d.status]||'#6B7280', background: `${STATUS_COLOR[d.status]||'#6B7280'}18`, border: `1px solid ${STATUS_COLOR[d.status]||'#6B7280'}40` }}>
                        {d.status}
                      </span>
                    </td>
                    <td className={styles.tdMono}>{timeSince(d.state_at)}</td>
                    <td>
                      {d.status !== 'free' && (
                        <button className={styles.btnReset} onClick={() => reset(d.id)}>Free desk</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOG */}
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div><span className="eyebrow">System log</span><h2 className={styles.sectionTitle}>Activity Log</h2></div>
            <button className={styles.filterBtn} onClick={() => setLog([])}>Clear</button>
          </div>
          <div className={styles.logList}>
            {log.slice(0,50).map(e => (
              <div key={e.id} className={styles.logRow}>
                <span className={styles.logTime}>{new Date(e.created_at).toLocaleTimeString()}</span>
                <span className={styles.logDot} style={{ background: STATUS_COLOR[e.event_type]||'#6B7280' }} />
                <span className={styles.logMsg}>{e.message}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {toast && (
        <div className={styles.toast} style={{ borderColor: toast.ok ? 'rgba(74,222,128,.35)':'rgba(248,113,113,.35)', color: toast.ok ? '#4ADE80':'#F87171' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
