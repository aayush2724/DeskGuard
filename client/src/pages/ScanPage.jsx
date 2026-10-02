import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import QRCode from 'qrcode'
import { useDesks } from '../hooks/useDesks.js'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { friendlyError } from '../api.js'
import { statusMeta } from '../lib/status.js'
import { parseDeskId } from '../lib/deskId.js'
import AppNav from '../components/AppNav.jsx'
import styles from './ScanPage.module.css'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
/** Defined at module level so React keeps the same element (and keyboard focus) across renders. */
function ActionButton({ cls, onRun, disabled, children, span }) {
  return (
    <button
      type="button"
      className={cls}
      onClick={onRun}
      disabled={disabled}
      style={{ width: '100%', justifyContent: 'center', ...(span ? { gridColumn: '1 / -1' } : {}) }}
    >
      {children}
    </button>
  )
}

export default function ScanPage() {
  usePageMeta({
    title: 'Scan a desk QR code — DeskGuard',
    description: 'Scan the QR sticker on a library desk to check in, set it to Away, or check out. Works in the browser — no app needed.',
    path: '/scan',
  })
  const { desks, loading, error, refetch, checkin, away, checkout, stillHere } = useDesks()

  // Scanner state
  const [cameras, setCameras] = useState([])
  const [activeCameraId, setActiveCameraId] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [fileScanning, setFileScanning] = useState(false)
  const [scanMethod, setScanMethod] = useState('camera') // 'camera' | 'file' | 'manual'

  // Selected desk
  const [selectedDeskId, setSelectedDeskId] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState(null)

  // Sample QR generator
  const [mockDeskId, setMockDeskId] = useState('')
  const [mockQrUrl, setMockQrUrl] = useState('')

  const html5QrCodeRef = useRef(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, type = 'green') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Generate the sample QR for the chosen desk
  useEffect(() => {
    if (!mockDeskId) return
    let cancelled = false
    QRCode.toDataURL(`${window.location.origin}/live?checkin=${mockDeskId}`, {
      width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' },
    })
      .then(url => { if (!cancelled) setMockQrUrl(url) })
      .catch(() => { if (!cancelled) setMockQrUrl('') })
    return () => { cancelled = true }
  }, [mockDeskId])

  useEffect(() => {
    if (desks.length > 0 && !mockDeskId) setMockDeskId(desks[0].id)
  }, [desks, mockDeskId])

  // Stop the camera when leaving the page. Cameras are only enumerated when the
  // user presses "Start scanner", so the permission prompt never appears unprompted.
  useEffect(() => () => {
    const q = html5QrCodeRef.current
    if (q && q.isScanning) q.stop().catch(() => {})
  }, [])

  const stopCamera = useCallback(async () => {
    const q = html5QrCodeRef.current
    if (q && q.isScanning) {
      try { await q.stop() } catch { /* already stopped */ }
    }
    setIsScanning(false)
  }, [])

  const handleDecodedText = useCallback((text) => {
    const deskId = parseDeskId(text)
    if (!deskId) { showToast("⚠ That QR code isn't a DeskGuard desk code.", 'red'); return }
    if (!desks.some(d => d.id === deskId)) { showToast(`⚠ Desk ${deskId} isn't on this floor's map.`, 'amber'); return }
    setSelectedDeskId(deskId)
    showToast(`✓ Desk ${deskId} found`, 'green')
    stopCamera()
  }, [desks, showToast, stopCamera])

  const startCamera = async () => {
    if (cameraStarting) return
    setCameraStarting(true)
    let cameraId = activeCameraId
    try {
      if (!cameraId) {
        let devices = []
        try { devices = await Html5Qrcode.getCameras() } catch {
          showToast('Camera access was blocked. Allow camera access in your browser settings, or use Upload or Manual instead.', 'red')
          return
        }
        if (!devices || devices.length === 0) {
          showToast('No camera was found on this device. Use Upload or Manual instead.', 'red')
          return
        }
        setCameras(devices)
        const back = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0]
        cameraId = back.id
        setActiveCameraId(cameraId)
      }
      if (!document.getElementById('reader')) return
      if (html5QrCodeRef.current?.isScanning) await html5QrCodeRef.current.stop()

      const html5Qr = new Html5Qrcode('reader')
      html5QrCodeRef.current = html5Qr
      setIsScanning(true)
      await html5Qr.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleDecodedText(decodedText),
        () => { /* per-frame "no code found" — expected */ },
      )
    } catch {
      showToast('Could not start the camera. Check camera permissions, or use Upload or Manual instead.', 'red')
      setIsScanning(false)
    } finally {
      setCameraStarting(false)
    }
  }

  const handleFileScan = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) { showToast('Please choose a PNG, JPG, WebP or GIF image.', 'red'); return }
    if (file.size > MAX_UPLOAD_BYTES) { showToast('That image is too large (max 8 MB).', 'red'); return }
    // Decoded entirely in the browser — the image is never uploaded anywhere.
    setFileScanning(true)
    try {
      const decodedText = await new Html5Qrcode('reader-file-temp').scanFile(file, false)
      handleDecodedText(decodedText)
    } catch {
      showToast('No QR code was found in that image.', 'red')
    } finally {
      setFileScanning(false)
    }
  }

  const switchMethod = (m) => { stopCamera(); setScanMethod(m) }

  const runDeskAction = async (actionFn, actionName) => {
    if (!selectedDeskId || actionLoading) return
    setActionLoading(true)
    try {
      await actionFn(selectedDeskId)
      showToast(`✓ ${actionName}: desk ${selectedDeskId}`, 'green')
    } catch (err) {
      showToast(friendlyError(err), 'red')
    } finally {
      setActionLoading(false)
    }
  }

  const currentDesk = desks.find(d => d.id === selectedDeskId)
  const meta = currentDesk ? statusMeta(currentDesk.status) : null
  const toastColor = toast ? (toast.type === 'green' ? '#F0C987' : toast.type === 'amber' ? '#D4AF37' : '#F08AA3') : null

  return (
    <div className={styles.root}>
      {/* Off-screen container required by html5-qrcode's file scanner */}
      <div id="reader-file-temp" aria-hidden="true" style={{ position: 'absolute', top: '-9999px', opacity: 0, pointerEvents: 'none' }} />

      <AppNav />

      <main id="main" className={styles.mainLayout}>
        <div className={styles.container}>
          <div className={styles.header}>
            <div className="eyebrow"><span className="pulse-dot" aria-hidden="true" /> Live desk access</div>
            <h1 className={styles.title}>Scan desk QR code</h1>
            <p className={styles.subtitle}>Scan the QR sticker on your desk to check in, set it to Away, or check out. Decoding happens in your browser — camera images are never uploaded.</p>
          </div>

          {loading && (
            <p className={styles.statusLine} role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Loading desks… the server may take up to 30 seconds to wake.
            </p>
          )}
          {error && (
            <p className={styles.errorLine} role="alert">
              ⚠ {friendlyError(error)} <button type="button" className={styles.btnLink} onClick={refetch}>Retry</button>
            </p>
          )}

          <div className={styles.splitGrid}>
            {/* Scanner */}
            <section className={styles.card} aria-labelledby="scanner-title">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle} id="scanner-title">Scanner</h2>
                <div className={styles.methodTabs} role="group" aria-label="Scan method">
                  {[['camera', 'Camera'], ['file', 'Upload QR'], ['manual', 'Manual desk']].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={scanMethod === key}
                      className={`${styles.tabBtn} ${scanMethod === key ? styles.activeTab : ''}`}
                      onClick={() => switchMethod(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {scanMethod === 'camera' && (
                <div className={styles.scannerWrapper}>
                  <div className={styles.viewport}>
                    <div id="reader" className={styles.reader} />
                    {isScanning && (
                      <>
                        <div className={styles.scannerOverlay} aria-hidden="true"><div className={styles.laserLine} /></div>
                        <div className={styles.scannerCorners} aria-hidden="true">
                          <div className={`${styles.corner} ${styles.topLeft}`} />
                          <div className={`${styles.corner} ${styles.topRight}`} />
                          <div className={`${styles.corner} ${styles.bottomLeft}`} />
                          <div className={`${styles.corner} ${styles.bottomRight}`} />
                        </div>
                      </>
                    )}
                    {!isScanning && (
                      <div className={styles.scannerPlaceholder}>
                        <svg className={styles.placeholderIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p>{cameraStarting ? 'Starting camera…' : 'Press "Start scanner" and allow camera access'}</p>
                      </div>
                    )}
                  </div>

                  <div className={styles.controlsRow}>
                    {cameras.length > 1 && (
                      <div className={styles.selectWrapper}>
                        <label htmlFor="camera-select" className="visually-hidden">Camera</label>
                        <select id="camera-select" value={activeCameraId} onChange={(e) => setActiveCameraId(e.target.value)} className={styles.select} disabled={isScanning}>
                          {cameras.map((cam, i) => <option key={cam.id} value={cam.id}>{cam.label || `Camera ${i + 1}`}</option>)}
                        </select>
                      </div>
                    )}
                    {isScanning ? (
                      <button type="button" className="btn-red" onClick={stopCamera}>Stop camera</button>
                    ) : (
                      <button type="button" className="btn-primary" onClick={startCamera} disabled={cameraStarting}>
                        {cameraStarting ? 'Starting…' : 'Start scanner'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {scanMethod === 'file' && (
                <div className={styles.fileWrapper}>
                  <label className={styles.dropZone} htmlFor="qr-file">
                    <svg className={styles.uploadIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className={styles.dropTitle}>{fileScanning ? 'Reading image…' : 'Upload a photo of the QR code'}</span>
                    <span className={styles.dropHint}>PNG, JPG, WebP or GIF, up to 8 MB. The image stays on your device.</span>
                  </label>
                  <input
                    id="qr-file"
                    type="file"
                    onChange={handleFileScan}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className={styles.fileInput}
                    disabled={fileScanning}
                  />
                </div>
              )}

              {scanMethod === 'manual' && (
                <div className={styles.manualWrapper}>
                  <label htmlFor="manual-desk" className={styles.helpText}>Choose a desk to view and manage its status directly.</label>
                  <div className={styles.selectWrapper}>
                    <select id="manual-desk" onChange={(e) => setSelectedDeskId(e.target.value)} className={styles.select} value={selectedDeskId} disabled={!desks.length}>
                      <option value="">{desks.length ? 'Choose a desk' : loading ? 'Loading desks…' : 'No desks available'}</option>
                      {desks.map(desk => (
                        <option key={desk.id} value={desk.id}>Desk {desk.id} ({statusMeta(desk.status).label})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </section>

            {/* Selected desk / placeholder + sample QR */}
            <div className={styles.sideColumn}>
              {currentDesk ? (
                <section className={`${styles.card} ${styles.actionCard}`} aria-label={`Desk ${currentDesk.id}`} aria-busy={actionLoading}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.deskBadge}>Desk {currentDesk.id}</h2>
                    <span className={styles.statusBadge} style={{ borderColor: meta.onDark, color: meta.onDark }}>
                      <span className="pulse-dot" style={{ background: meta.onDark }} aria-hidden="true" />
                      {meta.label}
                    </span>
                  </div>

                  <dl className={styles.deskSummary}>
                    <div className={styles.metaRow}><dt className={styles.label}>Zone</dt><dd className={styles.value}>{currentDesk.zone}</dd></div>
                    <div className={styles.metaRow}>
                      <dt className={styles.label}>Last updated</dt>
                      <dd className={styles.value}>{currentDesk.state_at ? new Date(currentDesk.state_at).toLocaleTimeString() : 'Never'}</dd>
                    </div>
                  </dl>

                  <div className={styles.actionGrid}>
                    {currentDesk.status === 'free' && <ActionButton cls="btn-primary" onRun={() => runDeskAction(checkin, "Checked in")} disabled={actionLoading} span>✓ Check in</ActionButton>}
                    {currentDesk.status === 'occupied' && (<>
                      <ActionButton cls="btn-amber" onRun={() => runDeskAction(away, "Away hold started")} disabled={actionLoading}>⏸ Going away</ActionButton>
                      <ActionButton cls="btn-red" onRun={() => runDeskAction(checkout, "Checked out")} disabled={actionLoading}>Check out</ActionButton>
                    </>)}
                    {currentDesk.status === 'away' && (<>
                      <ActionButton cls="btn-primary" onRun={() => runDeskAction(checkin, "Welcome back")} disabled={actionLoading}>✓ I'm back</ActionButton>
                      <ActionButton cls="btn-red" onRun={() => runDeskAction(checkout, "Checked out")} disabled={actionLoading}>Check out</ActionButton>
                    </>)}
                    {currentDesk.status === 'still_here_pending' && (<>
                      <ActionButton cls="btn-primary" onRun={() => runDeskAction(stillHere, "Presence confirmed")} disabled={actionLoading}>✓ I'm still here</ActionButton>
                      <ActionButton cls="btn-red" onRun={() => runDeskAction(checkout, "Checked out")} disabled={actionLoading}>Check out</ActionButton>
                    </>)}
                    {currentDesk.status === 'abandoned' && <ActionButton cls="btn-primary" onRun={() => runDeskAction(checkin, "Desk claimed")} disabled={actionLoading} span>✓ Claim this desk</ActionButton>}
                  </div>
                  {actionLoading && <p className={styles.helpText} role="status">Working…</p>}

                  <div className={styles.cardFooter}>
                    <button type="button" className={styles.btnLink} onClick={() => setSelectedDeskId('')}>Clear selection</button>
                  </div>
                </section>
              ) : (
                <div className={`${styles.card} ${styles.placeholderCard}`}>
                  <div className={styles.placeholderContent}>
                    <div className={styles.radarPulse} aria-hidden="true"><div className={styles.pulseInner} /></div>
                    <h2 className={styles.placeholderTitle}>Waiting for a QR scan</h2>
                    <p>Use the camera, upload a photo of the QR code, or pick a desk manually.</p>
                  </div>
                </div>
              )}

              <section className={`${styles.card} ${styles.mockCard}`} aria-labelledby="sample-title">
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle} id="sample-title">Try it without a sticker</h2>
                </div>
                <p className={styles.helpText}>Generate a sample desk QR code to see how scanning works, or download it to test the upload option.</p>

                <div className={styles.mockQrSelectorRow}>
                  <label htmlFor="mock-desk" className={styles.label}>Desk</label>
                  <select id="mock-desk" value={mockDeskId} onChange={(e) => setMockDeskId(e.target.value)} className={styles.selectMini} disabled={!desks.length}>
                    {desks.map(desk => <option key={desk.id} value={desk.id}>Desk {desk.id}</option>)}
                  </select>
                </div>

                <div className={styles.qrCodeWrapper}>
                  {mockQrUrl ? (
                    <button
                      type="button"
                      className={styles.qrCodeImageContainer}
                      onClick={() => handleDecodedText(`${window.location.origin}/live?checkin=${mockDeskId}`)}
                      aria-label={`Simulate scanning the QR code for desk ${mockDeskId}`}
                    >
                      <img src={mockQrUrl} alt="" width="140" height="140" className={styles.qrCodeImage} />
                      <span className={styles.qrOverlayHover} aria-hidden="true"><span>Simulate scan</span></span>
                    </button>
                  ) : (
                    <div className={styles.qrPlaceholder} role="status">{desks.length ? 'Generating QR…' : 'Waiting for desks…'}</div>
                  )}
                </div>

                <div className={styles.mockActionRow}>
                  <button type="button" className="btn-ghost" disabled={!mockDeskId}
                    onClick={() => handleDecodedText(`${window.location.origin}/live?checkin=${mockDeskId}`)}>
                    ⚡ Simulate scan
                  </button>
                  {mockQrUrl && (
                    <a href={mockQrUrl} download={`deskguard-${mockDeskId}-qr.png`} className={styles.downloadLink}>
                      <span aria-hidden="true">⬇</span> Download QR
                    </a>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {toast && (
        <div className={styles.toast} role="status" aria-live="polite" style={{ borderColor: toastColor, color: toastColor }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
