import { useEffect } from 'react'
import { SITE_URL } from '../config.js'

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content)
}
function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el) }
  el.setAttribute('href', href)
}

/**
 * usePageMeta — per-route <title>, description, canonical, robots and Open Graph tags.
 * The React routes are client-rendered, so this is the best we can do for them;
 * the static marketing pages carry full metadata in their HTML.
 */
export function usePageMeta({ title, description, path, noindex = false }) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertLink('canonical', url)
  }, [title, description, path, noindex])
}
