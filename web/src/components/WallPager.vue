<script setup lang="ts">
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from 'nom-ui'

defineProps<{page: number; total: number; pageSize: number}>()
const emit = defineEmits<{'update:page': [page: number]}>()
</script>

<template>
  <Pagination
    v-slot="{page: current}"
    :page="page"
    :total="total"
    :items-per-page="pageSize"
    :sibling-count="1"
    show-edges
    @update:page="emit('update:page', $event)"
  >
    <PaginationContent v-slot="{items}">
      <PaginationPrevious />
      <template v-for="(item, i) in items" :key="i">
        <PaginationItem
          v-if="item.type === 'page'"
          :value="item.value"
          :is-active="item.value === current"
          class="font-mono tabular-nums"
        >
          {{ item.value }}
        </PaginationItem>
        <PaginationEllipsis v-else />
      </template>
      <PaginationNext />
    </PaginationContent>
  </Pagination>
</template>
