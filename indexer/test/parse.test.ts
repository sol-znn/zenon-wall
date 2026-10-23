import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {extractMessages, wallPost, wallText} from '../src/parse.ts'
import type {RpcDetailedMomentum} from '../src/rpc.ts'

const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64')

test('strips the ZW prefix and surrounding whitespace', () => {
  assert.equal(wallText(b64('ZW Hello ZNNAliens!')), 'Hello ZNNAliens!')
  assert.equal(wallText(b64('ZW\n  multi\nline  ')), 'multi\nline')
})

test('ignores payloads that are not wall posts', () => {
  assert.equal(wallText(null), null)
  assert.equal(wallText(''), null)
  assert.equal(wallText(b64('ZNN Hello Zenon.')), null)
  assert.equal(wallText(b64('zw lowercase')), null)
  assert.equal(wallText(b64('ZW')), null)
  assert.equal(wallText(b64('ZW   ')), null)
})

test('rejects invalid UTF-8 and drops control characters', () => {
  assert.equal(wallText(b64(new Uint8Array([0x5a, 0x57, 0x20, 0xff, 0xfe]))), null)
  assert.equal(wallText(b64('ZW a\u0000b\u001bc\td')), 'abc\td')
})

test('keeps markup as literal text', () => {
  assert.equal(wallText(b64('ZW <svg/onload=alert(1)>')), '<svg/onload=alert(1)>')
})

test('finds the original mainnet post and nothing else in the fixture', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/mainnet-1341xxx.json', import.meta.url), 'utf8'),
  ) as RpcDetailedMomentum[]
  const msgs = extractMessages(fixture)
  assert.equal(msgs.length, 1)
  assert.deepEqual(msgs[0], {
    hash: '6848856db2673389f41c33dc0e2b36e797e485b6055e3bc011db7274ee78a914',
    momentum_height: 1341650,
    momentum_hash: fixture.find((m) => m.momentum.height === 1341650)!.momentum.hash,
    momentum_timestamp: '2022-05-04T07:21:10.000Z',
    block_index: msgs[0].block_index,
    address: 'z1qr3uww8uqh75qnsuxqajegvwaesqynfglrare2',
    to_address: 'z1qr3uww8uqh75qnsuxqajegvwaesqynfglrare2',
    amount: '1000000',
    token_standard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    token_symbol: 'ZNN',
    token_decimals: 8,
    message: 'Hello ZNNAliens!',
    fuel_kind: null,
    fuel_amount: null,
    fuel_block: null,
  })
})

test('deduplicates a block that appears twice', () => {
  const m: RpcDetailedMomentum = {
    momentum: {hash: 'aa', height: 1, timestamp: 0},
    blocks: [0, 1].map(() => ({
      blockType: 2, hash: 'h', height: 1, address: 'a', toAddress: 'b', amount: '0',
      tokenStandard: 't', data: b64('ZW hi'), token: null,
    })),
  }
  assert.equal(extractMessages([m]).length, 1)
})

test('a ZW! post names a block and keeps the rest as its message', () => {
  const h = 'ab'.repeat(32)
  assert.deepEqual(wallPost(b64(`ZW!${h} gm`)), {text: 'gm', claim: h})
  assert.deepEqual(wallPost(b64(`ZW!${h}
line`)), {text: 'line', claim: h})
  // Not a hash, or not followed by a space: an ordinary post.
  assert.deepEqual(wallPost(b64('ZW!gm')), {text: '!gm', claim: null})
  assert.deepEqual(wallPost(b64(`ZW!${h}x`)), {text: `!${h}x`, claim: null})
  assert.deepEqual(wallPost(b64(`ZW!${h.toUpperCase()} gm`)), {text: `!${h.toUpperCase()} gm`, claim: null})
  // A claim with nothing to say is not a post.
  assert.equal(wallPost(b64(`ZW!${h}   `)), null)
})
