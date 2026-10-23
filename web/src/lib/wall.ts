import {supabaseAnonKey, supabaseUrl} from './env'
import type {Fuel} from './ignite'

export interface WallMessage {
  hash: string
  momentum_height: number
  momentum_timestamp: string
  block_index: number
  address: string
  to_address: string
  amount: string
  token_standard: string
  token_symbol: string | null
  token_decimals: number | null
  /** Untrusted on-chain text. Interpolate it; never bind it as HTML. */
  message: string
  /** The donation or burn the post names, once the indexer has checked it. */
  fuel?: Fuel
}

interface Row extends Omit<WallMessage, 'fuel'> {
  fuel_kind: Fuel['kind'] | null
  fuel_amount: string | null
  fuel_block: string | null
}

function fromRow({fuel_kind, fuel_amount, fuel_block, ...m}: Row): WallMessage {
  return fuel_kind && fuel_amount && fuel_block
    ? {...m, fuel: {kind: fuel_kind, amount: fuel_amount, block: fuel_block}}
    : m
}

export interface WallPage {
  messages: WallMessage[]
  total: number
}

export interface IndexerState {
  height: number
  updated_at: string
}

// `amount::text` and `fuel_amount::text` deliberately: PostgREST renders a
// numeric as a JSON number, and a token amount in base units can exceed what a
// double represents exactly. The cast keeps it a string all the way to the
// formatter.
const COLUMNS =
  'hash,momentum_height,momentum_timestamp,block_index,address,to_address,amount::text,token_standard,token_symbol,token_decimals,message,fuel_kind,fuel_amount::text,fuel_block'

// Plain PostgREST over fetch. The page makes two read-only GETs, which does not
// warrant shipping supabase-js and its realtime client.
async function rest(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {apikey: supabaseAnonKey, authorization: `Bearer ${supabaseAnonKey}`, ...headers},
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase answered ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
  return res
}

/** Page `page` (1-based) of the wall, newest first. */
export async function fetchPage(page: number, size: number): Promise<WallPage> {
  const offset = (page - 1) * size
  const res = await rest(
    `messages?select=${COLUMNS}&order=momentum_height.desc,block_index.desc&limit=${size}&offset=${offset}`,
    {prefer: 'count=exact'},
  )
  const messages = ((await res.json()) as Row[]).map(fromRow)
  // Content-Range: 0-19/137, or */0 on an empty table.
  const total = Number(res.headers.get('content-range')?.split('/')[1])
  return {messages, total: Number.isFinite(total) ? total : messages.length}
}

/**
 * How many messages the wall holds, from the count on a one-row GET. Not HEAD:
 * Supabase answered the browser's HEAD with 503 while the same GET succeeded.
 */
export async function fetchCount(): Promise<number> {
  const res = await rest('messages?select=hash&limit=1', {prefer: 'count=exact'})
  const total = Number(res.headers.get('content-range')?.split('/')[1])
  if (!Number.isFinite(total)) throw new Error('Supabase sent no count')
  return total
}

export async function fetchIndexerState(): Promise<IndexerState | null> {
  const res = await rest('indexer_state?select=height,updated_at&id=eq.mainnet&limit=1')
  const rows = (await res.json()) as IndexerState[]
  return rows[0] ?? null
}
