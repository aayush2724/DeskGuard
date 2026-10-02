import express from 'express'
import pool from '../db/postgres.js'

const router = express.Router()

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/
const FLOORS = new Set(['1', '2-5', '6+', 'unsure'])
// Strip ASCII control characters except tab/newline; trim whitespace
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1)

// POST /api/contact — early-access / contact form from the website
router.post('/', async (req, res, next) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}

  // Honeypot: real visitors never fill this hidden field. Pretend success so bots don't retry.
  if (body.website) return res.status(201).json({ ok: true })

  const name = clean(body.name, 120)
  const email = clean(body.email, 254)
  const institution = clean(body.institution, 160)
  const message = clean(body.message, 2000)
  const floors = FLOORS.has(body.floors) ? body.floors : null

  const fields = {}
  if (!name) fields.name = 'Please enter your name.'
  else if (name.length > 120) fields.name = 'Name must be 120 characters or fewer.'
  if (!email) fields.email = 'Please enter your email address.'
  else if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Please enter a valid email address.'
  if (institution.length > 160) fields.institution = 'Institution must be 160 characters or fewer.'
  if (message.length > 2000) fields.message = 'Message must be 2000 characters or fewer.'
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Please check the highlighted fields.', fields })

  try {
    const { rows } = await pool.query(
      'INSERT INTO contact_requests (name, email, institution, floors, message) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, email, institution || null, floors, message || null]
    )
    // Log only the id — never personal data
    console.log(`[contact] new enquiry #${rows[0].id}`)
    res.status(201).json({ ok: true })
  } catch (e) { next(e) }
})

export default router
