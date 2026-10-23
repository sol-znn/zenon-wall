import {computed, readonly, ref} from 'vue'
import {chainId as expectedChainId, networkName} from '@/lib/env'
import {
  DeclinedError,
  hasExtension,
  onWalletChange,
  readAccess,
  requestAccess,
  revokeAccess,
  sendAccountBlock,
  waitForExtension,
  type AccountBlockTemplate,
  type WalletAccess,
} from '@/lib/syrius'
import {appRequest, onPhone, takeAppAnswer, type AppAnswer} from '@/lib/syriusApp'
import type {Fuel} from '@/lib/ignite'
import {fuelBlock, wallPostBlock} from '@/lib/post'

// Module-level: a connection belongs to the browser, not to whichever component
// asked. With the extension nothing is persisted here: it remembers connected
// origins and answers getAccounts without a prompt, so state is restored by
// asking it. The phone app can only be asked by leaving the page, so there the
// connected address is kept in localStorage instead.
const APP_ADDRESS_KEY = 'wall.syrius.address'

/** The page talks to the Syrius app through links (lib/syriusApp.ts). */
const viaApp = ref(false)
/** The app's answer to a send, for the component that asked (SignTheWall.vue). */
const appAnswer = ref<AppAnswer | null>(null)
const available = ref(hasExtension())
const address = ref('')
const walletChainId = ref(0)
const nodeUrl = ref('')
const connecting = ref(false)
const sending = ref(false)
const error = ref('')
/** Seconds left while a request waits out Syrius's per-site cooldown; 0 otherwise. */
const holdSeconds = ref(0)
const onHold = (s: number) => (holdSeconds.value = s)

let started = false
let readToken = 0

function apply(access: WalletAccess | null) {
  address.value = access?.address ?? ''
  walletChainId.value = access?.chainId ?? 0
  nodeUrl.value = access?.nodeUrl ?? ''
}

// Re-read all three together after any announced change, so the identity never
// mixes an account from one moment with a chain from another.
async function refresh() {
  const token = ++readToken
  const access = await readAccess()
  if (token === readToken) apply(access)
}

function storeAppAddress(value: string) {
  try {
    if (value) localStorage.setItem(APP_ADDRESS_KEY, value)
    else localStorage.removeItem(APP_ADDRESS_KEY)
  } catch {
    // Storage blocked: connected for this load only.
  }
}

function startApp() {
  viaApp.value = true
  available.value = true
  try {
    address.value = localStorage.getItem(APP_ADDRESS_KEY) ?? ''
  } catch {
    address.value = ''
  }
}

// A page left for the app and shown again without an answer (Back, or the app
// switched away) is no longer waiting on anything.
function onShownAgain() {
  if (document.visibilityState !== 'visible') return
  connecting.value = false
  sending.value = false
}

async function start() {
  if (started) return
  started = true

  // Synchronous, so the answer is in place before any component mounts.
  const answer = takeAppAnswer()
  if (answer) {
    startApp()
    if (answer.method === 'znn_connect') {
      const account = Array.isArray(answer.result) ? String(answer.result[0] ?? '') : ''
      if (answer.error && !(answer.error instanceof DeclinedError)) error.value = answer.error.message
      if (account) {
        address.value = account
        storeAppAddress(account)
      }
    } else {
      appAnswer.value = answer
    }
  }

  // Firefox for Android runs the extension, so a phone with window.zenon uses it.
  if (!viaApp.value) {
    available.value = await waitForExtension()
    if (!available.value && onPhone()) startApp()
  }
  if (viaApp.value) {
    document.addEventListener('visibilitychange', onShownAgain)
    return
  }
  if (!available.value) return
  onWalletChange((change) => {
    if (change.disconnected) apply(null)
    void refresh()
  })
  await refresh()
}

export function useWallet() {
  void start()

  const connected = computed(() => address.value !== '')
  /** The wallet signs for a different chain than this wall reads. */
  const wrongChain = computed(
    () => connected.value && walletChainId.value !== 0 && walletChainId.value !== expectedChainId,
  )

  async function connect() {
    error.value = ''
    connecting.value = true
    try {
      if (viaApp.value) await appRequest('znn_connect')
      available.value = hasExtension() || (await waitForExtension(1000))
      apply(await requestAccess(onHold))
    } catch (err) {
      if (!(err instanceof DeclinedError)) error.value = (err as Error).message
    } finally {
      connecting.value = false
      holdSeconds.value = 0
    }
  }

  // The app has no disconnect request: the page forgets the account, and the
  // origin stays in the app's connected sites until removed there.
  async function disconnect() {
    if (viaApp.value) storeAppAddress('')
    else await revokeAccess()
    apply(null)
  }

  // Re-read rather than trust the last announcement: a block names the account
  // and chain it is for, and the wallet may have moved since. The app cannot be
  // read without leaving the page; a block for another chain is refused there.
  async function checkWallet() {
    if (!viaApp.value) await refresh()
    if (!address.value) throw new Error('Connect Syrius first.')
    if (wrongChain.value) {
      throw new Error(
        `Syrius is on chain ${walletChainId.value}, but this wall reads ${networkName} ` +
          `(chain ${expectedChainId}). Switch networks in the wallet: a post there would ` +
          'never show up here.',
      )
    }
  }

  async function send<T>(fn: () => Promise<T>): Promise<T> {
    sending.value = true
    try {
      return await fn()
    } finally {
      sending.value = false
      holdSeconds.value = 0
    }
  }

  // Through the app the page is left and the hash comes back to a new load, as
  // appAnswer with `context` beside it; through the extension it resolves here.
  function sign(block: AccountBlockTemplate, context: unknown): Promise<string> {
    return viaApp.value
      ? appRequest('znn_signAndSendBlock', block, context)
      : sendAccountBlock(block, onHold)
  }

  /**
   * Publishes a wall post sending `amount` ZNN (base units) to the account
   * itself, or naming `fuel`, a donation or burn already sent. Resolves to the
   * transaction hash.
   */
  async function post(message: string, amount: string, fuel?: string, context?: unknown): Promise<string> {
    await checkWallet()
    return send(() => sign(wallPostBlock(message, address.value, expectedChainId, amount, fuel), context))
  }

  /**
   * Donates (ignite) or burns (burn) `amount` ZNN (base units). Resolves to the
   * transaction hash as soon as Syrius publishes, which is all the post that
   * names it needs: no momentum has to confirm it first.
   */
  async function sendFuel(kind: Fuel['kind'], amount: string, context?: unknown): Promise<string> {
    await checkWallet()
    return send(() => sign(fuelBlock(kind, address.value, expectedChainId, amount), context))
  }

  /** The app's answer to a send, once: the next call returns null. */
  function takeSendAnswer(): AppAnswer | null {
    const answer = appAnswer.value
    appAnswer.value = null
    return answer
  }

  return {
    available: readonly(available),
    address: readonly(address),
    walletChainId: readonly(walletChainId),
    connecting: readonly(connecting),
    sending: readonly(sending),
    holdSeconds: readonly(holdSeconds),
    error,
    connected,
    wrongChain,
    connect,
    disconnect,
    viaApp: readonly(viaApp),
    post,
    sendFuel,
    takeSendAnswer,
  }
}
