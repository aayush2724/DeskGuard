export const DESK_ID_RE = /^[A-E]-\d{2}$/

/** Extracts a desk ID from a scanned QR payload: a /live?checkin=ID URL or a bare "A-01". */
export function parseDeskId(text) {
  try {
    const url = new URL(text)
    const id = (url.searchParams.get('checkin') || '').toUpperCase()
    return DESK_ID_RE.test(id) ? id : ''
  } catch {
    const m = String(text).trim().match(/^([A-E])-?(\d{1,2})$/i)
    return m ? `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}` : ''
  }
}
