<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useDocumentVisibility, useIntervalFn} from '@vueuse/core'
import {RefreshCwIcon} from '@lucide/vue'
import {Badge, Button, Skeleton, Spinner} from 'nom-ui'
import WalletNotice from '@/components/WalletNotice.vue'
import MessageItem from '@/components/MessageItem.vue'
import SignTheWall, {type Posted} from '@/components/SignTheWall.vue'
import StateBlock from '@/components/StateBlock.vue'
import WallPager from '@/components/WallPager.vue'
import {useWallet} from '@/composables/useWallet'
import {isConfigured, pageSize} from '@/lib/env'
import {previewFuelled, previewLongest} from '@/lib/ignite'
import {height, relative, units} from '@/lib/format'
import {
  fetchCount,
  fetchIndexerState,
  fetchPage,
  type IndexerState,
  type WallMessage,
} from '@/lib/wall'

// One momentum. Each tick asks Supabase for the count and the indexer's height
// (two small requests) and reloads the list only when the count moved.
const POLL_MS = 10_000

const {connected} = useWallet()
const route = useRoute()
const router = useRouter()

const page = computed(() => {
  const n = Number(route.query.page)
  return Number.isInteger(n) && n > 0 ? n : 1
})

const messages = ref<WallMessage[]>([])
const total = ref(0)
const indexer = ref<IndexerState | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const now = ref(Date.now())

function goTo(p: number) {
  return router.push({query: p === 1 ? {} : {page: String(p)}})
}

let request = 0
async function load(quiet = false) {
  if (!isConfigured) return
  const id = ++request
  if (!quiet) loading.value = true
  try {
    const [p, s] = await Promise.all([
      fetchPage(page.value, pageSize),
      fetchIndexerState().catch(() => indexer.value),
    ])
    if (id !== request) return // a newer page was asked for meanwhile
    messages.value = p.messages
    total.value = p.total
    indexer.value = s
    error.value = null
    now.value = Date.now()
    const lastPage = Math.max(1, Math.ceil(p.total / pageSize))
    if (page.value > lastPage) void goTo(lastPage)
  } catch (err) {
    if (id !== request) return
    // A quiet refresh keeps what is on screen rather than swapping it for an error.
    if (!quiet || messages.value.length === 0) error.value = (err as Error).message
  } finally {
    if (id === request) loading.value = false
  }
}

watch(page, () => load(), {immediate: true})

// Live while the tab is being looked at. A new post changes only the first
// page's rows, so other pages just take the new count.
const visibility = useDocumentVisibility()
let polling = false
async function poll() {
  if (!isConfigured || polling || loading.value || visibility.value !== 'visible') return
  polling = true
  try {
    const [count, state] = await Promise.all([
      fetchCount().catch(() => null),
      fetchIndexerState().catch(() => null),
    ])
    now.value = Date.now()
    if (state) indexer.value = state
    if (count !== null && count !== total.value) {
      if (page.value === 1) await load(true)
      else total.value = count
    }
  } finally {
    polling = false
  }
}
useIntervalFn(poll, POLL_MS)
watch(visibility, (v) => v === 'visible' && void poll())

// Posts sent from this page, shown at the top until the indexer has them. Kept
// only in memory: the chain is the record, this is just so the wait is visible.
const pending = ref<Posted[]>([])
watch(messages, (list) => {
  const seen = new Set(list.map((m) => m.hash))
  pending.value = pending.value.filter((p) => !seen.has(p.hash))
})

// A number flashes when it changes after the first load, so a live update is seen.
const settled = ref(false)
watch(loading, (l) => !l && !error.value && setTimeout(() => (settled.value = true), 0))

function onPosted(post: Posted) {
  pending.value = [post, ...pending.value]
  if (page.value !== 1) void goTo(1)
}

// The ignite and burn mockup (lib/ignite.ts): made-up fuelled entries on top of
// page 1, on a dev server with ?preview=ignite only. Never in a production build.
const ignitePreview = computed(() => import.meta.env.DEV && route.query.preview === 'ignite')
const shown = computed<WallMessage[]>(() =>
  ignitePreview.value && page.value === 1
    ? [...previewFuelled, previewLongest, ...messages.value]
    : messages.value,
)

// Newest first: page 1 is the latest ten, newest at the top. Year dividers, as
// the original wall had them.
const groups = computed(() => {
  const out: {year: string; items: WallMessage[]}[] = []
  for (const m of shown.value) {
    const year = m.momentum_timestamp.slice(0, 4)
    let g = out[out.length - 1]
    if (g?.year !== year) out.push((g = {year, items: []}))
    g.items.push(m)
  }
  return out
})

const first = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1))
const last = computed(() => Math.min(total.value, page.value * pageSize))
</script>

