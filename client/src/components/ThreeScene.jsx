/**
 * ThreeScene.jsx — 3D library floor matching the lovable.app reference.
 * Dark maroon floor, 3D desks coloured by status, OrbitControls, raycasting.
 * Desk state changes are applied reactively without rebuilding the scene.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ── Status colours ──────────────────────────────────────
const STATUS = {
  free:               { top: 0x4ade80, emissive: 0x14532d, label: 'Free' },
  occupied:           { top: 0xf87171, emissive: 0x7f1d1d, label: 'Occupied' },
  away:               { top: 0xfbbf24, emissive: 0x78350f, label: 'Away' },
  still_here_pending: { top: 0xfbbf24, emissive: 0x78350f, label: 'Away' },
  abandoned:          { top: 0x6b7280, emissive: 0x1f2937, label: 'Abandoned' },
}

// ── Desk layout ─────────────────────────────────────────
// id, zone, 3D position offsets from zone origin
const ZONE_DEFS = [
  { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5, ox: -22, oz: -20 },
  { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5, ox: -22, oz:   4 },
  { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5, ox:   6, oz: -20 },
  { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5, ox:   6, oz:   4 },
  { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10, ox: -22, oz:  22 },
]
const DESK_SPACING = 4.8

function buildLayout() {
  const layout = []
  ZONE_DEFS.forEach(({ zone, prefix, rows, cols, ox, oz }) => {
    let n = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        n++
        layout.push({
          id:   `${prefix}-${String(n).padStart(2,'0')}`,
          zone,
          x:    ox + c * DESK_SPACING,
          z:    oz + r * DESK_SPACING,
        })
      }
    }
  })
  return layout
}
const LAYOUT = buildLayout()

// ── Build one desk group ─────────────────────────────────
function buildDeskGroup(status) {
  const s   = STATUS[status] || STATUS.free
  const grp = new THREE.Group()

  // Table top
  const topMat = new THREE.MeshLambertMaterial({ color: s.top, emissive: s.emissive })
  const top    = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 2.0), topMat)
  top.position.y = 1.3
  top.castShadow = true
  grp.add(top)
  grp.userData.topMesh = top
  grp.userData.topMat  = topMat

  // Legs
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e })
  ;[[-1.3,-0.7],[-1.3,0.7],[1.3,-0.7],[1.3,0.7]].forEach(([lx,lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.3,8), legMat)
    leg.position.set(lx, 0.65, lz)
    grp.add(leg)
  })

  // Monitor screen (dark)
  const monMat = new THREE.MeshLambertMaterial({ color: 0x111111 })
  const mon    = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.76, 0.06), monMat)
  mon.position.set(0, 2.08, -0.7)
  mon.rotation.x = -0.12
  grp.add(mon)

  // Monitor stand
  const standMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
  const stand    = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.35,8), standMat)
  stand.position.set(0, 1.57, -0.7)
  grp.add(stand)

  // Chair (simple box)
  const chairMat = new THREE.MeshLambertMaterial({ color: 0x2a1500 })
  const seat     = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.4), chairMat)
  seat.position.set(0, 0.9, 1.4)
  grp.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.1), chairMat)
  back.position.set(0, 1.4, 2.05)
  grp.add(back)

  // Floating sphere (shown only for 'away')
  const sphereMat = new THREE.MeshLambertMaterial({
    color: 0xfbbf24, emissive: 0x7a5c00, transparent: true, opacity: 0.9
  })
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), sphereMat)
  sphere.position.set(0, 3.8, 0)
  sphere.visible = (status === 'away' || status === 'still_here_pending')
  grp.add(sphere)
  grp.userData.sphere = sphere

  // Selection ring (hidden by default)
  const ringGeo = new THREE.RingGeometry(2.2, 2.5, 48)
  ringGeo.rotateX(-Math.PI / 2)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  const ring    = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.02
  ring.visible = false
  grp.add(ring)
  grp.userData.ring = ring

  // Make all child meshes point back to group for raycasting
  grp.traverse(obj => { if (obj.isMesh) obj.userData.deskGroup = grp })

  return grp
}

// ── React component ──────────────────────────────────────
export default function ThreeScene({ desks, onSelectDesk, selectedDeskId }) {
  const mountRef  = useRef(null)
  const sceneRef  = useRef(null)
  const cameraRef = useRef(null)
  const rendRef   = useRef(null)
  const ctrlRef   = useRef(null)
  const deskMeshes= useRef({})   // { id: THREE.Group }
  const rafRef    = useRef(null)
  const clockRef  = useRef(new THREE.Clock())
  const [hoverInfo, setHoverInfo] = useState(null)

  // ── Init Three.js once ────────────────────────────────
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x151b23)
    el.appendChild(renderer.domElement)
    rendRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x151b23, 0.012)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(48, el.clientWidth / el.clientHeight, 0.1, 400)
    camera.position.set(0, 28, 36)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance   = 10
    controls.maxDistance   = 80
    controls.maxPolarAngle = Math.PI / 2.1
    controls.update()
    ctrlRef.current = controls

    // ── Lighting ─────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.3)
    sun.position.set(15, 30, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near   = 1
    sun.shadow.camera.far    = 120
    sun.shadow.camera.left   = -30
    sun.shadow.camera.right  =  30
    sun.shadow.camera.top    =  30
    sun.shadow.camera.bottom = -30
    scene.add(sun)
    // Vibrant techy fill light
    const fill = new THREE.PointLight(0x4ade80, 0.45, 60)
    fill.position.set(-10, 15, -5)
    scene.add(fill)

    // ── Floor ─────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(80, 80)
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    const floor    = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    // ── Walls ─────────────────────────────────────────────
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x111827 })
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(80, 14, 0.6), wallMat)
    backWall.position.set(0, 7, -28)
    scene.add(backWall)
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, 80), wallMat)
    sideWall.position.set(-28, 7, 0)
    scene.add(sideWall)

    // ── Zone label planes (3D text via canvas texture) ─────
    ZONE_DEFS.forEach(({ zone, prefix, rows, cols, ox, oz }) => {
      const canvas  = document.createElement('canvas')
      canvas.width  = 512; canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'rgba(0,0,0,0)'
      ctx.fillRect(0,0,512,64)
      ctx.font = 'bold 28px "Space Mono", monospace'
      ctx.fillStyle = prefix === 'A' ? '#F0C987' : prefix === 'B' ? '#fbbf24' : '#94a3b8'
      ctx.fillText(zone.toUpperCase(), 12, 44)
      const tex   = new THREE.CanvasTexture(canvas)
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
      )
      const cx = ox + (cols * DESK_SPACING) / 2 - DESK_SPACING / 2
      plane.position.set(cx, 0.05, oz - 1.8)
      plane.rotation.x = -Math.PI / 2
      scene.add(plane)
    })

    // ── Desk objects (seeded with 'free') ─────────────────
    LAYOUT.forEach(({ id, x, z }) => {
      const grp = buildDeskGroup('free')
      grp.position.set(x, 0, z)
      grp.userData.deskId = id
      scene.add(grp)
      deskMeshes.current[id] = grp
    })

    // ── Raycaster ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()

    function onClick(e) {
      const rect = el.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      if (!hits.length) return
      const hit = hits[0].object
      let obj = hit
      while (obj && !obj.userData.deskId) obj = obj.parent
      if (obj && obj.userData.deskId) onSelectDesk(obj.userData.deskId)
    }

    function onPointerMove(e) {
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      mouse.x = (px / rect.width) * 2 - 1
      mouse.y = -(py / rect.height) * 2 + 1
      
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      
      let found = null
      if (hits.length) {
        let obj = hits[0].object
        while (obj && !obj.userData.deskId) obj = obj.parent
        if (obj && obj.userData.deskId) {
           found = obj.userData.deskId
        }
      }
      
      if (found) {
        setHoverInfo({ id: found, x: px, y: py })
      } else {
        setHoverInfo(null)
      }
    }

    el.addEventListener('click', onClick)
    el.addEventListener('pointermove', onPointerMove)

    // ── Render loop ───────────────────────────────────────
    let frame = null
    function animate() {
      frame = requestAnimationFrame(animate)
      const t = clockRef.current.getElapsedTime()
      controls.update()

      // Animate floating away spheres
      Object.values(deskMeshes.current).forEach(grp => {
        if (grp.userData.sphere?.visible) {
          grp.userData.sphere.position.y = 3.8 + Math.sin(t * 2 + grp.position.x) * 0.2
        }
      })

      renderer.render(scene, camera)
    }
    animate()
    rafRef.current = frame

    // Resize
    function onResize() {
      const w = el.clientWidth, h = el.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
      el.removeEventListener('click', onClick)
      el.removeEventListener('pointermove', onPointerMove)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }, []) // only once

  // ── Update desk colours when state changes ─────────────
  useEffect(() => {
    desks.forEach(desk => {
      const grp = deskMeshes.current[desk.id]
      if (!grp) return
      const s = STATUS[desk.status] || STATUS.free
      grp.userData.topMat.color.setHex(s.top)
      grp.userData.topMat.emissive.setHex(s.emissive)
      grp.userData.sphere.visible = (desk.status === 'away' || desk.status === 'still_here_pending')
    })
  }, [desks])

  // ── Selection ring ─────────────────────────────────────
  useEffect(() => {
    Object.entries(deskMeshes.current).forEach(([id, grp]) => {
      grp.userData.ring.visible = (id === selectedDeskId)
    })
  }, [selectedDeskId])

  const hoveredDesk = hoverInfo ? desks.find(d => d.id === hoverInfo.id) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', cursor: hoverInfo ? 'pointer' : 'crosshair' }}
      />
      {hoverInfo && hoveredDesk && (
        <div style={{
          position: 'absolute',
          left: hoverInfo.x + 15,
          top: hoverInfo.y + 15,
          background: 'rgba(15,31,22,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(74,222,128,0.3)',
          padding: '12px 16px',
          borderRadius: '8px',
          color: 'white',
          pointerEvents: 'none',
          zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          transform: 'translateY(-50%)'
        }}>
          <div style={{ fontSize: '11px', color: '#F0C987', fontFamily: 'monospace', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desk {hoveredDesk.id}</div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '4px' }}>Status: {STATUS[hoveredDesk.status]?.label || 'Free'}</div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>Zone: {hoveredDesk.zone}</div>
        </div>
      )}
    </div>
  )
}
