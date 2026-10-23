import {reactive} from 'vue'
import type {IndexerState} from './wall'

/**
 * The wall's message count and indexer height, as the wall page last read them.
 * The page fetches and polls; the header only shows them. Null until known.
 */
export const wallStats = reactive<{total: number | null; indexer: IndexerState | null}>({
  total: null,
  indexer: null,
})
