<template>
  <div
    class="relative rounded-xl border transition-all duration-200 shadow-lg"
    :class="selected || hover
      ? 'shadow-cyan-500/20 border-cyan-500/60'
      : 'border-zinc-700/60 shadow-black/40'"
    :style="{ width: '340px', background: 'linear-gradient(145deg, #1f1f1f 0%, #1a1a1a 100%)' }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <div class="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-700/40">
      <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
      <span class="text-xs font-medium text-zinc-200 tracking-wide uppercase flex-1">文本输入</span>
      <button
        @click="removeNodes([props.id])"
        class="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
        :class="hover ? 'opacity-100' : 'opacity-0'"
      >
        <X :size="12" />
      </button>
    </div>

    <div class="px-4 py-3 flex flex-col gap-3">
      <!-- Image thumbnails -->
      <div v-if="localImages.length > 0" class="flex gap-2 flex-wrap">
        <div
          v-for="(img, i) in localImages"
          :key="i"
          class="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-600/50 group"
        >
          <img :src="img" class="w-full h-full object-cover" />
          <button
            @click="removeImage(i)"
            class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >x</button>
          <span class="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/60">
            图{{ i + 1 }}
          </span>
        </div>
      </div>

      <!-- Textarea with @ support -->
      <div class="relative">
        <textarea
          ref="textareaRef"
          class="nodrag w-full resize-none rounded-lg p-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors overflow-y-auto textarea-scroll"
          :style="{ background: 'rgba(255,255,255,0.04)', minHeight: '72px', maxHeight: '240px' }"
          placeholder="输入画面描述，按 @ 引用素材"
          :value="data?.text || ''"
          @input="onInput"
          @paste="onPaste"
          @keydown="onKeydown"
          @wheel.stop
        />
        <!-- @ mention popup -->
        <div
          v-if="showAtMenu"
          ref="atMenuRef"
          class="absolute bottom-full left-0 mb-1 bg-[#1e1e1e] border border-[#333333] rounded-lg shadow-xl z-20 w-48 overflow-hidden"
        >
          <div v-if="localImages.length === 0" class="px-3 py-2 text-xs text-[#666666]">
            暂无可用素材，请先粘贴图片
          </div>
          <div
            v-for="(img, i) in localImages"
            :key="'ref-' + i"
            @click="insertReference(i)"
            class="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] cursor-pointer transition-colors"
          >
            <img :src="img" class="w-8 h-8 rounded object-cover" />
            <span class="text-xs text-zinc-200">图{{ i + 1 }}</span>
          </div>
        </div>
      </div>
    </div>

    <Handle type="source" :position="Position.Right"
      class="!w-3 !h-3 !bg-cyan-500 !border-2 !border-zinc-800 !right-[-6px] hover:!bg-cyan-300 transition-colors"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { X } from 'lucide-vue-next'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const { removeNodes } = useVueFlow()
const { apiFetch } = useAuth()
const canvasId = inject<number>('canvasId', 0)

const hover = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const atMenuRef = ref<HTMLElement | null>(null)
const showAtMenu = ref(false)

// Initialize data.images if not set
if (!props.data.images) {
  props.data.images = []
}
const localImages = props.data.images as string[]

const onInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  props.data.text = target.value

  // Auto-resize
  target.style.height = 'auto'
  target.style.height = Math.min(target.scrollHeight, 240) + 'px'

  // Check for @ trigger
  const cursorPos = target.selectionStart || 0
  const textBeforeCursor = target.value.slice(0, cursorPos)
  showAtMenu.value = textBeforeCursor.endsWith('@')
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    showAtMenu.value = false
  }
}

const onPaste = async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const base64 = await fileToBase64(file)
      try {
        const res = await apiFetch('/api/assets/upload', {
          method: 'POST',
          body: JSON.stringify({ canvasId, image: base64 }),
        })
        if (res.ok) {
          const data = await res.json()
          localImages.push(data.localUrl as string)
        } else {
          localImages.push(base64)
        }
      } catch {
        localImages.push(base64)
      }
    }
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  localImages.splice(index, 1)
}

function insertReference(index: number) {
  const textarea = textareaRef.value
  if (!textarea) return

  const text = props.data.text || ''
  const cursorPos = textarea.selectionStart || text.length

  // Remove the @ that was just typed
  const beforeAt = text.slice(0, cursorPos - 1)
  const afterAt = text.slice(cursorPos)

  const refText = `@图${index + 1}`
  props.data.text = beforeAt + refText + afterAt

  showAtMenu.value = false
}

function onDocumentClick(e: MouseEvent) {
  if (showAtMenu.value && atMenuRef.value && !atMenuRef.value.contains(e.target as Node)) {
    showAtMenu.value = false
  }
}

onMounted(async () => {
  await nextTick()
  const ta = textareaRef.value
  if (ta && ta.value) {
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'
  }
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>
