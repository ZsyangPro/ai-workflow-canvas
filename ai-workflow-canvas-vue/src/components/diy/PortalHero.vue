<script setup lang="ts">
defineProps<{ config: Record<string, any> }>()
</script>

<template>
  <section
    class="relative flex items-center min-h-[50vh]"
    :style="{ backgroundColor: config.bgColor || '#1e293b' }"
  >
    <!-- 背景图：不裁剪，宽度撑满，高度自适应 -->
    <img
      v-if="config.bgImage"
      :src="config.bgImage"
      class="absolute inset-0 w-full h-full object-cover"
      alt=""
    />
    <!-- 暗色蒙层 -->
    <div v-if="config.bgImage" class="absolute inset-0 bg-black/50" />
    <!-- 文字内容 -->
    <div class="relative max-w-4xl mx-auto z-10 py-20 px-4" :class="config.alignment === 'left' ? 'text-left' : 'text-center'">
      <h1 class="text-3xl md:text-4xl lg:text-6xl font-bold text-white mb-4 leading-tight">
        {{ config.heading }}
      </h1>
      <p v-if="config.subheading" class="text-base md:text-lg lg:text-xl text-gray-200 mb-8 max-w-2xl" :class="config.alignment === 'left' ? '' : 'mx-auto'">
        {{ config.subheading }}
      </p>
      <a
        v-if="config.ctaText"
        :href="config.ctaUrl || '#'"
        class="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition shadow-lg"
      >
        {{ config.ctaText }}
      </a>
    </div>
  </section>
</template>
