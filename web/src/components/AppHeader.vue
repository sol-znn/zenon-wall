<script setup lang="ts">
import {MoonIcon, SunIcon} from '@lucide/vue'
import {Button, useTheme} from 'nom-ui'
import GithubMark from './GithubMark.vue'
import WalletChip from './WalletChip.vue'
import WallMark from './WallMark.vue'

const {theme, toggleTheme} = useTheme()

// Header icons: no hover box, the icon itself turns green.
const iconHover =
  'hover:bg-transparent dark:hover:bg-transparent hover:text-success dark:hover:text-primary'
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
    <div class="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6">
      <RouterLink to="/" class="mr-auto flex shrink-0 items-center gap-2.5">
        <WallMark class="size-7" />
        <!-- The mark alone on a phone: the page title says the name right below. -->
        <span class="hidden text-base font-bold tracking-tight text-success uppercase sm:inline dark:text-primary"
          >Zenon Wall</span
        >
      </RouterLink>

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
