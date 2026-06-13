import { useState, useEffect } from 'react'
import styles from './StillHereModal.module.css'

const GRACE = 30 // seconds to respond

export default function StillHereModal({ deskId, onConfirm, onAbandon }) {
  const [secs, setSecs] = useState(GRACE)

  useEffect(() => {
    setSecs(GRACE)
    const interval = setInterval(() => {
      setSecs(prev => {
        if (prev <= 1) { clearInterval(interval); onAbandon(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [deskId])

  const pct = (secs / GRACE) * 100

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>⏰</div>
        <h2 className={styles.title}>Still here?</h2>
        <p className={styles.sub}>
          Desk <strong>{deskId}</strong> has been occupied for 2 hours.<br />
          Confirm you're still using it or it'll be freed.
        </p>
        <div className={styles.timerWrap}>
          <div className={styles.timerBar}>
            <div className={styles.timerFill} style={{ width: `${pct}%`, background: pct > 40 ? '#4ADE80' : pct > 15 ? '#FBBF24' : '#F87171' }} />
          </div>
          <span className={styles.timerNum}>{secs}s</span>
        </div>
        <div className={styles.actions}>
          <button className="btn-primary" onClick={onConfirm}>✓ Still Here!</button>
          <button className="btn-red" onClick={onAbandon}>Release Desk</button>
        </div>
      </div>
    </div>
  )
}
