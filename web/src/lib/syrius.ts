/**
 * The Syrius browser extension, as this page talks to it.
 *
 * Adapted from ferry-web-v2's `core/zenon-wallet.ts`, trimmed to what a wall
 * needs: connect, read the account, publish one block, hear about changes.
 *
 * The extension injects a promise-returning provider at `window.zenon` from a
 * MAIN-world content script at `document_start`, so it is there before this app
 * runs and is not subject to this page's CSP. `sendAccountBlock` takes a block
 * template: this page decides `toAddress`, `amount`, `tokenStandard` and `data`;
 * the extension fills in the account, chain position, plasma and signature, and
 * shows the person the block before signing.
 *
 * Checked against v0.3.7's provider (src/sections/Inpage/index.js), which
 * matters here in three ways:
 *
 * - The SDK fills in address, height, previous hash and momentum, but signs the
 *   page's `chainIdentifier` as given. A block built for the wrong chain is
 *   simply refused by the node, so the wallet's chain is checked first.
 * - It raises one window per site per 30 s unless the last was approved, and a
 *   request inside that time is refused with -32005 and no window. Nothing was
 *   shown or signed, so the request is held and made again.
 * - An approval may stay open 30 minutes; the provider itself gives up a minute
 *   after that with 4900. The page waits as long, not less.
 */

export const SYRIUS_EXTENSION_URL = 'https://github.com/sol-znn/syrius-extension/releases'

/** The account block shape znn-ts-sdk's `AccountBlockTemplate.fromJson` reads. */
export interface AccountBlockTemplate {
  version: number
  chainIdentifier: number
  blockType: number
  hash: string
  previousHash: string
  height: number
  momentumAcknowledged: {hash: string; height: number}
  address: string
  toAddress: string
  amount: string
  tokenStandard: string
  fromBlockHash: string
  /** Base64. */
  data: string
  fusedPlasma: number
  difficulty: number
  nonce: string
  publicKey: string
  signature: string
}

export interface WalletAccess {
  address: string
  chainId: number
  nodeUrl: string
}

export interface WalletChange {
  address?: string
  chainId?: number
  nodeUrl?: string
  disconnected?: boolean
}

interface ZenonProvider {
  connect(): Promise<string[]>
  disconnect(): Promise<boolean>
  getAccounts(): Promise<string[]>
  getChainId(): Promise<number | string | null>
  getNodeUrl(): Promise<string | null>
  sendAccountBlock(block: AccountBlockTemplate): Promise<{hash?: string; block?: unknown}>
  on(event: string, handler: (data: unknown) => void): unknown
  removeListener(event: string, handler: (data: unknown) => void): unknown
}

declare global {
  interface Window {
    zenon?: Partial<ZenonProvider>
  }
}

// v0.3.7 lets an approval wait 30 minutes and rejects at 31 itself.
const SEND_TIMEOUT_MS = 32 * 60 * 1000
const CONNECT_ACTIVATION_MS = 30 * 1000
const READ_TIMEOUT_MS = 15 * 1000
/** How long Syrius holds a site off after a window that did not end in a yes. */
const WINDOW_COOLDOWN_MS = 30 * 1000
const COOLDOWN = -32005

function provider(): ZenonProvider | null {
  if (typeof window === 'undefined') return null
  const p = window.zenon
  if (!p || typeof p.sendAccountBlock !== 'function' || typeof p.connect !== 'function') return null
  return p as ZenonProvider
}

export function hasExtension(): boolean {
  return provider() !== null
}

/** Settles on the `zenon#initialized` event, or a poll, or after `ms`. */
export function waitForExtension(ms = 3000): Promise<boolean> {
  if (hasExtension()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (found: boolean) => {
      window.removeEventListener('zenon#initialized', announced)
      window.clearInterval(poll)
      window.clearTimeout(timer)
      resolve(found)
    }
    const announced = () => hasExtension() && done(true)
    const poll = window.setInterval(announced, 100)
    const timer = window.setTimeout(() => done(false), ms)
    window.addEventListener('zenon#initialized', announced)
  })
}

/**
 * The person said no in Syrius. Not a failure: nothing was sent, and the page
 * shows nothing for it.
 */
export class DeclinedError extends Error {
  constructor() {
    super('Declined in Syrius')
  }
}

/**
 * The provider rejects with EIP-1193-style `{code, message}` plain objects, so
 * `err.message` alone reads `undefined`.
 */
export function walletError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err
  if (err && typeof err === 'object') {
    const e = err as {code?: number; message?: string}
    if (e.code === 4001) return new DeclinedError()
    if (e.code === 4100) {
      return new Error('Syrius does not have this page connected. Connect and approve it again.')
    }
    if (e.code === COOLDOWN) {
      return new Error(
        'Syrius would not open a window: it holds a site off for 30 s after a declined or closed ' +
          'approval. Nothing was signed. Try again in half a minute.',
      )
    }
    if (e.message) return new Error(e.message)
  }
  return new Error(fallback)
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(what)), ms)
    work.then(
      (v) => (window.clearTimeout(timer), resolve(v)),
      (e) => (window.clearTimeout(timer), reject(e)),
    )
  })
}

/**
 * A clock that stops once the wallet visibly does something. Syrius approves in
 * its own window, so the page losing focus is the only sign one appeared; after
 * that the wait is on a person, who gets as long as they need.
 */
function untilActive<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: number | undefined = window.setTimeout(() => {
      stop()
      reject(new Error(what))
    }, ms)
    const activated = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      stop()
    }
    const poll = window.setInterval(() => !document.hasFocus() && activated(), 250)
    function stop() {
      window.clearInterval(poll)
      window.removeEventListener('blur', activated)
    }
    window.addEventListener('blur', activated)
    work.then(
      (v) => (activated(), resolve(v)),
      (e) => (activated(), reject(e)),
    )
  })
}

