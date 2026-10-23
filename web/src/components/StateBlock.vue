<script setup lang="ts">
import {TriangleAlertIcon} from '@lucide/vue'
import {Alert, AlertDescription, AlertTitle} from 'nom-ui'

defineProps<{kind: 'empty' | 'error'; title: string; message?: string}>()
</script>

<template>
  <Alert v-if="kind === 'error'" variant="destructive">
    <TriangleAlertIcon />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription v-if="message" class="font-mono text-xs break-words">{{ message }}</AlertDescription>
  </Alert>
  <div v-else class="px-6 py-16 text-center">
    <p class="text-sm text-muted-foreground">{{ title }}</p>
    <p v-if="message" class="mt-2 text-xs text-muted-foreground/80">{{ message }}</p>
    <slot />
  </div>
</template>
