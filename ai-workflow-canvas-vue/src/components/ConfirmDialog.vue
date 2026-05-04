<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="cancel"
    >
      <div class="w-80 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-6">
        <h2 class="text-lg font-semibold text-zinc-200 mb-2">{{ title }}</h2>
        <p class="text-sm text-[#9CA3AF] mb-5">{{ message }}</p>
        <div class="flex gap-3">
          <button
            @click="cancel"
            class="flex-1 py-2.5 rounded-lg text-sm text-[#9CA3AF] hover:text-zinc-200 border border-[#333333] hover:border-[#555555] transition-all cursor-pointer"
          >取消</button>
          <button
            @click="ok"
            class="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all duration-200 cursor-pointer active:scale-[0.98]"
          >{{ okText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const title = ref('')
const message = ref('')
const okText = ref('确认')
let resolvePromise: ((value: boolean) => void) | null = null

function confirm(msg: string, opts?: { title?: string; okText?: string }): Promise<boolean> {
  title.value = opts?.title || '确认操作'
  message.value = msg
  okText.value = opts?.okText || '确认'
  visible.value = true
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function ok() {
  visible.value = false
  resolvePromise?.(true)
  resolvePromise = null
}

function cancel() {
  visible.value = false
  resolvePromise?.(false)
  resolvePromise = null
}

defineExpose({ confirm })
</script>
