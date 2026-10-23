import type {RpcAccountBlock, RpcDetailedMomentum} from './rpc.ts'

/** A row in public.messages. */
export interface WallMessage {
  hash: string
  momentum_height: number
  momentum_hash: string
  momentum_timestamp: string
  block_index: number
  address: string
  to_address: string
  amount: string
  token_standard: string
  token_symbol: string | null
  token_decimals: number | null
  message: string
  /** Set by fuel.ts once the block the post names checks out; null otherwise. */
  fuel_kind: 'ignite' | 'burn' | null
  fuel_amount: string | null
  fuel_block: string | null
}

/** A wall post as found, before fuel.ts looks at the block it names. */
export interface Post {
  message: WallMessage
  /** The Donate or Burn block a `ZW!<hash>` post names, unchecked. */
  claim: string | null
  /** The post's height in its account chain. */
  height: number
}

const BLOCK_TYPE_USER_SEND = 2
const PREFIX = [0x5a, 0x57] // "ZW"

// "ZW!<hash> message": the post names the donation or burn behind it (fuel.ts).
const CLAIM = /^!([0-9a-f]{64})(?:\s|$)/

// Fatal, so a payload that is not valid UTF-8 is skipped rather than stored
// with replacement characters in it.
const utf8 = new TextDecoder('utf-8', {fatal: true})

// C0 controls and DEL, keeping tab and newline. Postgres text cannot hold NUL,
// and the rest only exist to mess with whoever renders them.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

/**
 * The wall text in a block's data and the block it claims as fuel, or null if
 * the block is not a wall post.
 *
 * A post is any user send whose data starts with the bytes "ZW". Everything
 * after the prefix is the message, trimmed — the convention from the original
 * zenon.fun wall is `ZW <message>`. `ZW!<hash> <message>` also names a block.
 */
export function wallPost(data: string | null | undefined): {text: string; claim: string | null} | null {
  if (!data) return null
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length <= PREFIX.length || bytes[0] !== PREFIX[0] || bytes[1] !== PREFIX[1]) {
    return null
  }
  let text: string
  try {
    text = utf8.decode(bytes.subarray(PREFIX.length))
  } catch {
    return null
  }
  const claim = CLAIM.exec(text)?.[1] ?? null
  if (claim) text = text.slice(1 + claim.length)
  text = text.replace(CONTROL, '').trim()
  return text === '' ? null : {text, claim}
}

/** The wall text in a block's data, or null if the block is not a wall post. */
export const wallText = (data: string | null | undefined) => wallPost(data)?.text ?? null

function toPost(block: RpcAccountBlock, index: number, m: RpcDetailedMomentum): Post | null {
  if (block.blockType !== BLOCK_TYPE_USER_SEND) return null
  const post = wallPost(block.data)
  if (post === null) return null
  return {
    message: {
      hash: block.hash,
      momentum_height: m.momentum.height,
      momentum_hash: m.momentum.hash,
      momentum_timestamp: new Date(m.momentum.timestamp * 1000).toISOString(),
      block_index: index,
      address: block.address,
      to_address: block.toAddress,
      amount: block.amount,
      token_standard: block.tokenStandard,
      token_symbol: block.token?.symbol ?? null,
      token_decimals: block.token?.decimals ?? null,
      message: post.text,
      fuel_kind: null,
      fuel_amount: null,
      fuel_block: null,
    },
    claim: post.claim,
    height: block.height,
  }
}

/** Every wall post in a run of momentums, in chain order, one per block hash. */
export function extractPosts(momentums: RpcDetailedMomentum[]): Post[] {
  const byHash = new Map<string, Post>()
  for (const m of momentums) {
    m.blocks.forEach((block, i) => {
      const post = toPost(block, i, m)
      if (post && !byHash.has(post.message.hash)) byHash.set(post.message.hash, post)
    })
  }
  return [...byHash.values()]
}

/** The rows for every wall post in a run of momentums, without fuel. */
export const extractMessages = (momentums: RpcDetailedMomentum[]) =>
  extractPosts(momentums).map((p) => p.message)
