/**
 * The Syrius app on a phone, as this page talks to it.
 *
 * The Android and iOS apps inject no `window.zenon`. A page asks with a
 * `syrius://request` link and the app answers by opening a callback URL with
 * `id` and `result` or `error` added to its query, both base64url JSON
 * (syrius-extension docs/APP-REQUESTS.md). The approval screens are the
 * extension's own; only the transport differs.
 *
 * Three things follow from that transport:
 *
 * - The page is left for the app and comes back as a fresh load, often in a new
 *   tab. What the page was doing goes into localStorage with the request id,
 *   not sessionStorage, which a new tab does not share.
 * - Chrome for Android opens an app only from a navigation the person started,
 *   so every request is made from a tap. A Boost or Torch is two taps: the
 *   donation or burn, then the post naming it.
 * - A link the app cannot parse gets no answer at all, and a missing app makes
 *   no sound either. If the page is still showing well after the link, the app
 *   did not open.
 */
import {walletError} from './syrius'

const PENDING_KEY = 'wall.syrius.request'

/** Android or iOS, where the Syrius app answers links. iPadOS reports a Mac. */
export function onPhone(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type AppMethod = 'znn_connect' | 'znn_signAndSendBlock'

interface Pending {
  id: string
  method: AppMethod
  context?: unknown
}

export interface AppAnswer {
  method: AppMethod
  /** What the page stored with the request, as given. */
  context?: unknown
  result?: unknown
  error?: Error
}

const b64url = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const unb64url = (text: string): unknown =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ),
  )

function readPending(): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null
  } catch {
    return null
  }
}

/**
 * How long the page may stay in view after the link before the app counts as
 * missing. Long, because Safari and Chrome may first ask "Open in Syrius?" and
 * the page stays in view while they do.
 */
const OPEN_MS = 10_000

/**
 * Hands the request to the Syrius app. Never resolves: the answer arrives as a
 * new page load (takeAppAnswer). Rejects when the app did not open.
 */
export function appRequest(method: AppMethod, params?: unknown, context?: unknown): Promise<never> {
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({id, method, context} satisfies Pending))
  } catch {
    return Promise.reject(new Error('This browser blocks storage, so the answer from Syrius would be lost.'))
  }
  // The answer comes back to this page, with the query replaced and the route kept.
  const query = new URLSearchParams({method, id, callback: location.origin + location.pathname})
  if (params !== undefined) query.set('params', b64url(params))
  return new Promise((_, reject) => {
    let left = false
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true
    }
    document.addEventListener('visibilitychange', onHide)
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      if (!left) reject(new Error('Syrius did not open. Is the app installed?'))
    }, OPEN_MS)
    location.href = `syrius://request?${query}`
  })
}

/**
 * The app's answer, if this load is one, matched to the request it answers and
 * taken off the URL. Null on any other load.
 */
export function takeAppAnswer(): AppAnswer | null {
  if (typeof location === 'undefined') return null
  const query = new URLSearchParams(location.search)
  const id = query.get('id')
  const result = query.get('result')
  const error = query.get('error')
  if (!id || (result === null && error === null)) return null

  // Off the URL first, so a reload or a shared link does not replay it.
  for (const k of ['id', 'result', 'error']) query.delete(k)
  const search = query.toString()
  history.replaceState(history.state, '', location.pathname + (search ? `?${search}` : '') + location.hash)

  const pending = readPending()
  if (!pending || pending.id !== id) return null
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Matched by id, so a stale entry is harmless.
  }
  const answer: AppAnswer = {method: pending.method, context: pending.context}
  try {
    if (error !== null) answer.error = walletError(unb64url(error), 'Syrius did not do it.')
    else answer.result = unb64url(result ?? '')
  } catch {
    answer.error = new Error('Syrius sent an answer this page could not read.')
  }
  return answer
}