/** Called once a second while a request is held for the wallet's cooldown, then with 0. */
export type OnHold = (secondsLeft: number) => void

let lastAskedAt = 0

/**
 * Makes a request that raises a wallet window, and makes it again (twice at
 * most) if the wallet refused for its per-site cooldown. The cooldown runs from
 * when the last window was asked for, plus a margin for the round trip.
 */
async function prompting<T>(ask: () => Promise<T>, onHold?: OnHold): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const previous = lastAskedAt
    lastAskedAt = Date.now()
    try {
      return await ask()
    } catch (err) {
      if ((err as {code?: number})?.code !== COOLDOWN || attempt >= 2) throw err
      const since = previous ? Date.now() - previous : 0
      const wait =
        attempt === 0 ? Math.max(2500, WINDOW_COOLDOWN_MS - since + 1500) : WINDOW_COOLDOWN_MS + 1500
      const until = Date.now() + wait
      while (Date.now() < until) {
        onHold?.(Math.ceil((until - Date.now()) / 1000))
        await new Promise((r) => window.setTimeout(r, 1000))
      }
      onHold?.(0)
    }
  }
}

function requireProvider(): ZenonProvider {
  const p = provider()
  if (!p) {
    throw new Error(
      'No Syrius wallet on this page. Install or enable the extension and reload: it injects ' +
        'itself when the page loads.',
    )
  }
  return p
}

/** Some builds report the chain id as a string, some as a number. */
const asChainId = (v: unknown) => Number(v ?? 0) || 0

async function readTriple(p: ZenonProvider, address: string): Promise<WalletAccess> {
  const [chainId, nodeUrl] = await withTimeout(
    Promise.all([p.getChainId(), p.getNodeUrl()]),
    READ_TIMEOUT_MS,
    'The wallet did not report its chain and node. It may have locked. Open Syrius and retry.',
  )
  return {address, chainId: asChainId(chainId), nodeUrl: nodeUrl ?? ''}
}

/** The wallet's state without prompting. Null when not connected or locked. */
export async function readAccess(): Promise<WalletAccess | null> {
  const p = provider()
  if (!p) return null
  try {
    const accounts = await withTimeout(p.getAccounts(), READ_TIMEOUT_MS, 'no answer')
    return accounts?.[0] ? await readTriple(p, accounts[0]) : null
  } catch {
    return null
  }
}

/** Opens the connect prompt for an origin the wallet has not approved yet. */
export async function requestAccess(onHold?: OnHold): Promise<WalletAccess> {
  const p = requireProvider()
  let accounts: string[]
  try {
    accounts = await prompting(
      () =>
        untilActive(
          withTimeout(p.connect(), SEND_TIMEOUT_MS, 'Syrius never came back with an answer.'),
          CONNECT_ACTIVATION_MS,
          'Syrius never opened its window. Open it from the toolbar, check this site is not ' +
            'blocked in its connected sites, and try again.',
        ),
      onHold,
    )
  } catch (err) {
    throw walletError(err, 'Syrius refused the connect request.')
  }
  if (!accounts?.[0]) throw new Error('The wallet granted access but reported no address.')
  return readTriple(p, accounts[0])
}

/** Drops this origin from the wallet's connected sites. */
export async function revokeAccess(): Promise<void> {
  const p = provider()
  if (!p) return
  try {
    await withTimeout(p.disconnect(), READ_TIMEOUT_MS, 'no answer')
  } catch {
    // Forgetting is what the page wanted either way.
  }
}

/** Hands the wallet a block to show, sign and publish. Resolves to its hash. */
export async function sendAccountBlock(block: AccountBlockTemplate, onHold?: OnHold): Promise<string> {
  const p = requireProvider()
  let result: {hash?: string}
  try {
    // A JSON round trip: the provider posts its params through structured clone,
    // which refuses Vue's reactive proxies.
    const plain = JSON.parse(JSON.stringify(block))
    result = await prompting(
      () =>
        withTimeout(
          p.sendAccountBlock(plain),
          SEND_TIMEOUT_MS,
          'Syrius did not answer within half an hour. It may still have published, so check ' +
            'your account in the explorer before trying again.',
        ),
      onHold,
    )
  } catch (err) {
    throw walletError(err, 'The wallet did not publish the block.')
  }
  if (typeof result?.hash !== 'string' || !result.hash) {
    throw new Error('The wallet says it sent the block but reported no transaction hash.')
  }
  return result.hash
}

/** Account, chain, node and disconnect announcements. Returns the unsubscribe. */
export function onWalletChange(handler: (change: WalletChange) => void): () => void {
  const p = provider()
  if (!p) return () => {}
  const onAccounts = (data: unknown) => {
    const address = Array.isArray(data) ? String(data[0] ?? '') : ''
    handler(address ? {address} : {disconnected: true})
  }
  const onChain = (data: unknown) => handler({chainId: asChainId(data)})
  const onNode = (data: unknown) => handler({nodeUrl: typeof data === 'string' ? data : ''})
  const onDisconnect = () => handler({disconnected: true})
  p.on('accountsChanged', onAccounts)
  p.on('chainChanged', onChain)
  p.on('nodeChanged', onNode)
  p.on('disconnect', onDisconnect)
  return () => {
    p.removeListener('accountsChanged', onAccounts)
    p.removeListener('chainChanged', onChain)
    p.removeListener('nodeChanged', onNode)
    p.removeListener('disconnect', onDisconnect)
  }
}
