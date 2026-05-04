<template>
  <div
    class="absolute z-50 flex flex-col bg-[#1e1e1e]/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden w-48"
    :style="{ top: `${clampedY}px`, left: `${clampedX}px` }"
  >
    <div class="px-3 py-2 text-xs text-[#666666] font-medium">
      添加节点
    </div>

    <div
      @click="$emit('addNode', 'inputNode')"
      class="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 cursor-pointer transition-colors"
    >
      <Type :size="16" class="text-gray-400" />
      <span class="text-sm text-gray-200">文本</span>
    </div>

    <div
      @click="$emit('addNode', 'generateNode')"
      class="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 cursor-pointer transition-colors"
    >
      <Sparkles :size="16" class="text-gray-400" />
      <span class="text-sm text-gray-200">AI 生图</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Type, Sparkles } from 'lucide-vue-next'

const props = defineProps<{
  x: number
  y: number
}>()

defineEmits<{
  addNode: [type: 'inputNode' | 'generateNode']
}>()

const MENU_W = 192 // w-48
const MENU_H = 140 // approx height

const clampedX = computed(() => Math.min(props.x, window.innerWidth - MENU_W - 8))
const clampedY = computed(() => Math.min(props.y, window.innerHeight - MENU_H - 8))
</script>
