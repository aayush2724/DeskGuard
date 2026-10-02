/**
 * CSSIsometricMap.jsx — Pure CSS 3D isometric floor plan.
 * No WebGL. Uses CSS 3D transforms, preserve-3d, and pointer events.
 * Every desk is a real <button>, so the map is keyboard- and screen-reader-usable.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './CSSIsometricMap.module.css'
import { statusMeta, LEGEND_ORDER, STATUS_META } from '../lib/status.js'

const ZONE_DEFS = [
  { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5, ox: 40,  oy: 60 },
  { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5, ox: 40,  oy: 540 },
  { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5, ox: 640, oy: 60 },
  { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5, ox: 640, oy: 540 },
  { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10,ox: 40,  oy: 920 },
]
const CELL = 105
const DEFAULT_RX = 60, DEFAULT_RZ = -45
const MIN_SCALE = 0.25, MAX_SCALE = 1.5

function fitScale(width) {
  if (!width) return 0.7
  return Math.min(0.7, Math.max(MIN_SCALE, width / 1500))
}

function Desk3D({ desk, isSelected, onClick }) {
  const s = statusMeta(desk.status)
  return (
    <button
      type="button"
      className={`${styles.desk} ${isSelected ? styles.selected : ''}`}
      style={{
        left: desk.col_num * CELL,
        top: desk.row_num * CELL,
        '--dc': s.color, '--dd': s.dark, '--ddk': s.darker,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(desk.id) }}
      aria-label={`Desk ${desk.id}, ${s.label}, ${desk.zone}`}
      aria-pressed={isSelected}
      title={`${desk.id} — ${s.label}`}
    >
      <span className={styles.tableTop} />
      <span className={styles.tableFront} />
      <span className={styles.tableSide} />
      <span className={styles.monitorScreen} />
      <span className={styles.monitorStand} />
      <span className={styles.chairSeat} />
      <span className={styles.chairBack} />
      <span className={styles.deskLabel} aria-hidden="true">{desk.id}</span>
      {isSelected && <span className={styles.selectRing} />}
      <span className={styles.statusDot} style={{ background: s.color }} />
    </button>
  )
}

export default function CSSIsometricMap({ desks, onSelectDesk, selectedDeskId }) {
  const [rotX, setRotX] = useState(DEFAULT_RX)
  const [rotZ, setRotZ] = useState(DEFAULT_RZ)
  const [smooth, setSmooth] = useState(false)
  const [scale, setScale] = useState(0.7)
  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const fittedRef = useRef(false)

  // Fit the floor plan to the container once on mount (phones get a smaller initial zoom)
  useEffect(() => {
    const el = containerRef.current
    if (!el || fittedRef.current) return
    fittedRef.current = true
    setScale(fitScale(el.clientWidth))
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('button')) return
    setSmooth(false)
    dragRef.current = { sx: e.clientX, sy: e.clientY, srx: rotX, srz: rotZ }
    containerRef.current?.setPointerCapture(e.pointerId)
  }, [rotX, rotZ])

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    setRotZ(d.srz + dx * 0.3)
    setRotX(Math.max(0, Math.min(70, d.srx - dy * 0.3)))
  }, [])

  const onPointerUp = useCallback((e) => {
    dragRef.current = null
    try { containerRef.current?.releasePointerCapture(e.pointerId) } catch { /* already released */ }
  }, [])

  const animateTo = (fn) => { setSmooth(true); fn(); setTimeout(() => setSmooth(false), 600) }
  const resetView = () => animateTo(() => {
    setRotX(DEFAULT_RX); setRotZ(DEFAULT_RZ); setScale(fitScale(containerRef.current?.clientWidth))
  })
  const zoomIn  = () => animateTo(() => setScale(s => Math.min(MAX_SCALE, s * 1.25)))
  const zoomOut = () => animateTo(() => setScale(s => Math.max(MIN_SCALE, s / 1.25)))

  const onWheel = useCallback((e) => {
    e.preventDefault()
    setScale(s => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s - e.deltaY * 0.001)))
  }, [])

  // Keyboard: arrows rotate, +/- zoom, 0 resets (when the map surface itself is focused)
  const onKeyDown = useCallback((e) => {
    if (e.target !== containerRef.current) return
    const step = 5
    switch (e.key) {
      case 'ArrowLeft':  setRotZ(z => z - step); break
      case 'ArrowRight': setRotZ(z => z + step); break
      case 'ArrowUp':    setRotX(x => Math.min(70, x + step)); break
      case 'ArrowDown':  setRotX(x => Math.max(0, x - step)); break
      case '+': case '=': zoomIn(); break
      case '-': case '_': zoomOut(); break
      case '0': resetView(); break
      default: return
    }
    e.preventDefault()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Group desks by zone prefix
  const deskMap = {}
  desks.forEach(d => { const p = d.id.charAt(0); (deskMap[p] = deskMap[p] || []).push(d) })

  return (
    <div
      className={styles.container}
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Isometric desk map. Drag to rotate, scroll to zoom. Arrow keys rotate, plus and minus zoom, 0 resets."
    >
      <div
        className={styles.canvas3d}
        style={{
          // scale3d keeps desk heights proportional when zoomed out; at the original
          // default zoom (0.7) the Z factor is 1, so the desktop look is unchanged.
          transform: `rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale3d(${scale}, ${scale}, ${scale / 0.7})`,
          transition: smooth ? 'transform 0.6s cubic-bezier(.4,0,.2,1)' : 'none',
        }}
      >
        <div className={styles.floor} />

        {ZONE_DEFS.map(z => (
          <div key={z.prefix} className={styles.zone} style={{ left: z.ox, top: z.oy }} role="group" aria-label={`${z.zone} zone`}>
            <div className={styles.zoneLabel} aria-hidden="true">{z.zone}</div>
            <div className={styles.zoneBg} style={{ width: z.cols * CELL + 10, height: z.rows * CELL + 10 }} />
            {(deskMap[z.prefix] || []).map(desk => (
              <Desk3D key={desk.id} desk={desk} isSelected={desk.id === selectedDeskId} onClick={onSelectDesk} />
            ))}
          </div>
        ))}
      </div>

      <div className={styles.controls} role="group" aria-label="Map view controls">
        <button type="button" className={styles.ctrlBtn} onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" className={styles.ctrlBtn} onClick={zoomOut} aria-label="Zoom out">−</button>
        <button type="button" className={`${styles.ctrlBtn} ${styles.resetBtn}`} onClick={resetView}>↻ Reset view</button>
      </div>

      <div className={styles.legend} aria-label="Legend">
        {LEGEND_ORDER.map(k => (
          <span key={k} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: STATUS_META[k].color }} aria-hidden="true" />
            {STATUS_META[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
