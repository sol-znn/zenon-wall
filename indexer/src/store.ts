import {createClient, type SupabaseClient} from '@supabase/supabase-js'
import type {WallMessage} from './parse.ts'

const STATE_ID = 'mainnet'

export class Store {
  private readonly db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false},
    })
  }

  /** Last momentum fully scanned, or null on an empty database. */
  async lastHeight(): Promise<number | null> {
    const {data, error} = await this.db
      .from('indexer_state')
      .select('height')
      .eq('id', STATE_ID)
      .maybeSingle()
    if (error) throw new Error(`read indexer_state: ${error.message}`)
    return data ? Number(data.height) : null
  }

  /** The stored post naming each of `blocks` as its fuel, by block hash. */
  async claimedBy(blocks: string[]): Promise<Map<string, string>> {
    const {data, error} = await this.db
      .from('messages')
      .select('hash,fuel_block')
      .in('fuel_block', blocks)
    if (error) throw new Error(`read fuel claims: ${error.message}`)
    return new Map((data ?? []).map((r) => [r.fuel_block as string, r.hash as string]))
  }

  /**
   * Writes the messages, then moves the cursor. In that order, so a crash
   * between the two re-scans a range whose rows are already there — which the
   * upsert on hash makes harmless — instead of skipping one.
   */
  async commit(messages: WallMessage[], height: number): Promise<void> {
    if (messages.length > 0) {
      const {error} = await this.db
        .from('messages')
        .upsert(messages, {onConflict: 'hash', ignoreDuplicates: true})
      if (error) throw new Error(`upsert messages: ${error.message}`)
    }
    const {error} = await this.db
      .from('indexer_state')
      .upsert({id: STATE_ID, height, updated_at: new Date().toISOString()})
    if (error) throw new Error(`write indexer_state: ${error.message}`)
  }
}
