<script setup lang="ts">
import {computed, ref} from 'vue'
import {
  ChevronDownIcon,
  CircleCheckIcon,
  FlameIcon,
  InfoIcon,
  RocketIcon,
  SprayCanIcon,
  TriangleAlertIcon,
} from '@lucide/vue'
import {
  Address,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Input,
  Spinner,
  Textarea,
} from 'nom-ui'
import {useWallet} from '@/composables/useWallet'
import {chainId, explorer, networkName} from '@/lib/env'
import {units} from '@/lib/format'
import {MIN_FUEL_ZNN, type Fuel} from '@/lib/ignite'
import {
  MAX_MESSAGE_BYTES,
  messageBytes,
  MIN_TAG_ZNN,
  normalizeMessage,
  WALL_PREFIX,
  znnBaseUnits,
} from '@/lib/post'
import {DeclinedError} from '@/lib/syrius'

export interface Posted {
  hash: string
  message: string
  address: string
  fuel?: Fuel
}
const emit = defineEmits<{posted: [post: Posted]}>()

const {address, sending, holdSeconds, wrongChain, walletChainId, post, sendFuel, disconnect} =
  useWallet()

const draft = ref('')
const error = ref('')
const sent = ref<{hash: string} | null>(null)

const text = computed(() => normalizeMessage(draft.value))
const bytes = computed(() => (text.value ? messageBytes(text.value) : 0))
const tooLong = computed(() => bytes.value > MAX_MESSAGE_BYTES)
// One amount for all three buttons: what Tag sends to yourself, or what Boost
// donates and Torch burns. Never less than 1 ZNN.
const MIN_ZNN = Math.max(MIN_TAG_ZNN, MIN_FUEL_ZNN)
const znn = ref(String(MIN_ZNN))
const amount = computed(() => znnBaseUnits(znn.value))
const amountOk = computed(
  () => amount.value !== null && amount.value >= (znnBaseUnits(String(MIN_ZNN)) ?? 0n),
)
const canSend = computed(
  () => !!text.value && !tooLong.value && amountOk.value && !sending.value && !wrongChain.value,
)

// Which approval Syrius is showing: the donation or burn, or the post.
const step = ref<'fuel' | 'post'>('post')

// A donation or burn that went out while the post naming it did not. The ZNN
// is spent either way, so the page offers to post again, naming it.
const unclaimed = ref<Fuel | null>(null)

async function publish(message: string, amount: string, fuel?: Fuel) {
  step.value = 'post'
  const hash = await post(message, amount, fuel?.block)
  unclaimed.value = null
  sent.value = {hash}
  draft.value = ''
  emit('posted', {hash, message, address: address.value, fuel})
}

function failed(err: unknown) {
  // A decline keeps the draft and says nothing: nothing was sent.
  if (!(err instanceof DeclinedError)) error.value = (err as Error).message
}

async function submit() {
  if (!canSend.value || !text.value || amount.value === null) return
  error.value = ''
  sent.value = null
  try {
    await publish(text.value, amount.value.toString())
  } catch (err) {
    failed(err)
  }
}

// Boost (donate to Accelerator-Z) and Torch (burn) put ZNN behind a post: two
// blocks, the donation or burn and then the post naming it (lib/ignite.ts).
// Syrius returns the hash the moment it publishes, so the post's approval
// follows straight away, without waiting for a momentum.
async function fuel(kind: Fuel['kind']) {
  if (!canSend.value || !text.value || amount.value === null) return
  error.value = ''
  sent.value = null
  const message = text.value
  try {
    step.value = 'fuel'
    const block = await sendFuel(kind, amount.value.toString())
    unclaimed.value = {kind, amount: amount.value.toString(), block}
    await publish(message, '0', unclaimed.value)
  } catch (err) {
    failed(err)
  }
}

