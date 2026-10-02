/**
 * status.js — single source of truth for desk-status labels and colours.
 * `color` is the fill used on the map and badges; `text` is a WCAG-AA-safe text
 * colour on top of `color`; `onDark` is a text colour safe on the page background.
 */
export const STATUS_META = {
  free:               { label: 'Free',          color: '#F0C987', dark: '#D4AF37', darker: '#E7D3B5', text: '#1A0819', onDark: '#F0C987' },
  occupied:           { label: 'Occupied',      color: '#D95D7D', dark: '#8B4513', darker: '#5E2F29', text: '#1A0819', onDark: '#F08AA3' },
  away:               { label: 'Away',          color: '#D4AF37', dark: '#706040', darker: '#A38F75', text: '#1A0819', onDark: '#D4AF37' },
  still_here_pending: { label: 'Pending check', color: '#D4AF37', dark: '#706040', darker: '#A38F75', text: '#1A0819', onDark: '#D4AF37' },
  abandoned:          { label: 'Abandoned',     color: '#7A5C79', dark: '#A38F75', darker: '#5D2A5C', text: '#FDF5E6', onDark: '#B59AB4' },
}

export const LEGEND_ORDER = ['free', 'occupied', 'away', 'abandoned']

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.free
}

/** Collapses the internal pending state into "away" for counts shown to users. */
export function countByStatus(desks) {
  const counts = { free: 0, occupied: 0, away: 0, abandoned: 0 }
  for (const d of desks) {
    const k = d.status === 'still_here_pending' ? 'away' : d.status
    if (k in counts) counts[k]++
  }
  return counts
}

export function timeSince(ts) {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}
