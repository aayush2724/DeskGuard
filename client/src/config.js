/**
 * config.js — public, build-time configuration for the React app.
 * Every value here is embedded in the client bundle, so only non-secret values belong here.
 *
 * Set these in Vercel (or .env.production) as VITE_* variables:
 *   VITE_API_URL        Base URL of the API, e.g. https://deskguard-api-2lgn.onrender.com/api  (default: /api)
 *   VITE_SITE_URL       Public origin of the site, used for canonical/og:url (default: Vercel URL)
 *   VITE_VENUE_NAME     Name shown in the map header, e.g. "Main Library"            (TODO(owner): set for your venue)
 *   VITE_VENUE_SUBTITLE Secondary line, e.g. "Floor 2"                               (TODO(owner): set for your venue)
 *   VITE_AWAY_MINUTES   Away-hold length shown in the UI; must match AWAY_TTL_SECONDS on the server (default 20)
 *   VITE_SESSION_HOURS  Session length before the "Still here?" check; must match CHECKIN_TTL_SECONDS (default 2)
 */
const env = import.meta.env

export const API_BASE       = (env.VITE_API_URL || '/api').replace(/\/+$/, '')
export const SITE_URL       = (env.VITE_SITE_URL || 'https://deskguard-jade.vercel.app').replace(/\/+$/, '')
export const VENUE_NAME     = env.VITE_VENUE_NAME || 'Reading Room B'
export const VENUE_SUBTITLE = env.VITE_VENUE_SUBTITLE || 'Floor 2'
export const AWAY_MINUTES   = Number(env.VITE_AWAY_MINUTES) || 20
export const SESSION_HOURS  = Number(env.VITE_SESSION_HOURS) || 2
export const GRACE_SECONDS  = 30 // matches the server-side grace window in sweepJob.js

/** Marketing pages share the app's origin (Vite serves them in dev, Vercel/Express in prod). */
export const MARKETING_ORIGIN = ''
