// Fuelled posts: a wall post that names a donation to Accelerator-Z (ignite) or
// a burn of ZNN (burn) made just before it.
//
// It takes two blocks because the Accelerator's Donate call and the token
// contract's Burn call each accept exactly their 4-byte selector as data
// (go-zenon vm/abi/abi.go, UnpackEmptyMethod): neither can carry a message or a
// marker. So the page sends the donation or burn first, then a post whose data
// is `ZW!<that block's hash> <message>`. Nostr zaps (NIP-57) are the same shape:
// an ordinary payment, made distinguishable by the event that references it.
//
// The claim is only shown if it checks out, so nobody can dress a post in
// someone else's donation: same account, sent before the post, confirmed, ZNN,
// at least MIN_FUEL, the right contract and call, and named by no earlier post.
// Both calls succeed whenever those hold (Donate takes ZNN or QSR, and ZNN is
// burnable by anyone), so the contract's receive block is not checked.
import type {Post, WallMessage} from './parse.ts'
import type {RpcAccountBlock} from './rpc.ts'

export const ACCELERATOR_Z = 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22'
export const TOKEN_CONTRACT = 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0'
const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx'

/** The least a fuelled post puts behind it: 1 ZNN, in base units. */
export const MIN_FUEL = 100_000_000n

// First four bytes of SHA3-256 over the signature (vm/abi/method.go), as the
// node returns them: base64.
const DONATE = Buffer.from('cb7f8b2a', 'hex').toString('base64')
const BURN = Buffer.from('3395ab94', 'hex').toString('base64')

const BLOCK_TYPE_USER_SEND = 2

/** What `block` makes of `post`'s claim, or null if it does not back it. */
export function fuelOf(post: Post, block: RpcAccountBlock | null): Pick<WallMessage, 'fuel_kind' | 'fuel_amount'> | null {
  if (!block || block.hash !== post.claim) return null
  if (block.blockType !== BLOCK_TYPE_USER_SEND) return null
  if (block.address !== post.message.address || block.height >= post.height) return null
  const confirmed = block.confirmationDetail?.momentumHeight
  if (confirmed === undefined || confirmed > post.message.momentum_height) return null
  if (block.tokenStandard !== ZNN || BigInt(block.amount) < MIN_FUEL) return null
  const kind =
    block.toAddress === ACCELERATOR_Z && block.data === DONATE
      ? 'ignite'
      : block.toAddress === TOKEN_CONTRACT && block.data === BURN
        ? 'burn'
        : null
  return kind && {fuel_kind: kind, fuel_amount: block.amount}
}

/**
 * The rows for `posts`, with fuel set on every post whose claim checks out.
 * `claimedBy` answers which stored post already names each block, so the first
 * post to name a block keeps it across windows as well as within one.
 */
export async function attachFuel(
  posts: Post[],
  block: (hash: string) => Promise<RpcAccountBlock | null>,
  claimedBy: (blocks: string[]) => Promise<Map<string, string>>,
): Promise<WallMessage[]> {
  const claims = [...new Set(posts.flatMap((p) => (p.claim ? [p.claim] : [])))]
  if (claims.length === 0) return posts.map((p) => p.message)
  const stored = await claimedBy(claims)
  const blocks = new Map(await Promise.all(claims.map(async (h) => [h, await block(h)] as const)))
  const taken = new Set<string>()
  return posts.map((p) => {
    if (!p.claim) return p.message
    const owner = stored.get(p.claim)
    const fuel = fuelOf(p, blocks.get(p.claim) ?? null)
    if (!fuel || taken.has(p.claim) || (owner !== undefined && owner !== p.message.hash)) {
      return p.message
    }
    taken.add(p.claim)
    return {...p.message, ...fuel, fuel_block: p.claim}
  })
}
