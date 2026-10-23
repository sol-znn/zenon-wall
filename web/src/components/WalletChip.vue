<script setup lang="ts">
import {computed} from 'vue'
import {LogOutIcon, WalletIcon} from '@lucide/vue'
import {Address, Button, Spinner} from 'nom-ui'
import {useWallet} from '@/composables/useWallet'

// The header's wallet slot: Connect Syrius until connected, then the account.
// Offered whether or not the extension was detected: detection races its
// content script, and hiding the button on losing that race tells somebody they
// have nothing installed while it sits in their toolbar. What went wrong, if
// anything, is shown on the page (WalletNotice.vue).
const {connected, address, wrongChain, connecting, holdSeconds, connect, disconnect} = useWallet()

const label = computed(() =>
  !connecting.value ? 'Connect Syrius' : holdSeconds.value > 0 ? `Paused, ${holdSeconds.value} s` : 'Waiting…',
)
</script>

<template>
  <Button v-if="!connected" size="sm" :disabled="connecting" @click="connect">
    <Spinner v-if="connecting" />
    <WalletIcon v-else />
    <span class="tabular-nums">{{ label }}</span>
  </Button>
  <div
    v-else
    class="flex shrink-0 items-center gap-1 rounded-full border border-border py-0.5 pr-0.5 pl-2.5 whitespace-nowrap"
    :class="{'border-destructive/50': wrongChain}"
  >
    <span
      class="size-1.5 rounded-full"
      :class="wrongChain ? 'bg-destructive' : 'bg-success'"
      aria-hidden="true"
    />
    <Address :address="address" :start="6" :end="4" :copy="false" class="text-xs" />
    <span class="sr-only">{{ wrongChain ? 'Wrong network' : 'Connected' }}</span>
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-6 rounded-full hover:bg-transparent hover:text-success dark:hover:bg-transparent dark:hover:text-primary"
      aria-label="Disconnect Syrius"
      title="Disconnect"
      @click="disconnect"
    >
      <LogOutIcon class="!size-3.5" />
    </Button>
  </div>
</template>
