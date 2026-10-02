import { useState, useEffect, useRef, useId } from 'react'
import styles from './StillHereModal.module.css'
import { GRACE_SECONDS, SESSION_HOURS } from '../config.js'

/**
 * StillHereModal — asks the person who checked in to confirm they are still at
 * the desk. The server owns the real timer; when the countdown here reaches zero
 * we simply close the dialog (onTimeout) and let the server decide.
 */
export default function StillHereModal({ deskId, onConfirm, onAbandon, onTimeout, busy = false }) {
  const [secs, setSecs] = useState(GRACE_SECONDS)
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef(null)
  const confirmRef = useRef(null)
  const previouslyFocused = useRef(null)

  // Countdown
  useEffect(() => {
    setSecs(GRACE_SECONDS)
    const interval = setInterval(() => setSecs(prev => (prev > 0 ? prev - 1 : 0)), 1000)
    return () => clearInterval(interval)
  }, [deskId])
  useEffect(() => { if (secs === 0) onTimeout?.() }, [secs, onTimeout])

  // Focus management: move focus in on open, restore on close, trap Tab inside
  useEffect(() => {
    previouslyFocused.current = document.activeElement
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onTimeout?.(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
  }, [onTimeout])

  const pct = (secs / GRACE_SECONDS) * 100
  const barColor = pct > 40 ? '#F0C987' : pct > 15 ? '#D4AF37' : '#D95D7D'

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={dialogRef}
      >
        <div className={styles.icon} aria-hidden="true">⏰</div>
        <h2 className={styles.title} id={titleId}>Still here?</h2>
        <p className={styles.sub} id={descId}>
          Desk <strong>{deskId}</strong> has been checked in for {SESSION_HOURS} hours.<br />
          Confirm you're still using it, or it will be marked abandoned.
        </p>
        <div className={styles.timerWrap}>
          <div className={styles.timerBar} role="progressbar" aria-valuemin={0} aria-valuemax={GRACE_SECONDS} aria-valuenow={secs} aria-label="Seconds left to respond">
            <div className={styles.timerFill} style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <span className={styles.timerNum} aria-live="off">{secs}s</span>
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn-primary" onClick={onConfirm} ref={confirmRef} disabled={busy}>
            {busy ? 'Confirming…' : '✓ Still here'}
          </button>
          <button type="button" className="btn-red" onClick={onAbandon} disabled={busy}>Release desk</button>
        </div>
      </div>
    </div>
  )
}
