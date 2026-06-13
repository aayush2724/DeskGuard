/**
 * hero-scene.js — 3D library hero preview for the marketing homepage
 * Vanilla Three.js (r128 CDN), no React/Vite needed.
 *
 * • Same geometry as ThreeScene.jsx: desks, legs, monitors, chairs, zone labels
 * • Camera auto-orbits slowly — cinematic, no user interaction
 * • Fetches /api/desks on load and colours desks by live status
 * • Subscribes to /api/events (SSE) and updates colours in real time
 * • Falls back to nothing (leaves CSS grid visible) if Three.js unavailable
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') return;

  const container = document.getElementById('hero-3d');
  if (!container) return;

  /* ── Status colours ─────────────────────────────────── */
  const STATUS = {
    free:               { top: 0x4ade80, emissive: 0x14532d, label: 'Free' },
    occupied:           { top: 0xf87171, emissive: 0x7f1d1d, label: 'Occupied' },
    away:               { top: 0xfbbf24, emissive: 0x78350f, label: 'Away' },
    still_here_pending: { top: 0xfbbf24, emissive: 0x78350f, label: 'Away' },
    abandoned:          { top: 0x6b7280, emissive: 0x1f2937, label: 'Abandoned' },
  };

  /* ── Desk layout (mirrors ThreeScene.jsx exactly) ─── */
  const ZONE_DEFS = [
    { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5, ox: -22, oz: -20 },
    { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5, ox: -22, oz:   4 },
    { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5, ox:   6, oz: -20 },
    { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5, ox:   6, oz:   4 },
    { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10, ox: -22, oz:  22 },
  ];
  const SPACING = 4.8;

  function buildLayout() {
    const out = [];
    ZONE_DEFS.forEach(({ prefix, rows, cols, ox, oz, zone }) => {
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          n++;
          out.push({ id: `${prefix}-${String(n).padStart(2,'0')}`, zone, x: ox + c * SPACING, z: oz + r * SPACING });
        }
      }
    });
    return out;
  }
  const LAYOUT = buildLayout();

  /* ── Build one desk group ───────────────────────────── */
  function buildDesk(status) {
    const s   = STATUS[status] || STATUS.free;
    const grp = new THREE.Group();

    // Table top
    const topMat = new THREE.MeshLambertMaterial({ color: s.top, emissive: s.emissive });
    const top    = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 2.0), topMat);
    top.position.y = 1.3;
    top.castShadow = true;
    grp.add(top);
    grp.userData.topMat = topMat;

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
    [[-1.3,-0.7],[-1.3,0.7],[1.3,-0.7],[1.3,0.7]].forEach(([lx,lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,1.3,8), legMat);
      leg.position.set(lx, 0.65, lz);
      grp.add(leg);
    });

    // Monitor screen
    const mon = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.76, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    mon.position.set(0, 2.08, -0.7);
    mon.rotation.x = -0.12;
    grp.add(mon);

    // Monitor stand
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06,0.06,0.35,8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    stand.position.set(0, 1.57, -0.7);
    grp.add(stand);

    // Chair
    const chairMat = new THREE.MeshLambertMaterial({ color: 0x2a1500 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.4), chairMat);
    seat.position.set(0, 0.9, 1.4);
    grp.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.1), chairMat);
    back.position.set(0, 1.4, 2.05);
    grp.add(back);

    // Floating away-sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0x7a5c00, transparent: true, opacity: 0.9 })
    );
    sphere.position.set(0, 3.8, 0);
    sphere.visible = (status === 'away' || status === 'still_here_pending');
    grp.add(sphere);
    grp.userData.sphere = sphere;

    return grp;
  }

  /* ── Three.js scene setup ───────────────────────────── */
  const W = container.clientWidth;
  const H = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0); // transparent — shader shows through
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x151b23, 0.012);

  const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 300);
  camera.position.set(0, 26, 34);
  camera.lookAt(0, 0, 0);

  /* ── Lighting ───────────────────────────────────────── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.3);
  sun.position.set(12, 28, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near   = 1;
  sun.shadow.camera.far    = 100;
  sun.shadow.camera.left   = -28;
  sun.shadow.camera.right  =  28;
  sun.shadow.camera.top    =  28;
  sun.shadow.camera.bottom = -28;
  scene.add(sun);
  const fill = new THREE.PointLight(0x4ade80, 0.45, 80);
  fill.position.set(-8, 18, -4);
  scene.add(fill);

  /* ── Floor ──────────────────────────────────────────── */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshLambertMaterial({ color: 0x1f2937 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ── Walls ──────────────────────────────────────────── */
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(70, 12, 0.5), wallMat);
  backWall.position.set(0, 6, -26);
  scene.add(backWall);
  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 70), wallMat);
  sideWall.position.set(-26, 6, 0);
  scene.add(sideWall);

  /* ── Zone labels (canvas textures) ─────────────────── */
  ZONE_DEFS.forEach(({ zone, prefix, cols, ox, oz }) => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 26px "Space Mono", monospace';
    ctx.fillStyle = prefix === 'A' ? '#4ade80' : prefix === 'B' ? '#fbbf24' : '#94a3b8';
    ctx.fillText(zone.toUpperCase(), 12, 44);
    const tex   = new THREE.CanvasTexture(cv);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    const cx = ox + (cols * SPACING) / 2 - SPACING / 2;
    plane.position.set(cx, 0.05, oz - 1.8);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
  });

  /* ── Desk objects ───────────────────────────────────── */
  const deskMeshes = {}; // id → Group
  LAYOUT.forEach(({ id, x, z, zone }) => {
    const grp = buildDesk('free');
    grp.userData.deskId = id;
    grp.userData.zone = zone;
    grp.userData.status = 'free';
    grp.position.set(x, 0, z);
    scene.add(grp);
    deskMeshes[id] = grp;
  });

  /* ── Live data: initial fetch ───────────────────────── */
  function applyDesks(desks) {
    desks.forEach(desk => {
      const grp = deskMeshes[desk.id];
      if (!grp) return;
      grp.userData.status = desk.status;
      const s = STATUS[desk.status] || STATUS.free;
      grp.userData.topMat.color.setHex(s.top);
      grp.userData.topMat.emissive.setHex(s.emissive);
      grp.userData.sphere.visible = (desk.status === 'away' || desk.status === 'still_here_pending');
    });
  }

  fetch('/api/desks')
    .then(r => r.json())
    .then(applyDesks)
    .catch(() => {}); // silently ignore if API unavailable

  /* ── SSE: real-time updates ─────────────────────────── */
  try {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'desk_update') applyDesks([msg.desk]);
      } catch {}
    };
  } catch {}

  /* ── Tooltip ────────────────────────────────────────── */
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'absolute',
    background: 'rgba(15,31,22,0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(74,222,128,0.3)',
    padding: '12px 16px',
    borderRadius: '8px',
    color: 'white',
    pointerEvents: 'none',
    zIndex: '100',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    transform: 'translateY(-50%)',
    display: 'none',
    fontFamily: '"Space Grotesk", sans-serif',
  });
  container.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  container.addEventListener('pointermove', (e) => {
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    mouse.x = (px / rect.width) * 2 - 1;
    mouse.y = -(py / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    
    let found = null;
    let deskId = null;
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.deskId) obj = obj.parent;
      if (obj && obj.userData.deskId) {
         found = obj;
         deskId = obj.userData.deskId;
      }
    }
    
    if (found) {
      const status = found.userData.status || 'free';
      const zone = found.userData.zone || '';
      const statusLabel = STATUS[status]?.label || 'Free';
      
      tooltip.innerHTML = `
        <div style="font-size: 11px; color: #4ade80; font-family: 'Space Mono', monospace; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Desk ${deskId}</div>
        <div style="font-size: 15px; font-weight: bold; margin-bottom: 4px;">Status: ${statusLabel}</div>
        <div style="font-size: 12px; color: #9ca3af;">Zone: ${zone}</div>
      `;
      tooltip.style.left = (px + 15) + 'px';
      tooltip.style.top = (py + 15) + 'px';
      tooltip.style.display = 'block';
      container.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      container.style.cursor = 'default';
    }
  });

  /* ── Auto-orbit render loop ─────────────────────────── */
  const clock = new THREE.Clock();
  let theta = 0;

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Slow cinematic orbit — full rotation every ~3.5 min
    theta += 0.00028;
    const R = 38;
    camera.position.x = Math.sin(theta) * R;
    camera.position.z = Math.cos(theta) * R;
    camera.position.y = 24 + Math.sin(t * 0.07) * 2; // gentle vertical bob
    camera.lookAt(0, 0, 0);

    // Animate floating away spheres
    Object.values(deskMeshes).forEach(grp => {
      if (grp.userData.sphere?.visible) {
        grp.userData.sphere.position.y = 3.8 + Math.sin(t * 2 + grp.position.x) * 0.2;
      }
    });

    renderer.render(scene, camera);
  }
  animate();

  /* ── Resize ─────────────────────────────────────────── */
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

})();
