// The slice of go-zenon's JSON-RPC this indexer reads. Field names follow
// rpc/api/ledger_types.go; []byte fields arrive base64-encoded.

export interface RpcMomentum {
  hash: string
  height: number
  timestamp: number
}

export interface RpcAccountBlock {
  blockType: number
  hash: string
  /** Position in the sender's account chain. */
  height: number
  address: string
  toAddress: string
  amount: string
  tokenStandard: string
  data: string | null
  token: {symbol: string; decimals: number} | null
  /** Null while no momentum has confirmed the block. */
  confirmationDetail?: {momentumHeight: number} | null
}

export interface RpcDetailedMomentum {
  momentum: RpcMomentum
  blocks: RpcAccountBlock[]
}

/** The node refuses a larger count (RpcMaxCountSize in rpc/api/utils.go). */
export const MAX_COUNT = 1024

export class RpcClient {
  private id = 0
  private readonly url: string
  private readonly timeoutMs: number

  constructor(url: string, timeoutMs = 60_000) {
    this.url = url
    this.timeoutMs = timeoutMs
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: ++this.id, method, params}),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
    const body = (await res.json()) as {result?: T; error?: {message: string}}
    if (body.error) throw new Error(`${method}: ${body.error.message}`)
    return body.result as T
  }

  async frontierHeight(): Promise<number> {
    const m = await this.call<RpcMomentum>('ledger.getFrontierMomentum', [])
    return m.height
  }

  /** One account block, or null if the node does not know the hash. */
  accountBlock(hash: string): Promise<RpcAccountBlock | null> {
    return this.call<RpcAccountBlock | null>('ledger.getAccountBlockByHash', [hash])
  }

  /**
   * Momentums `height .. height+count-1` with their account blocks. Throws
   * unless the node returned exactly that contiguous run — a short answer
   * would otherwise advance the cursor past momentums nobody scanned.
   */
  async detailedMomentums(height: number, count: number): Promise<RpcDetailedMomentum[]> {
    if (count < 1 || count > MAX_COUNT) throw new RangeError(`count ${count} out of range`)
    const res = await this.call<{list: RpcDetailedMomentum[] | null}>(
      'ledger.getDetailedMomentumsByHeight',
      [height, count],
    )
    const list = res.list ?? []
    if (list.length !== count) {
      throw new Error(`asked for ${count} momentums from ${height}, got ${list.length}`)
    }
    list.forEach((m, i) => {
      if (m.momentum.height !== height + i) {
        throw new Error(`expected momentum ${height + i}, got ${m.momentum.height}`)
      }
    })
    return list
  }
}
