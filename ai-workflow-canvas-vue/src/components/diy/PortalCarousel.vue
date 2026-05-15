<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps<{ config: Record<string, any> }>()

const images = computed(() => (props.config.images || []).filter((img: any) => img.url))
const current = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function next() {
  if (images.value.length < 2) return
  current.value = (current.value + 1) % images.value.length
}
function prev() {
  if (images.value.length < 2) return
  current.value = (current.value - 1 + images.value.length) % images.value.length
}
function goTo(i: number) {
  current.value = i
}

function startTimer() {
  stopTimer()
  const interval = props.config.interval || 4000
  if (images.value.length > 1) {
    timer = setInterval(next, interval)
  }
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

onMounted(startTimer)
onUnmounted(stopTimer)
</script>

<template>
  <section v-if="images.length > 0" class="relative w-full overflow-hidden" @mouseenter="stopTimer" @mouseleave="startTimer">
    <!-- 图片轨道 -->
    <div class="flex transition-transform duration-500 ease-out" :style="{ transform: `translateX(-${current * 100}%)` }">
      <div v-for="(img, i) in images" :key="i" class="w-full flex-shrink-0">
        <img :src="img.url" :alt="img.alt || ''" class="w-full h-auto" />
      </div>
    </div>

    <!-- 左右箭头 -->
    <button v-if="images.length > 1" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur flex items-center justify-center text-white text-xl transition" @click="prev">‹</button>
    <button v-if="images.length > 1" class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur flex items-center justify-center text-white text-xl transition" @click="next">›</button>

    <!-- 底部 dots -->
    <div v-if="images.length > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
      <button
        v-for="(img, i) in images"
        :key="i"
        class="w-2.5 h-2.5 rounded-full transition"
        :class="i === current ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/70'"
        @click="goTo(i)"
      />
    </div>
  </section>
</template>
