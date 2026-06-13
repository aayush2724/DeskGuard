/**
 * hero-scene.js — Flat grid library map preview for the marketing homepage
 * Matches the "Library Map · Floor 2" card UI from the design reference.
 * • Fetches /api/desks on load and colours desks by live status
 * • Subscribes to /api/events (SSE) for real-time updates
 * • Animates random status transitions in demo/fallback mode
 * No Three.js required — pure DOM/CSS.
 */
(function () {
  'use strict';

  const container = document.getElementById('hero-3d');
  if (!container) return;

  /* ── Status config ───────────────────────────────────── */
  const STATUS = {
    free:               { color: '#F0C987', bg: '#3B153A', bar: '#F0C987', label: 'Free' },
    occupied:           { color: '#D95D7D', bg: '#2A0E29', bar: '#D95D7D', label: 'Occupied' },
    away:               { color: '#D4AF37', bg: '#3B153A', bar: '#D4AF37', label: 'Away' },
    still_here_pending: { color: '#D4AF37', bg: '#3B153A', bar: '#D4AF37', label: 'Away' },
    abandoned:          { color: '#7A5C79', bg: '#1A0819', bar: '#7A5C79', label: 'Abandoned' },
  };

  /* ── Desk layout (mirrors seed.js exactly) ─────────── */
  const ZONE_DEFS = [
    { zone: 'Quiet Study',    prefix: 'A', rows: 4, cols: 5 },
    { zone: 'Collaboration',  prefix: 'B', rows: 3, cols: 5 },
    { zone: 'Reading Lounge', prefix: 'C', rows: 4, cols: 5 },
    { zone: 'Focus Pods',     prefix: 'D', rows: 3, cols: 5 },
    { zone: 'Open Desk',      prefix: 'E', rows: 2, cols: 10 },
  ];

  function buildLayout() {
    const out = [];
    ZONE_DEFS.forEach(({ prefix, rows, cols, zone }) => {
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          n++;
          out.push({ id: `${prefix}-${String(n).padStart(2,'0')}`, zone, prefix });
        }
      }
    });
    return out;
  }
  const LAYOUT = buildLayout();

  /* ── Desk state map ──────────────────────────────────── */
  const deskState = {};
  LAYOUT.forEach(d => { deskState[d.id] = 'free'; });

  /* ── Seed with random demo states ───────────────────── */
  function seedDemoStates() {
    const statuses = ['free', 'free', 'free', 'occupied', 'occupied', 'away', 'abandoned'];
    LAYOUT.forEach(d => {
      deskState[d.id] = statuses[Math.floor(Math.random() * statuses.length)];
    });
  }
  seedDemoStates();

  /* ── Build the card HTML ────────────────────────────── */
  container.style.cssText = `
    width: 100%; 
    border-radius: 18px;
    overflow: hidden;
    position: relative;
    background: transparent;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: #3B153A;
    border-radius: 18px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3);
    padding: 20px 22px 18px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(240, 201, 135, 0.2);
  `;

  /* Card header */
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(207, 201, 177, 0.08);
  `;

  const dotWrap = document.createElement('div');
  dotWrap.style.cssText = 'display: flex; align-items: center; gap: 7px;';
  const liveDot = document.createElement('span');
  liveDot.style.cssText = `
    width: 10px; height: 10px; border-radius: 50%;
    background: #E7E0C9;
    display: inline-block;
    box-shadow: 0 0 0 3px rgba(34,197,94,.2);
    animation: mapPulse 2s infinite;
  `;

  // Inject keyframe animation once
  if (!document.getElementById('map-pulse-kf')) {
    const kfStyle = document.createElement('style');
    kfStyle.id = 'map-pulse-kf';
    kfStyle.textContent = `
      @keyframes mapPulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,.25); }
        50% { box-shadow: 0 0 0 7px rgba(34,197,94,.05); }
      }
      @keyframes deskFlip {
        0% { transform: scaleY(1); opacity: 1; }
        40% { transform: scaleY(0.6); opacity: 0.5; }
        100% { transform: scaleY(1); opacity: 1; }
      }
    `;
    document.head.appendChild(kfStyle);
  }

  dotWrap.appendChild(liveDot);

  const title = document.createElement('span');
  title.style.cssText = `
    font-size: 14px; font-weight: 700; color: #F0C987;
    letter-spacing: -0.01em;
  `;
  title.textContent = 'Library Map · Floor 2';

  header.appendChild(dotWrap);
  header.appendChild(title);
  card.appendChild(header);

  /* ── Grid container (all zones shown in rows) ─────── */
  const gridWrap = document.createElement('div');
  gridWrap.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 340px;
    overflow: hidden;
  `;

  /* Build a visible subset: A, B, C zones (3 rows of 10) */
  const PREVIEW_ZONES = ['A', 'B', 'C'];
  const previewDesks = LAYOUT.filter(d => PREVIEW_ZONES.includes(d.prefix));

  /* Chunk into rows of 10 */
  const COLS = 10;
  const rows = [];
  for (let i = 0; i < previewDesks.length; i += COLS) {
    rows.push(previewDesks.slice(i, i + COLS));
  }

  /* DOM refs for updating */
  const deskEls = {}; // id → { el, bar }

  rows.forEach(rowDesks => {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; gap: 6px;`;

    rowDesks.forEach(desk => {
      const s = STATUS[deskState[desk.id]] || STATUS.free;
      const cell = document.createElement('div');
      cell.style.cssText = `
        flex: 1;
        background: ${s.bg};
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: 9px;
        padding: 7px 4px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: default;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        position: relative;
        min-width: 0;
      `;

      cell.addEventListener('mouseenter', () => {
        cell.style.transform = 'translateY(-2px)';
        cell.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
      });
      cell.addEventListener('mouseleave', () => {
        cell.style.transform = '';
        cell.style.boxShadow = '';
      });

      const label = document.createElement('span');
      label.style.cssText = `
        font-size: 9.5px;
        font-weight: 700;
        color: ${s.color};
        font-family: 'Space Mono', monospace;
        letter-spacing: -0.02em;
        white-space: nowrap;
      `;
      label.textContent = desk.id;

      const bar = document.createElement('div');
      bar.style.cssText = `
        width: 100%;
        height: 4px;
        background: ${s.bar};
        border-radius: 0 0 8px 8px;
        margin-top: 4px;
        transition: background 0.4s ease;
      `;

      cell.appendChild(label);
      cell.appendChild(bar);
      row.appendChild(cell);

      deskEls[desk.id] = { cell, label, bar };
    });

    gridWrap.appendChild(row);
  });

  card.appendChild(gridWrap);

  /* ── Legend ─────────────────────────────────────────── */
  const legend = document.createElement('div');
  legend.style.cssText = `
    display: flex;
    gap: 18px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(207, 201, 177, 0.08);
    flex-wrap: wrap;
  `;

  [
    { key: 'free',      label: 'Free' },
    { key: 'occupied',  label: 'Occupied' },
    { key: 'away',      label: 'Away' },
    { key: 'abandoned', label: 'Abandoned' },
  ].forEach(({ key, label }) => {
    const s = STATUS[key];
    const item = document.createElement('span');
    item.style.cssText = `
      display: flex; align-items: center; gap: 7px;
      font-size: 11px; color: #E7D3B5; font-weight: 500;
    `;
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 14px; height: 10px;
      background: ${s.bar};
      border-radius: 3px;
      display: inline-block;
      opacity: 0.85;
    `;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  });

  card.appendChild(legend);
  container.appendChild(card);

  /* ── Update a single desk cell's appearance ────────── */
  function applyDeskStatus(id, status) {
    const s = STATUS[status] || STATUS.free;
    const els = deskEls[id];
    if (!els) return;

    // Quick flip animation
    els.cell.style.animation = 'deskFlip 0.4s ease';
    setTimeout(() => { els.cell.style.animation = ''; }, 400);

    els.cell.style.background = s.bg;
    els.label.style.color = s.color;
    els.bar.style.background = s.bar;
  }

  /* ── Apply bulk desks from API ───────────────────────── */
  function applyDesks(desks) {
    desks.forEach(desk => {
      if (deskEls[desk.id]) {
        deskState[desk.id] = desk.status;
        applyDeskStatus(desk.id, desk.status);
      }
    });
  }

  /* ── Live data: fetch + SSE ──────────────────────────── */
  fetch('/api/desks')
    .then(r => r.json())
    .then(applyDesks)
    .catch(() => {
      // No API available — keep the seeded demo states visible
    });

  try {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'desk_update' && deskEls[msg.desk.id]) {
          deskState[msg.desk.id] = msg.desk.status;
          applyDeskStatus(msg.desk.id, msg.desk.status);
        }
      } catch {}
    };
  } catch {}

  /* ── Demo animation: cycle random desk states ─────────
     Runs indefinitely to make the preview feel alive,
     but only changes desks that aren't overridden by live data. */
  let liveDataLoaded = false;
  fetch('/api/desks').then(() => { liveDataLoaded = true; }).catch(() => {});

  const CYCLE_STATUSES = ['free', 'occupied', 'away', 'free', 'free', 'occupied'];
  const previewIds = Object.keys(deskEls);

  function cycleRandomDesk() {
    if (liveDataLoaded) return; // don't animate over live data
    const id = previewIds[Math.floor(Math.random() * previewIds.length)];
    const next = CYCLE_STATUSES[Math.floor(Math.random() * CYCLE_STATUSES.length)];
    deskState[id] = next;
    applyDeskStatus(id, next);
  }

  // Stagger initial demo animation start
  setTimeout(() => {
    setInterval(cycleRandomDesk, 1400);
  }, 800);

})();
