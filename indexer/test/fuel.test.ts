import assert from 'node:assert/strict'
import {test} from 'node:test'
import {ACCELERATOR_Z, attachFuel, fuelOf, TOKEN_CONTRACT} from '../src/fuel.ts'
import type {Post} from '../src/parse.ts'
import type {RpcAccountBlock} from '../src/rpc.ts'

const ME = 'z1qr3uww8uqh75qnsuxqajegvwaesqynfglrare2'
const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx'
const DONATE = Buffer.from('cb7f8b2a', 'hex').toString('base64')
const BURN = Buffer.from('3395ab94', 'hex').toString('base64')
const FUEL = 'f'.repeat(64)

const donation = (over: Partial<RpcAccountBlock> = {}): RpcAccountBlock => ({
  blockType: 2,
  hash: FUEL,
  height: 9,
  address: ME,
  toAddress: ACCELERATOR_Z,
  amount: '500000000',
  tokenStandard: ZNN,
  data: DONATE,
  token: null,
  confirmationDetail: {momentumHeight: 100},
  ...over,
})

const post = (hash = 'a'.repeat(64), claim: string | null = FUEL): Post => ({
  message: {
    hash,
    momentum_height: 100,
    momentum_hash: 'm',
    momentum_timestamp: '2026-10-23T00:00:00.000Z',
    block_index: 1,
    address: ME,
    to_address: ME,
    amount: '0',
    token_standard: ZNN,
    token_symbol: null,
    token_decimals: null,
    message: 'gm',
    fuel_kind: null,
    fuel_amount: null,
    fuel_block: null,
  },
  claim,
  height: 10,
})

test('a donation to Accelerator-Z or a burn backs the post', () => {
  assert.deepEqual(fuelOf(post(), donation()), {fuel_kind: 'ignite', fuel_amount: '500000000'})
  assert.deepEqual(fuelOf(post(), donation({toAddress: TOKEN_CONTRACT, data: BURN})), {
    fuel_kind: 'burn',
    fuel_amount: '500000000',
  })
})

test('anything else does not', () => {
  const no = (over: Partial<RpcAccountBlock>) => assert.equal(fuelOf(post(), donation(over)), null)
  no({address: 'z1qz7rl42ytj7j5kyqn6dw38hds3pwru38y3p7r0'}) // someone else's donation
  no({height: 11}) // sent after the post
  no({confirmationDetail: null})
  no({confirmationDetail: {momentumHeight: 101}})
  no({tokenStandard: 'zts1qsrxxxxxxxxxxxxxmrhjll'}) // QSR
  no({amount: '99999999'}) // under 1 ZNN
  no({data: BURN}) // the wrong call for the contract
  no({toAddress: TOKEN_CONTRACT, data: DONATE})
  no({toAddress: ME, data: null}) // a plain send
  no({blockType: 4})
  no({hash: 'e'.repeat(64)})
  assert.equal(fuelOf(post(), null), null)
})

test('the first post to name a block keeps it', async () => {
  const block = async () => donation()
  const none = async () => new Map<string, string>()
  const [a, b] = await attachFuel([post('a'.repeat(64)), post('b'.repeat(64))], block, none)
  assert.equal(a.fuel_block, FUEL)
  assert.equal(a.fuel_kind, 'ignite')
  assert.equal(b.fuel_block, null)
  assert.equal(b.message, 'gm')

  // Stored earlier by another post: this one stays plain. Re-indexing the
  // stored post itself keeps its fuel.
  const stored = async () => new Map([[FUEL, 'c'.repeat(64)]])
  assert.equal((await attachFuel([post()], block, stored))[0].fuel_block, null)
  const self = async () => new Map([[FUEL, 'a'.repeat(64)]])
  assert.equal((await attachFuel([post()], block, self))[0].fuel_block, FUEL)
})

test('posts without a claim cost no lookups', async () => {
  const fail = async () => {
    throw new Error('looked up')
  }
  const rows = await attachFuel([post('a'.repeat(64), null)], fail, fail)
  assert.equal(rows[0].fuel_kind, null)
})