<template>
  <section>
    <p class="rise text-ledger text-muted-foreground">Written on the Network of Momentum</p>
    <h1
      class="rise mt-3 inline-block text-4xl leading-none font-bold tracking-[-0.04em] uppercase sm:text-5xl"
      style="--i: 1"
    >
      Zenon Wall
      <span class="wall-rule mt-[0.08em] block" aria-hidden="true" />
    </h1>
    <p class="rise mt-4 text-lg font-medium tracking-tight sm:text-xl" style="--i: 2">
      Where the aliens leave their mark.
    </p>

    <dl v-if="isConfigured" class="rise mt-7 flex flex-wrap gap-x-8 gap-y-3" style="--i: 3">
        <div>
          <dt class="text-ledger text-muted-foreground">Messages</dt>
          <dd class="font-mono text-lg tabular-nums">
            <Skeleton v-if="loading && !total" class="mt-1 h-5 w-10" />
            <span v-else :key="total" :class="{flash: settled}">{{ height(total) }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-ledger text-muted-foreground">Indexed through</dt>
          <dd class="font-mono text-lg tabular-nums">
            <Skeleton v-if="!indexer && loading" class="mt-1 h-5 w-24" />
            <span
              v-else-if="indexer"
              :key="indexer.height"
              :class="{flash: settled}"
              :title="`Updated ${relative(indexer.updated_at, now)}`"
            >
              #{{ height(indexer.height) }}
            </span>
            <span v-else class="text-muted-foreground">None yet</span>
          </dd>
        </div>
    </dl>

    <SignTheWall
      v-if="connected"
      class="rise mt-7"
      style="--i: 4"
      @posted="onPosted"
    />
    <WalletNotice v-else class="mt-7" />
  </section>

  <section class="mt-10">
    <p
      v-if="ignitePreview"
      class="mb-3 rounded-md border border-dashed border-warning/50 px-3 py-2 text-xs text-warning"
    >
      Preview: the first four entries are made up.
    </p>
    <StateBlock
      v-if="!isConfigured"
      kind="error"
      title="Not connected to a wall"
      message="This build has no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See docs/SETUP.md."
    />

    <StateBlock v-else-if="error" kind="error" title="Could not load the wall" :message="error" />

    <div v-else-if="loading && messages.length === 0" class="flex flex-col gap-2.5" aria-busy="true">
      <div v-for="i in 4" :key="i" class="slab rounded-md border border-slab px-4 py-3.5 sm:px-5 sm:py-4">
        <Skeleton class="h-3 w-40" />
        <Skeleton class="mt-4 h-5 w-4/5" />
        <Skeleton class="mt-4 h-3 w-52" />
      </div>
    </div>

    <StateBlock
      v-else-if="total === 0 && !pending.length"
      kind="empty"
      title="Nothing on the wall yet."
      message="The first message is one transaction away."
    />

    <!-- Each message is a slab set into the wall. -->
    <div
      v-else
      class="flex flex-col gap-2.5"
      :class="{'opacity-60 transition-opacity': loading && !pending.length}"
    >
      <!-- Newest first, so a post still confirming goes above everything. -->
      <template v-if="page === 1">
        <article
          v-for="p in pending"
          :key="p.hash"
          class="slab rounded-md border border-dashed border-info/50 px-4 py-3.5 sm:px-5 sm:py-4"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="pending" class="gap-1.5">
              <Spinner class="size-3" />
              Confirming
            </Badge>
            <span v-if="p.fuel" class="font-mono text-xs tabular-nums text-muted-foreground"
              >{{ units(p.fuel.amount, 8) }} ZNN
              {{ p.fuel.kind === 'burn' ? 'burned' : 'to Accelerator-Z' }}</span
            >
          </div>
          <p
            dir="auto"
            class="mt-1.5 text-base leading-snug font-medium whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere] [unicode-bidi:isolate] sm:text-lg"
          >{{ p.message }}</p>
        </article>
      </template>
      <template v-for="(g, gi) in groups" :key="g.year">
        <div class="flex items-center gap-4 pt-4 first:pt-0">
          <span class="font-mono text-sm font-semibold tabular-nums text-muted-foreground">{{
            g.year
          }}</span>
          <span class="h-px flex-1 bg-border" />
        </div>
        <MessageItem
          v-for="(m, i) in g.items"
          :key="m.hash"
          :message="m"
          :fuel="m.fuel"
          :latest="page === 1 && gi === 0 && i === 0 && !pending.length"
          class="rise"
          :style="{'--i': Math.min(i, 8)}"
        />
      </template>
    </div>

    <div
      v-if="isConfigured && !error && total > 0"
      class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p class="flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
        {{ height(first) }}–{{ height(last) }} of {{ height(total) }}
        <Button
          variant="ghost"
          size="icon-sm"
          class="size-7"
          aria-label="Refresh"
          :disabled="loading"
          @click="load()"
        >
          <!-- No motion-reduce variant: motion always runs (webdesign-lab/RULES.md §4). -->
          <RefreshCwIcon :class="{'animate-spin': loading}" />
        </Button>
      </p>
      <WallPager
        v-if="total > pageSize"
        :page="page"
        :total="total"
        :page-size="pageSize"
        class="mx-0 w-auto"
        @update:page="goTo"
      />
    </div>
  </section>
</template>
