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
  type WalletAccess,
} from '@/lib/syrius'
import type {Fuel} from '@/lib/ignite'
import {fuelBlock, wallPostBlock} from '@/lib/post'

// Module-level: a connection belongs to the browser, not to whichever component
// asked. Nothing is persisted here — the extension remembers connected origins
// and answers getAccounts without a prompt, so state is restored by asking it.
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

async function start() {
  if (started) return
  started = true
  available.value = await waitForExtension()
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
      available.value = hasExtension() || (await waitForExtension(1000))
      apply(await requestAccess(onHold))
    } catch (err) {
      if (!(err instanceof DeclinedError)) error.value = (err as Error).message
    } finally {
      connecting.value = false
      holdSeconds.value = 0
    }
  }

  async function disconnect() {
    await revokeAccess()
    apply(null)
  }

  // Re-read rather than trust the last announcement: a block names the account
  // and chain it is for, and the wallet may have moved since.
  async function checkWallet() {
    await refresh()
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

  /**
   * Publishes a wall post sending `amount` ZNN (base units) to the account
   * itself, or naming `fuel`, a donation or burn already sent. Resolves to the
   * transaction hash.
   */
  async function post(message: string, amount: string, fuel?: string): Promise<string> {
    await checkWallet()
    return send(() =>
      sendAccountBlock(
        wallPostBlock(message, address.value, expectedChainId, amount, fuel),
        onHold,
      ),
    )
  }

  /**
   * Donates (ignite) or burns (burn) `amount` ZNN (base units). Resolves to the
   * transaction hash as soon as Syrius publishes, which is all the post that
   * names it needs: no momentum has to confirm it first.
   */
  async function sendFuel(kind: Fuel['kind'], amount: string): Promise<string> {
    await checkWallet()
    return send(() => sendAccountBlock(fuelBlock(kind, address.value, expectedChainId, amount), onHold))
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
    post,
    sendFuel,
  }
}
