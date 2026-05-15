<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <section
    class="py-20 px-4 text-center"
    :style="{
      backgroundColor: config.bgColor || '#1d4ed8',
      backgroundImage: config.bgImage ? `url(${config.bgImage})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }"
  >
    <h2 class="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4">{{ config.heading }}</h2>
    <p v-if="config.subheading" class="text-gray-200 mb-8 text-lg">{{ config.subheading }}</p>
    <a
      v-if="config.btnText"
      :href="config.btnUrl || '#'"
      class="inline-block px-10 py-3 bg-white text-blue-600 rounded-lg text-lg font-semibold hover:bg-gray-100 transition shadow-lg"
    >
      {{ config.btnText }}
    </a>
  </section>
</template>
