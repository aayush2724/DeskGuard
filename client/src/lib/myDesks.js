/**
 * myDesks.js — remembers which desks THIS browser checked in to.
 *
 * The server broadcasts "Still here?" prompts for every expiring desk to every
 * connected client. Without this list, every viewer of the map would be asked to
 * confirm (or could release) a stranger's desk. The list never leaves the browser.
 */
const KEY = 'deskguard_my_desks'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage unavailable (private mode etc.) */ }
}

export function getMyDesks() { return read() }
export function isMyDesk(id) { return read().includes(id) }
export function addMyDesk(id) { const l = read(); if (!l.includes(id)) { l.push(id); write(l) } }
export function removeMyDesk(id) { write(read().filter(x => x !== id)) }
