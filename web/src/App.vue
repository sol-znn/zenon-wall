<script setup lang="ts">
import {TooltipProvider} from 'nom-ui'
import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import BrickWall from '@/components/BrickWall.vue'
</script>

<template>
  <TooltipProvider :delay-duration="120" :skip-delay-duration="300">
    <div class="isolate flex min-h-screen flex-col bg-background text-foreground">
      <BrickWall />
      <AppHeader />
      <main class="mx-auto w-full max-w-2xl min-w-0 flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <RouterView />
      </main>
      <AppFooter />
    </div>
  </TooltipProvider>
</template>
