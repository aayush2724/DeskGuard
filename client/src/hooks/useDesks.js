import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = '/api'

export function useDesks() {
  const [desks, setDesks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [stillHereDesk, setStillHereDesk] = useState(null)
  const esRef = useRef(null)

  // Initial fetch
  const fetchDesks = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/desks`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDesks(await res.json())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // SSE subscription — server pushes desk_update and still_here events
  useEffect(() => {
    fetchDesks()

    const es = new EventSource(`${BASE}/events`)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'desk_update') {
          setDesks(prev => prev.map(d => d.id === msg.desk.id ? { ...d, ...msg.desk } : d))
        }
        if (msg.type === 'still_here') {
          setStillHereDesk(msg.deskId)
        }
      } catch {}
    }
    es.onerror = () => {
      // Fallback: poll every 5s if SSE dies
      setTimeout(fetchDesks, 5000)
    }

    return () => es.close()
  }, [fetchDesks])

  // ── Actions ────────────────────────────────────────────
  const post = useCallback(async (path) => {
    const res = await fetch(`${BASE}/desks/${path}`, { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [])

  const checkin   = useCallback((id) => post(`${id}/checkin`),   [post])
  const away      = useCallback((id) => post(`${id}/away`),      [post])
  const checkout  = useCallback((id) => post(`${id}/checkout`),  [post])
  const stillHere = useCallback((id) => post(`${id}/stillhere`), [post])
  const abandon   = useCallback((id) => post(`${id}/checkout`),  [post])

  const clearStillHere = useCallback(() => setStillHereDesk(null), [])

  return { desks, loading, error, stillHereDesk, clearStillHere, checkin, away, checkout, stillHere, abandon, refetch: fetchDesks }
}
