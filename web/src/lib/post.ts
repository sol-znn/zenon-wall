import type {AccountBlockTemplate} from './syrius'

/** What the indexer matches: data whose first bytes are "ZW". */
export const WALL_PREFIX = 'ZW '

/**
 * Most bytes a message may take. The chain allows 16 KB of data, but every byte
 * costs 68 plasma, and a wallet without fused QSR pays for plasma with proof of
 * work — 512 bytes keeps that to seconds rather than minutes.
 */
export const MAX_MESSAGE_BYTES = 512

export const ZNN_TOKEN_STANDARD = 'zts1znnxxxxxxxxxxxxx9z4ulx'

/**
 * The least a tag sends, in ZNN. It goes to the sender's own account, so it is
 * kept, but every entry then shows ZNN behind it.
 */
export const MIN_TAG_ZNN = 1
const ZNN_DECIMALS = 8

/**
 * ZNN as typed ("1", "2.5") in base units, or null if it is not an amount ZNN
 * can hold. Exact, with no floating point: 0.1 + 0.2 must not lose a unit.
 */
export function znnBaseUnits(znn: string): bigint | null {
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{1,${ZNN_DECIMALS}}))?$`).exec(znn.trim())
  if (!m) return null
  return BigInt(m[1]!) * 10n ** BigInt(ZNN_DECIMALS) + BigInt((m[2] ?? '').padEnd(ZNN_DECIMALS, '0'))
}

const ZERO_HASH = '0'.repeat(64)
const encoder = new TextEncoder()

export const messageBytes = (message: string) => encoder.encode(message).length

/**
 * What the indexer will store for this input, or null if it would store nothing.
 * Mirrors indexer/src/parse.ts: control characters (bar tab and newline) are
 * dropped and the result is trimmed.
 */
export function normalizeMessage(message: string): string | null {
  const text = message.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()
  return text === '' ? null : text
}

export function base64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * The block that writes `message` on the wall: a ZNN send of `amount` (base
 * units) from the wallet's account to itself, with `ZW <message>` as its data.
 * Only `toAddress`, `amount`, `tokenStandard` and `data` mean anything here —
 * Syrius overwrites the account, chain position, plasma and signature fields,
 * which are present because `AccountBlockTemplate.fromJson` parses them.
 */
export function wallPostBlock(
  message: string,
  from: string,
  chainId: number,
  amount = '0',
  fuelBlock?: string,
): AccountBlockTemplate {
  const text = normalizeMessage(message)
  if (text === null) throw new Error('Write something first.')
  const size = messageBytes(text)
  if (size > MAX_MESSAGE_BYTES) {
    throw new Error(`That is ${size} bytes; the wall takes at most ${MAX_MESSAGE_BYTES}.`)
  }
  if (fuelBlock !== undefined && !/^[0-9a-f]{64}$/.test(fuelBlock)) {
    throw new Error(`Not a block hash: ${fuelBlock}`)
  }
  // `ZW!<hash> message` names the donation or burn behind the post (lib/ignite.ts).
  const prefix = fuelBlock ? `ZW!${fuelBlock} ` : WALL_PREFIX
  return sendBlock(from, chainId, from, amount, base64(encoder.encode(prefix + text)))
}

/**
 * A ZNN send block for Syrius. Only `toAddress`, `amount`, `tokenStandard` and
 * `data` mean anything; see wallPostBlock.
 */
export function sendBlock(
  from: string,
  chainId: number,
  to: string,
  amount: string,
  data: string,
): AccountBlockTemplate {
  return {
    version: 1,
    chainIdentifier: chainId,
    blockType: 2,
    hash: ZERO_HASH,
    previousHash: ZERO_HASH,
    height: 0,
    momentumAcknowledged: {hash: ZERO_HASH, height: 0},
    address: from,
    toAddress: to,
    amount,
    tokenStandard: ZNN_TOKEN_STANDARD,
    fromBlockHash: ZERO_HASH,
    data,
    fusedPlasma: 0,
    difficulty: 0,
    nonce: '0000000000000000',
    publicKey: '',
    signature: '',
  }
}

export const ACCELERATOR_Z = 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22'
export const TOKEN_CONTRACT = 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0'

// First four bytes of SHA3-256 over "Donate()" and "Burn()" (vm/abi/method.go).
const SELECTORS = {
  ignite: new Uint8Array([0xcb, 0x7f, 0x8b, 0x2a]),
  burn: new Uint8Array([0x33, 0x95, 0xab, 0x94]),
}

/** The donation (ignite) or burn of `amount` ZNN (base units) a fuelled post names. */
export function fuelBlock(
  kind: 'ignite' | 'burn',
  from: string,
  chainId: number,
  amount: string,
): AccountBlockTemplate {
  const to = kind === 'ignite' ? ACCELERATOR_Z : TOKEN_CONTRACT
  return sendBlock(from, chainId, to, amount, base64(SELECTORS[kind]))
}
