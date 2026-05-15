<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <section class="py-16 px-4" :style="{ backgroundColor: config.bgColor || '#f8fafc' }">
    <div class="max-w-5xl mx-auto flex flex-wrap justify-center gap-12 md:gap-20">
      <div v-for="(item, i) in config.items" :key="i" class="text-center">
        <div class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-2">
          {{ item.value }}
        </div>
        <div class="text-sm md:text-base text-gray-500">{{ item.label }}</div>
      </div>
    </div>
  </section>
</template>
