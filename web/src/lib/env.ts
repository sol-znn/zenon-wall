const env = import.meta.env

export const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
export const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? ''

const size = Number(env.VITE_PAGE_SIZE)
export const pageSize = Number.isInteger(size) && size > 0 && size <= 100 ? size : 10

export const isConfigured = supabaseUrl !== '' && supabaseAnonKey !== ''

/** The chain this wall reads, and the only one a post is allowed to target. */
const id = Number(env.VITE_ZNN_CHAIN_ID)
export const chainId = Number.isInteger(id) && id > 0 ? id : 1
export const networkName = chainId === 1 ? 'mainnet' : `chain ${chainId}`

interface Explorer {
  tx: (hash: string) => string
  account: (address: string) => string
}

// Picked by chain unless VITE_EXPLORER names one. A link into another network's
// explorer renders as a confident 404, so an unknown chain gets no links.
const explorers: Record<string, Explorer | null> = {
  zenonhub: {
    tx: (h) => `https://zenonhub.io/explorer/transaction/${h}`,
    account: (a) => `https://zenonhub.io/explorer/account/${a}`,
  },
  none: null,
}
export const explorer: Explorer | null =
  explorers[env.VITE_EXPLORER ?? ''] !== undefined
    ? explorers[env.VITE_EXPLORER]
    : chainId === 1
      ? explorers.zenonhub
      : null