async function claim() {
  if (!unclaimed.value || !text.value || tooLong.value || sending.value) return
  error.value = ''
  try {
    await publish(text.value, '0', unclaimed.value)
  } catch (err) {
    failed(err)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
}
</script>

<template>
  <Card class="gap-0 border-slab! bg-slab! p-4 sm:p-5">
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label for="wall-message" class="font-medium">Tag the Wall</label>
        <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Address :address="address" :start="8" :end="6" :copy="false" class="text-xs" />
          <Button
            type="button"
            variant="link"
            size="xs"
            class="h-auto px-0 text-xs text-muted-foreground sm:hidden"
            @click="disconnect"
            >Disconnect</Button
          >
        </span>
      </div>

      <Textarea
        id="wall-message"
        v-model="draft"
        rows="3"
        maxlength="2048"
        placeholder="Hello ZNNAliens!"
        :disabled="sending"
        class="resize-y text-base leading-relaxed"
        :aria-invalid="tooLong || undefined"
        aria-describedby="wall-message-hint"
        @keydown="onKeydown"
      />

      <span
        id="wall-message-hint"
        class="-mt-1 self-end font-mono text-xs tabular-nums text-muted-foreground"
        :class="{'text-destructive': tooLong}"
      >
        {{ bytes }}/{{ MAX_MESSAGE_BYTES }} bytes
      </span>

      <Alert v-if="wrongChain" variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Wrong network</AlertTitle>
        <AlertDescription>
          Syrius is on chain {{ walletChainId }}; this wall reads {{ networkName }} (chain
          {{ chainId }}). Switch networks in the wallet to post.
        </AlertDescription>
      </Alert>

      <Alert v-if="error" variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Not posted</AlertTitle>
        <AlertDescription class="break-words">{{ error }}</AlertDescription>
      </Alert>

      <Alert v-if="sent" class="border-success/40">
        <CircleCheckIcon class="!text-success" />
        <AlertTitle>Sent</AlertTitle>
        <AlertDescription class="flex flex-wrap items-center gap-x-1.5">
          Transaction
          <Address
            :address="sent.hash"
            :href="explorer?.tx(sent.hash)"
            :start="8"
            :end="6"
            class="text-xs"
          />. It appears on the wall once a momentum confirms it.
        </AlertDescription>
      </Alert>

      <Alert v-if="unclaimed && !sending" class="border-warning/40">
        <TriangleAlertIcon class="!text-warning" />
        <AlertTitle>{{ unclaimed.kind === 'burn' ? 'Burned' : 'Donated' }}, not posted</AlertTitle>
        <AlertDescription class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <span>
            {{ units(unclaimed.amount, 8) }} ZNN
            {{ unclaimed.kind === 'burn' ? 'was burned' : 'went to Accelerator-Z' }}, but the post
            naming it was not sent.
          </span>
          <Button type="button" size="xs" variant="outline" :disabled="!text || tooLong" @click="claim"
            >Post it</Button
          >
        </AlertDescription>
      </Alert>

      <span v-if="sending && holdSeconds > 0" class="text-right text-xs text-muted-foreground tabular-nums"
        >Syrius is pausing this site. Asking again in {{ holdSeconds }} s</span
      >
      <span v-else-if="sending" class="text-right text-xs text-muted-foreground"
        >{{ step === 'fuel' ? 'Approve the ZNN in Syrius, then the post…' : 'Approve the post in Syrius…' }}</span
      >

      <!--
        Three ways to sign. Tag is the plain post and the primary action. Boost
        and Torch carry the motif of the entries they make, and the ZNN put
        behind the post.
      -->
      <div class="flex flex-wrap items-center justify-end gap-2">
        <label class="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input
            v-model="znn"
            inputmode="decimal"
            class="h-8 w-16 text-right font-mono tabular-nums"
            :aria-invalid="!amountOk || undefined"
            :aria-label="`ZNN to send, at least ${MIN_ZNN}`"
          />
          ZNN
        </label>
        <button
          type="button"
          class="fuel-btn ignite-chip"
          :disabled="!canSend"
          @click="fuel('ignite')"
        >
          <RocketIcon class="rocket-thrust size-4 text-[hsl(328_95%_60%)]" />
          Boost
        </button>
        <button
          type="button"
          class="fuel-btn burn-chip"
          :disabled="!canSend"
          @click="fuel('burn')"
        >
          <FlameIcon class="flame-lick size-4 text-[hsl(24_100%_55%)]" />
          Torch
        </button>
        <Button type="submit" :disabled="!canSend">
          <Spinner v-if="sending" />
          <!-- Raised so the can's base sits on the label's baseline. -->
          <SprayCanIcon v-else class="-translate-y-0.5" />
          Tag
        </Button>
      </div>

      <!-- What each button sends, folded away until asked for. -->
      <details class="group text-xs text-muted-foreground">
        <summary
          class="ml-auto flex w-fit cursor-pointer list-none items-center gap-1 transition-colors select-none hover:text-foreground [&::-webkit-details-marker]:hidden"
        >
          <InfoIcon class="size-3.5" />
          What each does
          <ChevronDownIcon class="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-slab p-3">
          <dt class="font-medium text-foreground">Tag</dt>
          <dd>
            Sends the ZNN to yourself with
            <code class="font-mono text-foreground">{{ WALL_PREFIX.trim() }}</code> prepended. You
            keep it; only plasma is spent.
          </dd>
          <dt class="font-medium text-foreground">Boost</dt>
          <dd>Donates the ZNN to Accelerator-Z, then tags. The entry glows in its colours.</dd>
          <dt class="font-medium text-foreground">Torch</dt>
          <dd>Burns the ZNN for good, then tags. The entry smoulders.</dd>
          <dd class="col-span-2 pt-1">
            Boost and Torch ask Syrius twice: the ZNN, then the post. All three are public and
            permanent.
          </dd>
        </dl>
      </details>
    </form>
  </Card>
</template>
