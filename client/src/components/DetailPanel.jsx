import { useEffect, useRef } from 'react'
import styles from './DetailPanel.module.css'
import { statusMeta, timeSince } from '../lib/status.js'
import { AWAY_MINUTES } from '../config.js'

function formatTime(ts) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

export default function DetailPanel({ desk, onClose, onCheckin, onAway, onCheckout, onStillHere, busy = false }) {
  const panelRef = useRef(null)
  const deskId = desk?.id

  // Move focus into the panel when a (different) desk is opened so keyboard users land on its content
  useEffect(() => { if (deskId) panelRef.current?.focus() }, [deskId])

  if (!desk) return null
  const meta = statusMeta(desk.status)
  const disabled = busy

  return (
    <div className={styles.panel} ref={panelRef} tabIndex={-1} aria-labelledby="desk-panel-title">
      <div className={styles.topNav}>
        <h2 id="desk-panel-title">Desk details</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close desk details">✕</button>
      </div>

      <div className={styles.deskIdWrapper}>
        <span className={styles.deskId}>{desk.id}</span>
      </div>

      <div className={styles.badgeWrapper}>
        <span className={styles.badge} style={{ background: meta.color, color: meta.text }}>
          {meta.label}
        </span>
      </div>

      <dl className={styles.meta}>
        <div className={styles.row}><dt>Zone</dt><dd>{desk.zone}</dd></div>
        {desk.checkin_at && <div className={styles.row}><dt>Checked in</dt><dd>{timeSince(desk.checkin_at)}</dd></div>}
        {desk.away_at    && <div className={styles.row}><dt>Away since</dt><dd style={{ color: '#D4AF37' }}>{timeSince(desk.away_at)}</dd></div>}
      </dl>

      {busy && <p className={styles.busy} role="status">Working…</p>}

      {/* FREE — check in */}
      {desk.status === 'free' && (
        <div className={styles.actions}>
          <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onCheckin(desk.id)} disabled={disabled}>
            ✓ Check in now
          </button>
        </div>
      )}

      {/* OCCUPIED — away + checkout */}
      {desk.status === 'occupied' && (
        <div className={styles.actions}>
          <p className={styles.infoText}>Using this desk? Set it to Away when you step out, or check out when you leave.</p>
          <button type="button" className="btn-amber" style={{ width: '100%' }} onClick={() => onAway(desk.id)} disabled={disabled}>
            ⏸ Going away ({AWAY_MINUTES} min hold)
          </button>
          <button type="button" className="btn-red" style={{ width: '100%' }} onClick={() => onCheckout(desk.id)} disabled={disabled}>
            Check out
          </button>
        </div>
      )}

      {/* AWAY — come back or release */}
      {desk.status === 'away' && (
        <div className={styles.actions}>
          <div className={styles.awayHint}>
            ⏱ Session paused. Return within {AWAY_MINUTES} minutes or the desk is marked abandoned.
          </div>
          <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onCheckin(desk.id)} disabled={disabled}>
            ✓ I'm back
          </button>
          <button type="button" className="btn-red" style={{ width: '100%' }} onClick={() => onCheckout(desk.id)} disabled={disabled}>
            Release desk
          </button>
        </div>
      )}

      {/* PENDING "STILL HERE?" CHECK */}
      {desk.status === 'still_here_pending' && (
        <div className={styles.actions}>
          <div className={styles.awayHint}>
            ⏱ This desk is waiting for a "Still here?" confirmation. If nobody confirms, it will be marked abandoned.
          </div>
          {onStillHere && (
            <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onStillHere(desk.id)} disabled={disabled}>
              ✓ I'm still here
            </button>
          )}
          <button type="button" className="btn-red" style={{ width: '100%' }} onClick={() => onCheckout(desk.id)} disabled={disabled}>
            Release desk
          </button>
        </div>
      )}

      {/* ABANDONED — claim it */}
      {desk.status === 'abandoned' && (
        <div className={styles.actions}>
          <div className={styles.abandonedNote}>
            <span aria-hidden="true">🚨</span>
            <span>This desk was left unattended past the hold time. Staff can reset it, or you can claim it now.</span>
          </div>
          <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onCheckin(desk.id)} disabled={disabled}>
            ✓ Claim this desk
          </button>
        </div>
      )}

      <div className={styles.lastUpdated}>
        Status changed {timeSince(desk.state_at)}{desk.state_at ? ` (${formatTime(desk.state_at)})` : ''}
      </div>
    </div>
  )
}
