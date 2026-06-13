import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import QRCode from 'qrcode'
import { useDesks } from '../hooks/useDesks.js'
import styles from './ScanPage.module.css'

export default function ScanPage() {
  const { desks, loading, error, checkin, away, checkout, stillHere } = useDesks()
  
  // Scanner state
  const [cameras, setCameras] = useState([])
  const [activeCameraId, setActiveCameraId] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanMethod, setScanMethod] = useState('camera') // 'camera' | 'file' | 'manual'
  const [scannedText, setScannedText] = useState('')
  
  // Selected Desk details
  const [selectedDeskId, setSelectedDeskId] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState(null)
  
  // Mock QR Code state
  const [mockDeskId, setMockDeskId] = useState('')
  const [mockQrUrl, setMockQrUrl] = useState('')
  
  const html5QrCodeRef = useRef(null)
  const fileInputRef = useRef(null)

  const showToast = useCallback((msg, type = 'green') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Generate mock QR Code url on selected mock desk change
  useEffect(() => {
    const qrText = `${window.location.origin}/live?checkin=${mockDeskId}`
    QRCode.toDataURL(qrText, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000', // standard black foreground
        light: '#ffffff' // standard white background
      }
    })
    .then(url => setMockQrUrl(url))
    .catch(err => console.error("Error generating mock QR code:", err))
  }, [mockDeskId])

  // Initialize mockDeskId to first available desk once desks load
  useEffect(() => {
    if (desks.length > 0 && !mockDeskId) {
      setMockDeskId(desks[0].id)
    }
  }, [desks, mockDeskId])

  // Get list of cameras on mount
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length > 0) {
          setCameras(devices)
          setActiveCameraId(devices[0].id)
        }
      })
      .catch(err => {
        console.warn("Could not retrieve camera list:", err)
      })

    return () => {
      // Cleanup running scanners on unmount
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(err => console.error("Unmount cleanup error:", err))
      }
    }
  }, [])

  // Process decoded QR text
  const handleDecodedText = useCallback((text) => {
    let deskId = ''
    try {
      const url = new URL(text)
      deskId = url.searchParams.get('checkin')
    } catch (e) {
      // Not a valid URL, check if text matches a desk pattern (e.g. D-04, A-01, D04, A01)
      const match = text.match(/([A-E]-?\d+)/i)
      if (match) {
        deskId = match[1].toUpperCase()
      }
    }

    if (deskId) {
      // Validate that it exists in the desk list
      const exists = desks.some(d => d.id === deskId)
      if (exists) {
        setSelectedDeskId(deskId)
        setScannedText(text)
        showToast(`✓ Desk ${deskId} detected successfully!`, 'green')
        
        // Stop scanning to focus on the desk details
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop()
            .then(() => setIsScanning(false))
            .catch(err => console.error("Stop scanning error:", err))
        } else {
          setIsScanning(false)
        }
      } else {
        showToast(`⚠ Desk "${deskId}" not found in local records.`, 'amber')
      }
    } else {
      showToast(`⚠ Invalid QR code content: "${text.substring(0, 32)}..."`, 'red')
    }
  }, [desks, showToast])

  // Start camera scanning
  const startCamera = async () => {
    if (!activeCameraId) {
      showToast("No camera selected or available.", 'red')
      return
    }
    
    // Ensure scanner container is mounted in DOM
    const element = document.getElementById('reader')
    if (!element) return

    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
      }
      
      const html5Qr = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5Qr
      setIsScanning(true)
      
      await html5Qr.start(
        activeCameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          handleDecodedText(decodedText)
        },
        (errorMsg) => {
          // Verbose scan fails, silent ignore
        }
      )
    } catch (err) {
      console.error("Failed to start camera scan:", err)
      showToast("Could not start camera scanner. Check permissions.", 'red')
      setIsScanning(false)
    }
  }

  // Stop camera scanning
  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
        setIsScanning(false)
      } catch (err) {
        console.error("Failed to stop scanner:", err)
      }
    }
  }

  // Handle uploaded image scan
  const handleFileScan = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const html5Qr = new Html5Qrcode("reader-file-temp")
      const decodedText = await html5Qr.scanFile(file, true)
      handleDecodedText(decodedText)
    } catch (err) {
      console.error("File scan failed:", err)
      showToast("No QR code detected in this image.", 'red')
    }
  }

  // Handle manual input selection
  const handleManualSelect = (e) => {
    const id = e.target.value
    if (id) {
      setSelectedDeskId(id)
      showToast(`Selected Desk ${id}`, 'green')
    } else {
      setSelectedDeskId('')
    }
  }

  // Run desk action
  const runDeskAction = async (actionFn, actionName) => {
    if (!selectedDeskId) return
    setActionLoading(true)
    try {
      await actionFn(selectedDeskId)
      showToast(`✓ Operation successful: ${actionName}`, 'green')
    } catch (err) {
      console.error(err)
      showToast(`Failed to perform action: ${err.message}`, 'red')
    } finally {
      setActionLoading(false)
    }
  }

  // Get details of selected desk
  const currentDesk = desks.find(d => d.id === selectedDeskId)

  // Status indicators
  const getStatusLabel = (status) => {
    if (status === 'still_here_pending') return 'Away (Grace Period)'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'free': return '#4ade80'
      case 'occupied': return '#f87171'
      case 'away':
      case 'still_here_pending': return '#fbbf24'
      case 'abandoned': return '#9ca3af'
      default: return '#9ca3af'
    }
  }

  return (
    <div className={styles.root}>
      {/* Hidden container required by file reader scan */}
      <div id="reader-file-temp" style={{ position: 'absolute', top: '-9999px', opacity: 0, pointerEvents: 'none' }} />

      {/* Nav */}
      <nav className="nav">
        <div className="nav-inner">
          <a href={import.meta.env.DEV ? "http://localhost:3001/" : "/"} className="nav-logo">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#4ADE80"/>
              <rect x="13" y="1" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="1" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.4"/>
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#4ADE80" opacity="0.7"/>
            </svg>
            DeskGuard
          </a>
          <div className="nav-links">
            <a href={import.meta.env.DEV ? "http://localhost:3001/#how" : "/#how"}>How it works</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/#bookshelf" : "/#bookshelf"}>Features</a>
            <a href="/live" className={window.location.pathname.startsWith('/live') ? "active" : ""}>Live Map</a>
            <a href="/scan" className={window.location.pathname.startsWith('/scan') ? "active" : ""}>Scan QR</a>
            <a href="/librarian" className={window.location.pathname.startsWith('/librarian') ? "active" : ""}>Librarian</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/docs.html" : "/docs.html"}>Docs</a>
            <a href={import.meta.env.DEV ? "http://localhost:3001/contact.html" : "/contact.html"} className="nav-cta">Get early access</a>
          </div>
        </div>
      </nav>

      {/* Content layout */}
      <div className={styles.mainLayout}>
        <div className={styles.container}>
          
          {/* Header */}
          <div className={styles.header}>
            <div className="eyebrow"><span className="pulse-dot" /> Live Desk Access</div>
            <h1 className={styles.title}>Scan Desk QR Code</h1>
            <p className={styles.subtitle}>Scan the physical QR sticker on your desk to check in, update status, or checkout.</p>
          </div>

          <div className={styles.splitGrid}>
            
            {/* Left side: The QR Scanner block */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Scanner Viewport</h2>
                <div className={styles.methodTabs}>
                  <button 
                    className={`${styles.tabBtn} ${scanMethod === 'camera' ? styles.activeTab : ''}`}
                    onClick={() => { stopCamera(); setScanMethod('camera') }}
                  >
                    Camera
                  </button>
                  <button 
                    className={`${styles.tabBtn} ${scanMethod === 'file' ? styles.activeTab : ''}`}
                    onClick={() => { stopCamera(); setScanMethod('file') }}
                  >
                    Upload QR
                  </button>
                  <button 
                    className={`${styles.tabBtn} ${scanMethod === 'manual' ? styles.activeTab : ''}`}
                    onClick={() => { stopCamera(); setScanMethod('manual') }}
                  >
                    Manual Desk
                  </button>
                </div>
              </div>

              {/* Camera scanner method */}
              {scanMethod === 'camera' && (
                <div className={styles.scannerWrapper}>
                  <div className={styles.viewport}>
                    <div id="reader" className={styles.reader} />
                    {isScanning && (
                      <>
                        <div className={styles.scannerOverlay}>
                          <div className={styles.laserLine} />
                        </div>
                        <div className={styles.scannerCorners}>
                          <div className={`${styles.corner} ${styles.topLeft}`} />
                          <div className={`${styles.corner} ${styles.topRight}`} />
                          <div className={`${styles.corner} ${styles.bottomLeft}`} />
                          <div className={`${styles.corner} ${styles.bottomRight}`} />
                        </div>
                      </>
                    )}
                    {!isScanning && (
                      <div className={styles.scannerPlaceholder}>
                        <svg className={styles.placeholderIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p>Camera scanner is ready</p>
                      </div>
                    )}
                  </div>

                  <div className={styles.controlsRow}>
                    <div className={styles.selectWrapper}>
                      <select 
                        value={activeCameraId} 
                        onChange={(e) => setActiveCameraId(e.target.value)}
                        className={styles.select}
                        disabled={isScanning}
                      >
                        {cameras.length === 0 && <option value="">No cameras detected</option>}
                        {cameras.map(cam => (
                          <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cameras.indexOf(cam) + 1}`}</option>
                        ))}
                      </select>
                    </div>

                    {isScanning ? (
                      <button className="btn-red" onClick={stopCamera}>
                        Stop Camera
                      </button>
                    ) : (
                      <button className="btn-primary" onClick={startCamera}>
                        Start Scanner
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upload image file method */}
              {scanMethod === 'file' && (
                <div className={styles.fileWrapper}>
                  <div 
                    className={styles.dropZone}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg className={styles.uploadIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <h3>Upload QR Screenshot</h3>
                    <p>Click to browse image files (PNG, JPG, SVG)</p>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileScan}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              )}

              {/* Manual input search method */}
              {scanMethod === 'manual' && (
                <div className={styles.manualWrapper}>
                  <p className={styles.helpText}>Choose a desk from the list to view and manage its status directly.</p>
                  <div className={styles.selectWrapper}>
                    <select 
                      onChange={handleManualSelect} 
                      className={styles.select}
                      value={selectedDeskId}
                    >
                      <option value="">-- Choose a Desk --</option>
                      {desks.map(desk => (
                        <option key={desk.id} value={desk.id}>Desk {desk.id} ({getStatusLabel(desk.status)})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

            </div>

            {/* Right side: Selected Desk details & actions OR prompt */}
            <div className={styles.sideColumn}>
              
              {/* Active Desk Action Panel */}
              {currentDesk ? (
                <div className={`${styles.card} ${styles.actionCard}`}>
                  <div className={styles.cardHeader}>
                    <div className={styles.deskBadge}>Desk {currentDesk.id}</div>
                    <span 
                      className={styles.statusBadge}
                      style={{ 
                        borderColor: getStatusColor(currentDesk.status),
                        color: getStatusColor(currentDesk.status) 
                      }}
                    >
                      <span className="pulse-dot" style={{ background: getStatusColor(currentDesk.status) }} />
                      {getStatusLabel(currentDesk.status)}
                    </span>
                  </div>

                  <div className={styles.deskSummary}>
                    <div className={styles.metaRow}>
                      <span className={styles.label}>Zone</span>
                      <strong className={styles.value}>{currentDesk.id.startsWith('A') ? 'Quiet Study (A)' : currentDesk.id.startsWith('B') ? 'Collaboration (B)' : currentDesk.id.startsWith('C') ? 'Reading Lounge (C)' : currentDesk.id.startsWith('D') ? 'Focus Pods (D)' : 'Open Desk (E)'}</strong>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.label}>Last Updated</span>
                      <strong className={styles.value}>
                        {currentDesk.state_at ? new Date(currentDesk.state_at).toLocaleTimeString() : 'Never'}
                      </strong>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className={styles.actionGrid}>
                    
                    {currentDesk.status === 'free' && (
                      <button 
                        className="btn-primary" 
                        onClick={() => runDeskAction(checkin, 'Check In')}
                        disabled={actionLoading}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        ✓ Claim / Check In
                      </button>
                    )}

                    {(currentDesk.status === 'occupied' || currentDesk.status === 'still_here_pending') && (
                      <>
                        <button 
                          className="btn-amber" 
                          onClick={() => runDeskAction(away, 'Away Hold')}
                          disabled={actionLoading}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          ⏸ Go Away (Hold Desk)
                        </button>
                        
                        <button 
                          className="btn-red" 
                          onClick={() => runDeskAction(checkout, 'Check Out')}
                          disabled={actionLoading}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          🚪 Release / Check Out
                        </button>
                      </>
                    )}

                    {currentDesk.status === 'away' && (
                      <>
                        <button 
                          className="btn-primary" 
                          onClick={() => runDeskAction(checkin, 'Return Check In')}
                          disabled={actionLoading}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          ✓ Return to Desk
                        </button>
                        
                        <button 
                          className="btn-red" 
                          onClick={() => runDeskAction(checkout, 'Check Out')}
                          disabled={actionLoading}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          🚪 Release / Check Out
                        </button>
                      </>
                    )}

                    {currentDesk.status === 'abandoned' && (
                      <button 
                        className="btn-primary" 
                        onClick={() => runDeskAction(checkin, 'Claim Abandoned')}
                        disabled={actionLoading}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        ✓ Claim / Re-check In
                      </button>
                    )}

                    {currentDesk.status === 'still_here_pending' && (
                      <button 
                        className="btn-primary" 
                        onClick={() => runDeskAction(stillHere, 'Confirm Presence')}
                        disabled={actionLoading}
                        style={{ width: '100%', justifyContent: 'center', gridColumn: 'span 2' }}
                      >
                        ✓ Confirm I am Still Here
                      </button>
                    )}

                  </div>

                  <div className={styles.cardFooter}>
                    <button className={styles.btnLink} onClick={() => setSelectedDeskId('')}>
                      Clear Selection
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`${styles.card} ${styles.placeholderCard}`}>
                  <div className={styles.placeholderContent}>
                    <div className={styles.radarPulse}>
                      <div className={styles.pulseInner} />
                    </div>
                    <h3>Waiting for QR Scan</h3>
                    <p>Use the camera, upload a QR screenshot, or use the interactive generator below to detect a library desk.</p>
                  </div>
                </div>
              )}

              {/* Interactive Mock QR Generator Panel */}
              <div className={`${styles.card} ${styles.mockCard}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Interactive Mock QR Generator</h3>
                </div>
                <p className={styles.helpText}>Generate a simulated QR code sticker for local testing. Click the code to scan instantly or download to test file upload.</p>
                
                <div className={styles.mockQrSelectorRow}>
                  <span className={styles.label}>Select Desk:</span>
                  <select 
                    value={mockDeskId}
                    onChange={(e) => setMockDeskId(e.target.value)}
                    className={styles.selectMini}
                  >
                    {desks.map(desk => (
                      <option key={desk.id} value={desk.id}>Desk {desk.id}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.qrCodeWrapper}>
                  {mockQrUrl ? (
                    <div 
                      className={styles.qrCodeImageContainer}
                      onClick={() => handleDecodedText(`${window.location.origin}/live?checkin=${mockDeskId}`)}
                      title="Click to instantly simulate scanning this QR code!"
                    >
                      <img src={mockQrUrl} alt="Mock QR Code" className={styles.qrCodeImage} />
                      <div className={styles.qrOverlayHover}>
                        <span>Simulate Scan</span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.qrPlaceholder}>Generating QR...</div>
                  )}
                </div>

                <div className={styles.mockActionRow}>
                  <button 
                    className="btn-ghost"
                    onClick={() => handleDecodedText(`${window.location.origin}/live?checkin=${mockDeskId}`)}
                  >
                    ⚡ Click to Scan
                  </button>
                  {mockQrUrl && (
                    <a 
                      href={mockQrUrl} 
                      download={`deskguard-${mockDeskId}-qr.png`}
                      className={styles.downloadLink}
                    >
                      ⬇ Download QR
                    </a>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>

      {/* Toast feedback */}
      {toast && (
        <div 
          className={styles.toast} 
          style={{ 
            borderColor: toast.type === 'green' ? '#4ade80' : toast.type === 'amber' ? '#fbbf24' : '#f87171',
            color: toast.type === 'green' ? '#4ade80' : toast.type === 'amber' ? '#fbbf24' : '#f87171'
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
