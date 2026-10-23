import {setTimeout as sleep} from 'node:timers/promises'
import {loadConfig, type Config} from './config.ts'
import {attachFuel} from './fuel.ts'
import {extractPosts} from './parse.ts'
import {RpcClient} from './rpc.ts'
import {Store} from './store.ts'

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

async function withRetry<T>(what: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i >= attempts) throw err
      const wait = Math.min(30_000, 1000 * 2 ** (i - 1))
      console.warn(`${what} failed (attempt ${i}/${attempts}): ${(err as Error).message}; retry in ${wait}ms`)
      await sleep(wait)
    }
  }
}

/** Scans from the stored cursor up to the confirmed frontier. Returns momentums scanned. */
async function catchUp(
  cfg: Config,
  rpc: RpcClient,
  store: Store,
  signal: AbortSignal,
): Promise<number> {
  let cursor = (await withRetry('read cursor', () => store.lastHeight())) ?? cfg.startHeight - 1
  const frontier = await withRetry('frontier', () => rpc.frontierHeight())
  const target = frontier - cfg.confirmations
  const start = cursor

  while (cursor < target && !signal.aborted) {
    // A window of batches fetched in parallel, then committed as one step. The
    // cursor only moves past a window once every momentum in it is stored.
    const ranges: [number, number][] = []
    for (let from = cursor + 1; ranges.length < cfg.concurrency && from <= target; ) {
      const count = Math.min(cfg.batchSize, target - from + 1)
      ranges.push([from, count])
      from += count
    }
    const batches = await Promise.all(
      ranges.map(([from, count]) =>
        withRetry(`momentums ${from}+${count}`, () => rpc.detailedMomentums(from, count)),
      ),
    )
    const messages = await withRetry('fuel', () =>
      attachFuel(
        extractPosts(batches.flat()),
        (hash) => rpc.accountBlock(hash),
        (blocks) => store.claimedBy(blocks),
      ),
    )
    const [lastFrom, lastCount] = ranges[ranges.length - 1]
    const end = lastFrom + lastCount - 1

    await withRetry('commit', () => store.commit(messages, end))
    for (const m of messages) {
      const fuel = m.fuel_kind ? ` [${m.fuel_kind} ${m.fuel_amount}]` : ''
      log(`+ ${m.momentum_height} ${m.hash.slice(0, 12)}…${fuel} ${JSON.stringify(m.message.slice(0, 80))}`)
    }
    cursor = end
    log(`scanned through ${end} (${target - end} behind confirmed frontier ${target})`)
  }
  return cursor - start
}

async function main() {
  const cfg = loadConfig(process.argv.slice(2))
  const rpc = new RpcClient(cfg.rpcUrl)
  const store = new Store(cfg.supabaseUrl, cfg.serviceRoleKey)
  log(`zenon-wall indexer → ${cfg.rpcUrl}${cfg.once ? ' (once)' : ''}`)

  const shutdown = new AbortController()
  const stop = () => {
    if (shutdown.signal.aborted) process.exit(130)
    shutdown.abort()
    log('stopping after the current window (Ctrl+C again to force)')
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  while (!shutdown.signal.aborted) {
    try {
      await catchUp(cfg, rpc, store, shutdown.signal)
    } catch (err) {
      if (cfg.once) throw err
      console.error(`catch-up failed: ${(err as Error).message}`)
    }
    if (cfg.once) break
    await sleep(cfg.pollSeconds * 1000, undefined, {signal: shutdown.signal}).catch(() => {})
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
