/**
 * api.js — tiny fetch wrapper for the DeskGuard API.
 * Adds a timeout, JSON parsing, and translates failures into messages that are
 * safe (and useful) to show to users — never raw stack traces or internals.
 */
import { API_BASE } from './config.js'

export default API_BASE

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, timeout = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.timeout = timeout
  }
}

/** Server-provided messages for these statuses are short, non-sensitive and worth showing. */
const SHOW_SERVER_MESSAGE = new Set([400, 404, 409])

export function friendlyError(err) {
  if (!err) return 'Something went wrong.'
  if (err instanceof ApiError) {
    const serverMsg = err.data && typeof err.data.error === 'string' ? err.data.error : null
    if (err.timeout) return 'The server is taking too long to respond. It may be waking up — please try again.'
    if (err.status === 0) return "Can't reach the DeskGuard server. Check your connection and try again."
    if (err.status === 401) return 'Your librarian key was not accepted.'
    if (err.status === 429) return 'Too many requests. Please wait a moment and try again.'
    if (SHOW_SERVER_MESSAGE.has(err.status) && serverMsg) return serverMsg
    if (err.status >= 500) return 'The server had a problem. Please try again in a moment.'
    return serverMsg || 'That request could not be completed.'
  }
  if (err.name === 'AbortError') return 'The request was cancelled.'
  return "Can't reach the DeskGuard server. Check your connection and try again."
}

/**
 * apiFetch('/desks', { method, body, headers, timeout, signal })
 * Resolves with parsed JSON (or text for non-JSON). Rejects with ApiError,
 * or re-throws the caller's own AbortError so callers can ignore unmount aborts.
 */
export async function apiFetch(path, { method = 'GET', body, headers = {}, timeout = 45000, signal } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  const onOuterAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  const init = { method, headers: { Accept: 'application/json', ...headers }, signal: controller.signal }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, init)
    const isJson = (res.headers.get('content-type') || '').includes('application/json')
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, { status: res.status, data })
    return data
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') {
      if (signal && signal.aborted) throw err              // caller cancelled (e.g. unmount)
      throw new ApiError('timeout', { status: 0, timeout: timedOut })
    }
    throw new ApiError('network', { status: 0 })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onOuterAbort)
  }
}
