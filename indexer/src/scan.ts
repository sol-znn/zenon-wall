// Dry run: print the wall posts in a height range without touching Supabase.
//   npm run scan -- <from> <to>
import {extractMessages} from './parse.ts'
import {MAX_COUNT, RpcClient} from './rpc.ts'

const [from, to] = process.argv.slice(2).map(Number)
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
  console.error('usage: npm run scan -- <from> <to>')
  process.exit(2)
}

const rpc = new RpcClient(process.env.ZNN_RPC_URL?.trim() || 'https://node.zenonhub.io:35997')
let found = 0
for (let h = from; h <= to; h += MAX_COUNT) {
  const count = Math.min(MAX_COUNT, to - h + 1)
  for (const m of extractMessages(await rpc.detailedMomentums(h, count))) {
    found++
    console.log(`${m.momentum_height}\t${m.momentum_timestamp}\t${m.hash}\t${JSON.stringify(m.message)}`)
  }
}
console.log(`${found} message(s) in ${from}..${to}`)
