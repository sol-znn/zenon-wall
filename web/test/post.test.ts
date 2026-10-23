import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  fuelBlock,
  MAX_MESSAGE_BYTES,
  normalizeMessage,
  wallPostBlock,
  znnBaseUnits,
} from '../src/lib/post.ts'
import {wallPost, wallText} from '../../indexer/src/parse.ts'

const ADDR = 'z1qr3uww8uqh75qnsuxqajegvwaesqynfglrare2'

test('a post is a 0 ZNN send to yourself', () => {
  const b = wallPostBlock('Hello ZNNAliens!', ADDR, 69)
  assert.equal(b.blockType, 2)
  assert.equal(b.amount, '0')
  assert.equal(b.toAddress, ADDR)
  assert.equal(b.address, ADDR)
  assert.equal(b.tokenStandard, 'zts1znnxxxxxxxxxxxxx9z4ulx')
  assert.equal(b.chainIdentifier, 69)
  assert.equal(Buffer.from(b.data, 'base64').toString('utf8'), 'ZW Hello ZNNAliens!')
})

test('a tag sends the chosen ZNN to yourself', () => {
  const b = wallPostBlock('gm', ADDR, 1, '100000000')
  assert.equal(b.amount, '100000000')
  assert.equal(b.toAddress, ADDR)
})

test('amounts convert to base units exactly', () => {
  assert.equal(znnBaseUnits('1'), 100_000_000n)
  assert.equal(znnBaseUnits('2.5'), 250_000_000n)
  assert.equal(znnBaseUnits(' 0.00000001 '), 1n)
  assert.equal(znnBaseUnits('123456789.12345678'), 12_345_678_912_345_678n)
  for (const bad of ['', '.5', '1.', '1.123456789', '-1', '1e3', 'abc', '1,5']) {
    assert.equal(znnBaseUnits(bad), null, bad)
  }
})

test('the indexer reads back exactly what the form sent', () => {
  for (const msg of ['gm', '  padded\n', 'multi\nline', 'emoji 👽 and ünïcödé', '<b>markup</b>']) {
    const b = wallPostBlock(msg, ADDR, 1)
    assert.equal(wallText(b.data), normalizeMessage(msg))
  }
})

test('Boost donates to Accelerator-Z and Torch burns, each with only its selector', () => {
  const boost = fuelBlock('ignite', ADDR, 1, '500000000')
  assert.equal(boost.toAddress, 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22')
  assert.equal(Buffer.from(boost.data, 'base64').toString('hex'), 'cb7f8b2a')
  const torch = fuelBlock('burn', ADDR, 1, '500000000')
  assert.equal(torch.toAddress, 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0')
  assert.equal(Buffer.from(torch.data, 'base64').toString('hex'), '3395ab94')
  for (const b of [boost, torch]) {
    assert.equal(b.amount, '500000000')
    assert.equal(b.tokenStandard, 'zts1znnxxxxxxxxxxxxx9z4ulx')
    assert.equal(b.address, ADDR)
  }
})

test('the post after it names the block, and the indexer reads the claim back', () => {
  const fuel = 'ab'.repeat(32)
  const b = wallPostBlock('gm', ADDR, 1, '0', fuel)
  assert.equal(b.toAddress, ADDR)
  assert.equal(b.amount, '0')
  assert.equal(Buffer.from(b.data, 'base64').toString('utf8'), `ZW!${fuel} gm`)
  assert.deepEqual(wallPost(b.data), {text: 'gm', claim: fuel})
  assert.throws(() => wallPostBlock('gm', ADDR, 1, '0', 'nothex'))
})

test('refuses empty and oversized messages', () => {
  assert.throws(() => wallPostBlock('   ', ADDR, 1), /Write something/)
  assert.doesNotThrow(() => wallPostBlock('a'.repeat(MAX_MESSAGE_BYTES), ADDR, 1))
  assert.throws(() => wallPostBlock('a'.repeat(MAX_MESSAGE_BYTES + 1), ADDR, 1), /at most/)
  // Bytes, not characters: 👽 is four.
  assert.throws(() => wallPostBlock('👽'.repeat(129), ADDR, 1), /516 bytes/)
})

// Syrius parses the block with znn-ts-sdk's AccountBlockTemplate.fromJson. Run
// only where the extension's checkout (with its node_modules) sits beside this repo.
const SDK = new URL('../../../../syrius-extension/node_modules/znn-ts-sdk/dist/index.js', import.meta.url)
test('znn-ts-sdk parses the block the way Syrius will', async (t) => {
  let sdk: {Primitives: {AccountBlockTemplate: {fromJson(j: unknown): {toJson(): Record<string, unknown>}}}}
  try {
    const mod = await import(SDK.href)
    sdk = mod.default ?? mod // CommonJS: the exports arrive as `default`
  } catch {
    t.skip('znn-ts-sdk not found beside this repo')
    return
  }
  const block = wallPostBlock('Hello from the SDK', ADDR, 69)
  const parsed = sdk.Primitives.AccountBlockTemplate.fromJson(block).toJson()
  assert.equal(parsed.toAddress, ADDR)
  assert.equal(String(parsed.amount), '0')
  assert.equal(parsed.tokenStandard, block.tokenStandard)
  assert.equal(parsed.data, block.data)
  assert.equal(parsed.blockType, 2)
})
