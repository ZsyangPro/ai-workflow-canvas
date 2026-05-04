<template>
  <div class="w-full h-screen flex items-center justify-center" style="background: #121212">
    <Loader2 class="w-6 h-6 animate-spin text-zinc-500" :size="24" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2 } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { apiFetch } = useAuth()

async function goToNewCanvas() {
  try {
    const res = await apiFetch('/api/canvas', { method: 'POST', body: JSON.stringify({}) })
    if (res.ok) {
      const data = await res.json()
      await router.replace(`/canvas/${data.canvas.id}`)
    }
  } catch (e) {
    console.error('Failed to create canvas:', e)
  }
}

onMounted(() => {
  goToNewCanvas()
})
</script>
