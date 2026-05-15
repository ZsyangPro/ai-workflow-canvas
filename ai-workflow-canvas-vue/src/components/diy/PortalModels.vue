<script setup lang="ts">
import { useRouter } from 'vue-router'

defineProps<{ config: Record<string, any> }>()

const router = useRouter()

function handleModelClick(model: any) {
  const routes: Record<string, string> = {
    image: '/canvas/new',
    video: '/canvas/new',
  }
  const path = routes[model.category] || '/'
  sessionStorage.setItem('selected_model', JSON.stringify({ id: model.id, name: model.name }))
  router.push(path)
}
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
        v-for="model in config.models"
        :key="model.id"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-blue-200 transition cursor-pointer"
        @click="handleModelClick(model)"
      >
        <span
          class="inline-block px-2 py-1 text-xs rounded-full mb-3"
          :class="model.category === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'"
        >
          {{ model.category === 'video' ? '视频生成' : model.category === 'audio' ? '音频生成' : '图片生成' }}
        </span>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ model.name }}</h3>
        <p class="text-sm text-gray-500">{{ model.description || '点击开始创作' }}</p>
      </div>
    </div>
    <div v-if="!config.models || config.models.length === 0" class="text-center text-gray-400 py-12">
      暂无可用模型
    </div>
  </section>
</template>
