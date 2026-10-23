<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
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
import {chainId, networkName} from '@/lib/env'
import {amountText} from '@/lib/format'
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
import type {AppAnswer} from '@/lib/syriusApp'

export interface Posted {
  hash: string
  message: string
  address: string
  fuel?: Fuel
}
const emit = defineEmits<{posted: [post: Posted]}>()

const {address, sending, holdSeconds, wrongChain, walletChainId, post, sendFuel, takeSendAnswer} =
  useWallet()

// What a send through the Syrius app carries away and brings back, since the
// page that asked is gone by the time it answers (lib/syriusApp.ts).
interface Resume {
  step: 'fuel' | 'post'
  message: string
  amount: string
  kind?: Fuel['kind']
  fuel?: Fuel
}

const draft = ref('')
const error = ref('')

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
// The donation or burn came back from the Syrius app and the post is next: a
// second tap, since a phone browser opens the app only from one.
const postNext = ref(false)

function posted(hash: string, message: string, fuel?: Fuel) {
  unclaimed.value = null
  postNext.value = false
  draft.value = ''
  emit('posted', {hash, message, address: address.value, fuel})
}

async function publish(message: string, amount: string, fuel?: Fuel) {
  step.value = 'post'
  const resume: Resume = {step: 'post', message, amount, fuel}
  posted(await post(message, amount, fuel?.block, resume), message, fuel)
}

function resume({context, result, error: err}: AppAnswer) {
  const c = context as Resume
  const hash = (result as {hash?: unknown} | undefined)?.hash
  draft.value = c.message
  if (typeof hash !== 'string' || !hash) {
    if (c.fuel) unclaimed.value = c.fuel
    failed(err ?? new Error('Syrius says it sent the block but reported no transaction hash.'))
  } else if (c.step === 'fuel' && c.kind) {
    unclaimed.value = {kind: c.kind, amount: c.amount, block: hash}
    postNext.value = true
  } else {
    posted(hash, c.message, c.fuel)
  }
}

onMounted(() => {
  const answer = takeSendAnswer()
  if (answer) resume(answer)
})

function failed(err: unknown) {
  // A decline keeps the draft and says nothing: nothing was sent.
  if (!(err instanceof DeclinedError)) error.value = (err as Error).message
}

async function submit() {
  if (!canSend.value || !text.value || amount.value === null) return
  error.value = ''
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
  const message = text.value
  try {
    step.value = 'fuel'
    const amt = amount.value.toString()
    const block = await sendFuel(kind, amt, {step: 'fuel', message, amount: amt, kind} satisfies Resume)
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
      <!-- The header's wallet chip shows the account and disconnects. -->
      <label for="wall-message" class="sr-only">Tag the Wall</label>
      <Textarea
        id="wall-message"
        v-model="draft"
        rows="3"
        maxlength="2048"
        placeholder="Tag the Wall"
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

      <Alert v-if="unclaimed && !sending" :class="postNext ? 'border-success/40' : 'border-warning/40'">
        <CircleCheckIcon v-if="postNext" class="!text-success" />
        <TriangleAlertIcon v-else class="!text-warning" />
        <AlertTitle
          >{{ unclaimed.kind === 'burn' ? 'Burned' : 'Donated' }}{{ postNext ? '' : ', not posted' }}</AlertTitle
        >
        <AlertDescription class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <span v-if="postNext">
            {{ amountText(unclaimed.amount, 8) }} ZNN. Now post the message naming it.
          </span>
          <span v-else>
            {{ amountText(unclaimed.amount, 8) }} ZNN
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
