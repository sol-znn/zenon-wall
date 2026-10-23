import {MAX_COUNT} from './rpc.ts'

export interface Config {
  rpcUrl: string
  supabaseUrl: string
  serviceRoleKey: string
  startHeight: number
  confirmations: number
  batchSize: number
  concurrency: number
  pollSeconds: number
  once: boolean
}

function required(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

function int(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}], got "${raw}"`)
  }
  return n
}

export function loadConfig(argv: string[]): Config {
  return {
    rpcUrl: process.env.ZNN_RPC_URL?.trim() || 'https://node.zenonhub.io:35997',
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    startHeight: int('START_HEIGHT', 1_341_000, 1),
    confirmations: int('CONFIRMATIONS', 6, 0),
    batchSize: int('BATCH_SIZE', MAX_COUNT, 1, MAX_COUNT),
    concurrency: int('CONCURRENCY', 4, 1, 32),
    pollSeconds: int('POLL_SECONDS', 30, 1),
    once: argv.includes('--once'),
  }
}
