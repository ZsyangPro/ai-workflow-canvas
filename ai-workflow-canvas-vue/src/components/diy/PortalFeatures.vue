<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <section class="py-16 px-4 max-w-7xl mx-auto">
    <h2 v-if="config.title" class="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
      {{ config.title }}
    </h2>
    <div
      class="grid gap-6"
      :class="{
        'grid-cols-1 sm:grid-cols-2': (config.columns || 3) === 2,
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3': (config.columns || 3) === 3,
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4': (config.columns || 3) === 4,
      }"
    >
      <div
        v-for="(item, i) in config.items"
        :key="i"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition cursor-pointer group"
        @click="item.link && (item.link.startsWith('http') ? window.open(item.link) : $router?.push(item.link))"
      >
        <img
          v-if="item.image"
          :src="item.image"
          :alt="item.title"
          class="w-12 h-12 rounded-lg object-cover mb-4"
        />
        <div
          v-else-if="item.icon"
          class="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-2xl mb-4 group-hover:bg-blue-100 transition"
        >
          {{ item.icon }}
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ item.title }}</h3>
        <p v-if="item.desc" class="text-sm text-gray-500">{{ item.desc }}</p>
      </div>
    </div>
  </section>
</template>
