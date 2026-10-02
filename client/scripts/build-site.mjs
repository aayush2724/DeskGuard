/**
 * build-site.mjs — assembles the deployable site in client/dist after `vite build`.
 *
 *   dist/            ← Vite output (React app; index.html renamed to app.html)
 *   dist/*.html      ← static marketing pages (client/marketing)
 *   dist/vendor/     ← self-hosted GSAP (from node_modules)
 *   dist/config.js   ← generated from public env vars
 *
 * Runs on Vercel via `npm run build`. Only PUBLIC values are written to config.js.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const marketing = path.join(root, 'marketing')

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[build-site] dist/index.html missing — run `vite build` first')
  process.exit(1)
}

// 1. The React SPA shell becomes app.html; the marketing landing page becomes index.html
fs.renameSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'))

// 2. Copy marketing pages and assets (config.js is generated below)
for (const f of fs.readdirSync(marketing)) {
  if (f === 'config.js') continue
  fs.copyFileSync(path.join(marketing, f), path.join(dist, f))
}

// 3. Self-hosted GSAP (free under the GSAP Standard License: https://gsap.com/standard-license)
fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true })
for (const f of ['gsap.min.js', 'ScrollTrigger.min.js']) {
  fs.copyFileSync(path.join(root, 'node_modules/gsap/dist', f), path.join(dist, 'vendor', f))
}

// 4. Runtime config for the static pages from public env vars
const isUrl = (v) => !v || /^https?:\/\/[^\s"'<>]+$/.test(v) || /^\/[^\s"'<>]*$/.test(v)
const isEmail = (v) => !v || /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(v)
const cfg = {
  apiBase: (process.env.VITE_API_URL || '').trim(),
  contactEmail: (process.env.DESKGUARD_CONTACT_EMAIL || '').trim(),
  siteUrl: (process.env.VITE_SITE_URL || '').trim(),
}
if (!isUrl(cfg.apiBase) || !isUrl(cfg.siteUrl) || !isEmail(cfg.contactEmail)) {
  console.error('[build-site] invalid VITE_API_URL / VITE_SITE_URL / DESKGUARD_CONTACT_EMAIL')
  process.exit(1)
}
fs.writeFileSync(
  path.join(dist, 'config.js'),
  `/* Generated at build time by scripts/build-site.mjs — public values only. */\nwindow.DESKGUARD_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`,
)
if (!cfg.contactEmail) console.warn('[build-site] DESKGUARD_CONTACT_EMAIL not set — contact pages will show the form only')
if (!cfg.apiBase) console.warn('[build-site] VITE_API_URL not set — marketing pages will call same-origin /api')

console.log('[build-site] site assembled in', path.relative(process.cwd(), dist) || 'dist')
