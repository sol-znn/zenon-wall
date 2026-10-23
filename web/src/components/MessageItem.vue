<script setup lang="ts">
import {computed, useId} from 'vue'
import {ArrowUpRightIcon, FlameIcon, RocketIcon} from '@lucide/vue'
import {Address} from 'nom-ui'
import {explorer} from '@/lib/env'
import {amountText} from '@/lib/format'
import type {Fuel} from '@/lib/ignite'
import type {WallMessage} from '@/lib/wall'

// `latest` marks the newest post on the wall: it carries the original wall's
// green rule along its bottom edge. The others show it on hover. `fuel` marks a
// post that also donated ZNN to Accelerator-Z (ignite) or burned it (burn), see
// lib/ignite.ts: each gets its own edge, motion and a chip naming the amount.
const props = defineProps<{message: WallMessage; latest?: boolean; fuel?: Fuel}>()

// A zero-amount send has no token on the node's answer; nothing to show.
const amount = computed(() => {
  const m = props.message
  if (m.amount === '0' || m.token_decimals === null) return null
  return {text: amountText(m.amount, m.token_decimals), symbol: m.token_symbol ?? ''}
})
const fuelled = computed(() => (props.fuel ? amountText(props.fuel.amount, 8) : null))
const skin = computed(() =>
  props.fuel?.kind === 'ignite' ? 'ignited' : props.fuel?.kind === 'burn' ? 'burned' : '',
)
const ink = computed(() => (props.fuel?.kind === 'burn' ? 'burn-text' : 'ignite-text'))

// Puts this slab's shine (chip, then numeral) at the same point in its cycle as
// every other ignited slab, wherever it joined the page: all read the one
// document clock.
const SHINE_MS = 6000
const inStep = `-${Math.round(performance.now() % SHINE_MS)}ms`

// The edge line's dashes, in percent of the way round: stacked, they make one
// line bright at its head and fading down its tail (style.css).
// 48 steps of 2/3 each: fine enough that no step shows, and the tail ends at
// 3% strength rather than at a visible cut.
const TAIL = Array.from({length: 48}, (_, k) => +(32 - (2 / 3) * k).toFixed(3))

// The fuelled edge's gradient, one id per slab so two slabs never share a def.
const edgeId = useId()
const edgeStops = computed(() =>
  props.fuel?.kind === 'burn'
    ? ['hsl(352 90% 54%)', 'hsl(24 100% 55%)', 'hsl(46 100% 64%)']
    : ['hsl(145 100% 48%)', 'hsl(214 100% 62%)', 'hsl(328 95% 62%)'],
)
</script>

<template>
  <article
    class="slab group relative overflow-hidden rounded-md px-4 py-3.5 transition-[transform,border-color,box-shadow] duration-150 ease-[cubic-bezier(.4,0,.2,1)] hover:-translate-y-0.5 sm:px-5 sm:py-4"
    :class="fuel ? skin : 'border border-slab shadow-sm hover:shadow-md'"
    :style="fuel?.kind === 'ignite' ? {'--shine-delay': inStep} : undefined"
  >
    <!-- The fuelled edge: a faint outline and a line of light round it (style.css). -->
    <svg v-if="fuel" class="edge pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <linearGradient :id="edgeId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="edgeStops[0]" />
          <stop offset="0.5" :stop-color="edgeStops[1]" />
          <stop offset="1" :stop-color="edgeStops[2]" />
        </linearGradient>
      </defs>
      <rect class="edge-base" x="1" y="1" rx="3" :stroke="`url(#${edgeId})`" />
      <g class="edge-line">
        <rect
          v-for="len in TAIL"
          :key="len"
          x="1"
          y="1"
          rx="3"
          pathLength="100"
          :stroke="`url(#${edgeId})`"
          :style="{'--len': len}"
        />
      </g>
    </svg>
    <span
      v-if="!fuel"
      class="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-primary transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
      :class="latest ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'"
      aria-hidden="true"
    />
    <div class="relative flex items-start gap-3">
      <!--
        The message is untrusted on-chain text. Mustache interpolation escapes
        it; dir="auto" with bidi isolation keeps an embedded RTL override from
        reversing the page around it; overflow-wrap:anywhere stops a long
        unbroken string from widening the column.
      -->
      <p
        dir="auto"
        class="min-w-0 flex-1 text-base leading-snug font-medium tracking-tight whitespace-pre-wrap [overflow-wrap:anywhere] [unicode-bidi:isolate] sm:text-lg"
      >{{ message.message }}</p>
      <!-- The post's transaction. In the row, so the message wraps before it. -->
      <a
        v-if="explorer"
        :href="explorer.tx(message.hash)"
        target="_blank"
        rel="noreferrer"
        class="-mr-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-info"
        :title="`Transaction ${message.hash}`"
        aria-label="View the transaction"
      >
        <ArrowUpRightIcon class="size-4" />
      </a>
    </div>

    <!--
      What the post carried and who sent it, beside the momentum height stamped
      large into the slab like a brick's mark. The stamp is in the row, not laid
      over the slab, so no text can cover it: the row wraps before reaching it,
      and the message sits wholly above it.
    -->
    <div class="relative mt-2.5 flex items-end gap-3 text-xs text-muted-foreground">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
        <component
          :is="explorer ? 'a' : 'span'"
          v-if="fuel"
          :href="explorer?.tx(fuel.block)"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2"
          :class="fuel.kind === 'burn' ? 'burn-chip' : 'ignite-chip'"
          :title="`${fuel.kind === 'burn' ? 'Burn' : 'Donation'} ${fuel.block}`"
        >
          <FlameIcon
            v-if="fuel.kind === 'burn'"
            class="flame-lick size-3.5 text-[hsl(24_100%_55%)]"
          />
          <RocketIcon v-else class="rocket-thrust size-3.5 text-[hsl(328_95%_60%)]" />
          <span class="font-mono font-semibold tabular-nums" :class="ink">{{ fuelled }} ZNN</span>
          <span v-if="fuel.kind === 'burn'" class="text-ledger text-muted-foreground">burned</span>
          <!-- Short on a phone, so the chip fits beside the stamp. -->
          <span v-else class="text-ledger text-muted-foreground"
            >to <span class="sm:hidden">AZ</span><span class="hidden sm:inline">Accelerator-Z</span></span
          >
        </component>
        <component
          :is="explorer ? 'a' : 'span'"
          v-if="amount"
          :href="explorer?.tx(message.hash)"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1.5 rounded-full border border-slab px-2.5 py-0.5 transition-colors hover:text-foreground"
          :title="`Transaction ${message.hash}`"
        >
          <span class="font-mono font-semibold tabular-nums text-foreground"
            >{{ amount.text }}<span v-if="amount.symbol" class="ml-1">{{ amount.symbol }}</span></span
          >
          <span class="text-ledger">sent</span>
        </component>
        <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span class="text-ledger">from</span>
          <Address
            :address="message.address"
            :href="explorer?.account(message.address)"
            :start="8"
            :end="6"
            :copy="false"
            class="text-xs text-muted-foreground"
          />
        </span>
      </div>
      <span
        class="pointer-events-none -mb-1 shrink-0 font-mono text-3xl leading-none font-bold tracking-tighter tabular-nums select-none sm:text-4xl"
        :class="
          fuel?.kind === 'ignite'
            ? 'ignite-numeral'
            : fuel
              ? [ink, 'opacity-60']
              : 'text-foreground/35'
        "
        aria-hidden="true"
        >{{ message.momentum_height }}</span
      >
    </div>
  </article>
</template>
