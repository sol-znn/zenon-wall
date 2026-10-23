// Fuelled posts: a wall post that also donates ZNN to Accelerator-Z (ignite)
// or burns it (burn). Boost and Torch on the page send them.
//
// Why a fuelled post has to be two blocks: the Accelerator's Donate call and
// the token contract's Burn call each accept exactly their 4-byte selector as
// data (go-zenon vm/abi/abi.go, UnpackEmptyMethod), so neither can carry the
// message or any marker, and on chain one donation or burn looks like any
// other. What makes a wall donation or burn distinguishable is the post that
// names it: `ZW!<hash> <message>`, sent right after. The indexer accepts the
// link only when the named block is a Donate to Accelerator-Z or a Burn to the
// token contract, from the same address, in ZNN, of at least MIN_FUEL_ZNN, and
// not already named by an earlier post (indexer/src/fuel.ts). Nostr zaps
// (NIP-57) are the same shape: an ordinary payment, made distinguishable by the
// event that references it.
//
// The entries further down are made up, for the mockup on a dev server with
// ?preview=ignite (WallPage.vue).
import {MAX_MESSAGE_BYTES} from './post'
import type {WallMessage} from './wall'

export const MIN_FUEL_ZNN = 1

export interface Fuel {
  /** ignite: donated to Accelerator-Z. burn: destroyed through the token contract. */
  kind: 'ignite' | 'burn'
  /** ZNN, in base units. */
  amount: string
  /** The Donate or Burn block the post names. */
  block: string
}

const fake = (c: string) => c.repeat(64)
const post = (
  hash: string,
  height: number,
  time: string,
  address: string,
  message: string,
): WallMessage => ({
  hash: fake(hash),
  momentum_height: height,
  momentum_timestamp: time,
  block_index: 0,
  address,
  to_address: address,
  amount: '0',
  token_standard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
  token_symbol: null,
  token_decimals: null,
  message,
})

/** Made-up fuelled posts for the mockup. Not on chain. */
export const previewFuelled: WallMessage[] = [
  {
    ...post(
      'e',
      14_487_120,
      '2026-10-23T09:49:10.000Z',
      'z1qrw2vecdddmft89xh6yqencmjergsshhfmks0l',
      'Burned 10 ZNN so this one costs something to ignore.',
    ),
    fuel: {kind: 'burn', amount: '1000000000', block: fake('f')},
  },
  {
    ...post(
      'a',
      14_486_901,
      '2026-10-23T09:12:40.000Z',
      'z1qr3uww8uqh75qnsuxqajegvwaesqynfglrare2',
      'The aliens know. Funding the next builder, one momentum at a time.',
    ),
    fuel: {kind: 'ignite', amount: '2500000000', block: fake('b')},
  },
  {
    ...post(
      'c',
      14_486_388,
      '2026-10-23T07:47:10.000Z',
      'z1qp4k2lgvhy3rlwa9ypunngz0zvd2ltucn7eyez',
      'gm. 1 ZNN to AZ, because the wall should pay for something.',
    ),
    fuel: {kind: 'ignite', amount: '100000000', block: fake('d')},
  },
]

/** A plain 1 ZNN tag at the 512-byte cap, to see how the longest lays out. Not on chain. */
export const previewLongest: WallMessage = {
  ...post(
    '9',
    14_486_100,
    '2026-10-23T07:30:00.000Z',
    'z1qp4k2lgvhy3rlwa9ypunngz0zvd2ltucn7eyez',
    // ASCII, so 512 characters are 512 bytes.
    'Five hundred and twelve bytes is the most one tag can carry. '
      .repeat(9)
      .slice(0, MAX_MESSAGE_BYTES),
  ),
  amount: '100000000',
  token_symbol: 'ZNN',
  token_decimals: 8,
}
