import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../config.js'
import { apiFetch } from '../api.js'
import { addMyDesk, removeMyDesk, isMyDesk } from '../lib/myDesks.js'

const POLL_WHEN_OFFLINE_MS = 15000
const SSE_RECONNECT_MS     = 30000

/**
 * useDesks — desk list + live updates over Server-Sent Events, with a polling
 * fallback when the event stream cannot be established.
 *
 * `connection`: 'connecting' | 'live' | 'reconnecting' | 'offline'
 * `error`:      user-facing message when the initial/last fetch failed, else null
 */
export function useDesks() {
  const [desks, setDesks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [connection, setConnection]   = useState('connecting')
  const [stillHereDesk, setStillHereDesk] = useState(null)
  const abortRef = useRef(null)

  const fetchDesks = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const data = await apiFetch('/desks', { signal: ctrl.signal })
      setDesks(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      if (e.name === 'AbortError') return
      setError(e)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let es = null, pollTimer = null, reconnectTimer = null, disposed = false, wasDown = false

    const handleMessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.type === 'desk_update' && msg.desk && msg.desk.id) {
        const desk = msg.desk
        setDesks(prev => prev.map(d => d.id === desk.id ? { ...d, ...desk } : d))
        // A desk that ended up free/abandoned is no longer "ours" and no longer needs a prompt
        if (desk.status === 'free' || desk.status === 'abandoned') removeMyDesk(desk.id)
        if (desk.status !== 'still_here_pending') setStillHereDesk(cur => (cur === desk.id ? null : cur))
      }
      if (msg.type === 'still_here' && msg.deskId && isMyDesk(msg.deskId)) {
        setStillHereDesk(msg.deskId)
      }
    }

    const connect = () => {
      if (disposed || typeof EventSource === 'undefined') return
      es = new EventSource(`${API_BASE}/events`)
      es.onopen = () => {
        setConnection('live')
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
        if (wasDown) { wasDown = false; fetchDesks() } // resync after a gap
      }
      es.onmessage = handleMessage
      es.onerror = () => {
        wasDown = true
        if (es.readyState === EventSource.CLOSED) {
          // Browser gave up (e.g. server rejected the stream). Poll, and retry the stream later.
          setConnection('offline')
          es.close()
          if (!pollTimer) pollTimer = setInterval(fetchDesks, POLL_WHEN_OFFLINE_MS)
          reconnectTimer = setTimeout(connect, SSE_RECONNECT_MS)
        } else {
          setConnection('reconnecting')
        }
      }
    }

    fetchDesks()
    connect()
    return () => {
      disposed = true
      es?.close()
      clearInterval(pollTimer)
      clearTimeout(reconnectTimer)
      abortRef.current?.abort()
    }
  }, [fetchDesks])

  // ── Actions ─────────────────────────────────────────────────────────────
  const post = useCallback(async (id, action) => {
    const desk = await apiFetch(`/desks/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
    if (desk && desk.id) setDesks(prev => prev.map(d => d.id === desk.id ? { ...d, ...desk } : d))
    return desk
  }, [])

  const checkin   = useCallback(async (id) => { const d = await post(id, 'checkin');   addMyDesk(id);    return d }, [post])
  const away      = useCallback(async (id) => post(id, 'away'), [post])
  const checkout  = useCallback(async (id) => { const d = await post(id, 'checkout');  removeMyDesk(id); return d }, [post])
  const stillHere = useCallback(async (id) => post(id, 'stillhere'), [post])

  const clearStillHere = useCallback(() => setStillHereDesk(null), [])

  return { desks, loading, error, connection, stillHereDesk, clearStillHere, checkin, away, checkout, stillHere, refetch: fetchDesks }
}
