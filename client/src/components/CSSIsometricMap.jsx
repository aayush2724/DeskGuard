/**
 * CSSIsometricMap.jsx — Pure CSS 3D isometric floor plan.
 * No Three.js/WebGL. Uses CSS 3D transforms, preserve-3d, and pointer events.
 */
import { useState, useRef, useCallback } from 'react'
import styles from './CSSIsometricMap.module.css'

const STATUS = {
  free:               { color: '#F0C987', dark: '#D4AF37', darker: '#E7D3B5', label: 'Free' },
  occupied:           { color: '#D95D7D', dark: '#8B4513', darker: '#5E2F29', label: 'Occupied' },
  away:               { color: '#D4AF37', dark: '#706040', darker: '#A38F75', label: 'Away' },
  still_here_pending: { color: '#D4AF37', dark: '#706040', darker: '#A38F75', label: 'Away' },
  abandoned:          { color: '#7A5C79', dark: '#A38F75', darker: '#5D2A5C', label: 'Abandoned' },
}

const ZONE_DEFS = [
  { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5, ox: 40,  oy: 60 },
  { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5, ox: 40,  oy: 540 },
  { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5, ox: 640, oy: 60 },
  { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5, ox: 640, oy: 540 },
  { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10,ox: 40,  oy: 920 },
]
const CELL = 105

const DEFAULT_RX = 60, DEFAULT_RZ = -45

function Desk3D({ desk, isSelected, onClick }) {
  const s = STATUS[desk.status] || STATUS.free
  return (
    <div
      className={`${styles.desk} ${isSelected ? styles.selected : ''}`}
      style={{
        left: desk.col_num * CELL,
        top: desk.row_num * CELL,
        '--dc': s.color, '--dd': s.dark, '--ddk': s.darker,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(desk.id) }}
      title={`${desk.id} — ${s.label}`}
    >
      {/* Table */}
      <div className={styles.tableTop} />
      <div className={styles.tableFront} />
      <div className={styles.tableSide} />
      {/* Monitor */}
      <div className={styles.monitorScreen} />
      <div className={styles.monitorStand} />
      {/* Chair */}
      <div className={styles.chairSeat} />
      <div className={styles.chairBack} />
      {/* Label */}
      <div className={styles.deskLabel}>{desk.id}</div>
      {/* Selection ring */}
      {isSelected && <div className={styles.selectRing} />}
      {/* Status dot */}
      <div className={styles.statusDot} style={{ background: s.color }} />
    </div>
  )
}

export default function CSSIsometricMap({ desks, onSelectDesk, selectedDeskId }) {
  const [rotX, setRotX] = useState(DEFAULT_RX)
  const [rotZ, setRotZ] = useState(DEFAULT_RZ)
  const [smooth, setSmooth] = useState(false)
  const [scale, setScale] = useState(0.7)
  const dragRef = useRef(null)
  const containerRef = useRef(null)

  const onPointerDown = useCallback((e) => {
    if (e.target.closest(`.${styles.desk}`)) return
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
    containerRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  const resetView = () => {
    setSmooth(true)
    setRotX(DEFAULT_RX)
    setRotZ(DEFAULT_RZ)
    setScale(0.7)
    setTimeout(() => setSmooth(false), 600)
  }

  const onWheel = useCallback((e) => {
    e.preventDefault()
    setScale(s => Math.max(0.3, Math.min(1.5, s - e.deltaY * 0.001)))
  }, [])

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
      onWheel={onWheel}
    >
      <div
        className={styles.canvas3d}
        style={{
          transform: `rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${scale})`,
          transition: smooth ? 'transform 0.6s cubic-bezier(.4,0,.2,1)' : 'none',
        }}
      >
        {/* Floor */}
        <div className={styles.floor} />

        {/* Zones */}
        {ZONE_DEFS.map(z => (
          <div key={z.prefix} className={styles.zone} style={{ left: z.ox, top: z.oy }}>
            <div className={styles.zoneLabel}>{z.zone}</div>
            <div className={styles.zoneBg} style={{
              width: z.cols * CELL + 10,
              height: z.rows * CELL + 10,
            }} />
            {(deskMap[z.prefix] || []).map(desk => (
              <Desk3D
                key={desk.id}
                desk={desk}
                isSelected={desk.id === selectedDeskId}
                onClick={onSelectDesk}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Reset button */}
      <button className={styles.resetBtn} onClick={resetView}>
        ↻ Reset View
      </button>

      {/* Legend */}
      <div className={styles.legend}>
        {Object.entries({ free:'Free', occupied:'Occupied', away:'Away', abandoned:'Abandoned' }).map(([k,v]) => (
          <span key={k} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: STATUS[k].color }} />
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}
