<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <section class="w-full">
    <div class="w-full overflow-hidden">
      <img
        v-if="config.images && config.images[0]"
        :src="config.images[0].url"
        :alt="config.images[0].alt || ''"
        class="w-full h-auto"
      />
    </div>
  </section>
</template>
