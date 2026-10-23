<script setup lang="ts">
import {ref, watch} from 'vue'
import {MessageSquareIcon, MoonIcon, SunIcon} from '@lucide/vue'
import {Button, useTheme} from 'nom-ui'
import GithubMark from './GithubMark.vue'
import WalletChip from './WalletChip.vue'
import WallMark from './WallMark.vue'
import {height} from '@/lib/format'
import {wallStats} from '@/lib/stats'

const {theme, toggleTheme} = useTheme()

// The wall's count and indexer height (lib/stats.ts); a phone has room for the
// height only, and the narrowest none. A number flashes when it changes after it first appears, so a
// live update is seen.
const settled = ref(false)
watch(
  () => wallStats.indexer,
  (s, prev) => s && !prev && setTimeout(() => (settled.value = true), 0),
)

// Header icons: no hover box, the icon itself turns green.
const iconHover =
  'hover:bg-transparent dark:hover:bg-transparent hover:text-success dark:hover:text-primary'
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
    <div class="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6">
      <div class="mr-auto flex min-w-0 items-center gap-3 sm:gap-4">
        <RouterLink to="/" class="flex shrink-0 items-center gap-2.5">
          <WallMark class="size-7" />
          <!-- The mark alone on a phone: the page title says the name right below. -->
          <span
            class="hidden text-base font-bold tracking-tight text-success uppercase sm:inline dark:text-primary"
            >Zenon Wall</span
          >
        </RouterLink>
        <span
          v-if="wallStats.total !== null"
          :key="`t${wallStats.total}`"
          class="hidden items-center gap-1 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:inline-flex"
          :class="{flash: settled}"
          title="Messages"
        >
          <MessageSquareIcon class="size-3" aria-hidden="true" />{{ height(wallStats.total) }}
          <span class="sr-only">messages</span>
        </span>
      </div>

      <!-- Beside the wallet chip, so the chain's height reads with the account. -->
      <span
        v-if="wallStats.indexer"
        :key="wallStats.indexer.height"
        class="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums max-[359px]:hidden"
        :class="{flash: settled}"
        title="Indexed through momentum"
        ><span class="sr-only">indexed through momentum </span>{{ height(wallStats.indexer.height) }}</span
      >
      <WalletChip />
      <Button variant="ghost" size="icon" as-child :class="iconHover">
        <a
          href="https://github.com/sol-znn/zenon-wall"
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
          ><GithubMark class="size-[18px]"
        /></a>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :class="iconHover"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <SunIcon v-if="theme === 'dark'" />
        <MoonIcon v-else />
      </Button>
    </div>
  </header>
</template>
