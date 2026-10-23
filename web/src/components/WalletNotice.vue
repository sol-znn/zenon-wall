<script setup lang="ts">
import {TriangleAlertIcon} from '@lucide/vue'
import {Alert, AlertDescription} from 'nom-ui'
import {useWallet} from '@/composables/useWallet'
import {SYRIUS_EXTENSION_URL} from '@/lib/syrius'

// Why Connect Syrius (in the header) did not work, under the hero where there
// is room to say it. Nothing at all while there is nothing to say.
const {available, error} = useWallet()
</script>

<template>
  <Alert v-if="error" variant="destructive">
    <TriangleAlertIcon />
    <AlertDescription class="break-words">
      {{ error }}
      <a
        v-if="!available"
        :href="SYRIUS_EXTENSION_URL"
        target="_blank"
        rel="noreferrer"
        class="underline underline-offset-4"
        >Get Syrius</a
      >
    </AlertDescription>
  </Alert>
</template>
