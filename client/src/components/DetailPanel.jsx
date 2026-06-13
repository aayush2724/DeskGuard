import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import styles from './DetailPanel.module.css'

const STATUS_META = {
  free:               { label: 'Free',      color: '#4ADE80' },
  occupied:           { label: 'Occupied',  color: '#F87171' },
  away:               { label: 'Away',      color: '#FBBF24' },
  still_here_pending: { label: 'Pending…',  color: '#FBBF24' },
  abandoned:          { label: 'Abandoned', color: '#6B7280' },
}

function timeSince(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m/60)}h ${m%60}m ago`
}

export default function DetailPanel({ desk, onClose, onCheckin, onAway, onCheckout }) {
  const qrRef = useRef(null)

  useEffect(() => {
    if (!desk || desk.status !== 'free') return
    if (!qrRef.current) return
    const checkinUrl = `${window.location.origin}/live?checkin=${desk.id}`
    QRCode.toCanvas(qrRef.current, checkinUrl, {
      width: 130, margin: 1,
      color: { dark: '#111', light: '#fff' }
    })
  }, [desk?.id, desk?.status])

  if (!desk) return null
  const meta = STATUS_META[desk.status] || STATUS_META.free

  return (
    <div className={styles.panel}>
      <div className={styles.topNav}>
        <h3>Desk Details</h3>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className={styles.deskIdWrapper}>
        <span className={styles.deskId}>{desk.id}</span>
      </div>

      <div className={styles.badgeWrapper}>
        <span className={styles.badge} style={{ background: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className={styles.meta}>
        <div className={styles.row}><span>Zone</span><span>{desk.zone}</span></div>
        {desk.checkin_at && <div className={styles.row}><span>Checked in</span><span>{timeSince(desk.checkin_at)}</span></div>}
        {desk.status === 'occupied' && <div className={styles.row}><span>Occupied by</span><span>Student</span></div>}
        {desk.away_at    && <div className={styles.row}><span>Away since</span><span style={{color:'#FBBF24'}}>{timeSince(desk.away_at)}</span></div>}
      </div>

      {desk.status === 'occupied' && (
        <div className={styles.infoText}>This desk is occupied by another student.</div>
      )}

      {/* FREE — show QR + check in */}
      {desk.status === 'free' && (
        <div className={styles.qrSection}>
          <p className={styles.qrLabel}>Scan QR to Check In</p>
          <div className={styles.qrBox}>
            <canvas ref={qrRef} />
          </div>
          <p className={styles.qrOr}>— or —</p>
          <button className="btn-primary" style={{width:'100%'}} onClick={() => onCheckin(desk.id)}>
            ✓ Check In Now
          </button>
        </div>
      )}

      {/* OCCUPIED — away + checkout */}
      {desk.status === 'occupied' && (
        <div className={styles.actions}>
          <button className="btn-amber" style={{width:'100%'}} onClick={() => onAway(desk.id)}>
            ⏸ Going Away (20 min)
          </button>
          <button className="btn-red" style={{width:'100%'}} onClick={() => onCheckout(desk.id)}>
            ✓ Check Out
          </button>
        </div>
      )}

      {/* AWAY — check back in or release */}
      {(desk.status === 'away' || desk.status === 'still_here_pending') && (
        <div className={styles.actions}>
          <div className={styles.awayHint}>
            ⏱ Session paused. Return within 20 min or desk is freed.
          </div>
          <button className="btn-primary" style={{width:'100%'}} onClick={() => onCheckin(desk.id)}>
            ✓ I'm Back
          </button>
          <button className="btn-red" style={{width:'100%'}} onClick={() => onCheckout(desk.id)}>
            Release Desk
          </button>
        </div>
      )}

      {/* ABANDONED — librarian link */}
      {desk.status === 'abandoned' && (
        <div className={styles.abandonedNote}>
          <span>🚨</span>
          <span>This desk is abandoned. A librarian has been notified.</span>
        </div>
      )}

      <div className={styles.lastUpdated}>Last updated: Just now</div>
    </div>
  )
}
