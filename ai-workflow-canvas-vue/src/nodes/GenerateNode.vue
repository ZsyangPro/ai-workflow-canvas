<template>
  <div
    ref="nodeRoot"
    class="relative rounded-xl border transition-all duration-200 shadow-lg"
    :class="selected || hover
      ? 'shadow-emerald-500/20 border-emerald-500/60'
      : 'border-zinc-700/60 shadow-black/40'"
    :style="{ width: '340px', background: 'linear-gradient(145deg, #1f1f1f 0%, #1a1a1a 100%)' }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-700/40">
      <Sparkles class="w-4 h-4 text-emerald-400" :size="16" />
      <span class="text-xs font-medium text-zinc-200 tracking-wide uppercase flex-1">参考生图</span>
      <button
        @click="removeNodes([props.id])"
        class="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
        :class="hover ? 'opacity-100' : 'opacity-0'"
      >
        <X :size="12" />
      </button>
    </div>

    <div class="px-4 py-3 flex flex-col gap-3">
      <!-- Connected node thumbnails -->
      <div v-if="connectedImages.length > 0" class="flex gap-2 flex-wrap">
        <div
          v-for="(img, i) in connectedImages"
          :key="i"
          class="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-600/50 group"
        >
          <img :src="img" class="w-full h-full object-cover" />
          <span class="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/60">
            图{{ i + 1 }}
          </span>
        </div>
      </div>

      <!-- Model selector trigger -->
      <div
        ref="modelTriggerRef"
        @click="toggleModelPanel"
        class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-3 py-2.5 cursor-pointer hover:border-[#555555] transition-colors"
      >
        <component
          :is="currentModelProvider === 'seedream' ? Zap : Banana"
          class="w-5 h-5"
          :class="currentModelProvider === 'seedream' ? 'text-purple-400' : 'text-yellow-400'"
          :size="20"
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm text-zinc-200 truncate">{{ currentModelName || '选择模型...' }}</div>
          <div v-if="currentModelDesc" class="text-[10px] text-[#666666] truncate">{{ currentModelDesc }}</div>
        </div>
        <ChevronRight :size="14" class="text-[#666666]" />
      </div>

      <!-- Prompt display -->
      <div v-if="!hasPrompt" class="text-xs text-amber-400/80">
        请先在输入节点中填写提示词
      </div>
      <div
        v-else
        class="text-xs text-zinc-400 bg-[#252525] border border-[#333333] rounded-lg px-3 py-2 max-h-16 overflow-y-auto"
      >{{ promptText }}</div>

      <!-- Parameters trigger -->
      <div
        ref="paramTriggerRef"
        @click="toggleParamPanel"
        class="flex items-center gap-2 text-xs text-[#9CA3AF] bg-[#252525] border border-[#333333] rounded-lg px-3 py-2 cursor-pointer hover:border-[#555555] transition-colors"
      >
        <span class="flex-1">{{ currentRatio }} · {{ currentCount }}张 · {{ currentQuality }}</span>
        <Globe
          :size="12"
          :class="enableWebSearch ? 'text-emerald-400' : 'text-[#555555]'"
        />
        <ChevronRight :size="12" class="text-[#666666]" />
      </div>

      <!-- Generate button -->
      <button
        :disabled="!canGenerate"
        @click="handleClick"
        class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
        :class="loading
          ? 'bg-emerald-500/30 text-emerald-300 cursor-wait'
          : canGenerate
            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300 active:scale-[0.98] border border-emerald-500/30 cursor-pointer'
            : 'bg-[#252525] text-[#666666] border border-[#333333] cursor-not-allowed'"
      >
        <Loader2 v-if="loading" class="w-4 h-4 animate-spin" :size="16" />
        <Zap v-else class="w-4 h-4" :size="16" />
        <template v-if="loading && progressMessage">生成中... {{ progressMessage }}</template>
        <template v-else-if="loading">生成中...</template>
        <template v-else-if="credits === 0 && selectedModelId">算力不足</template>
        <template v-else>{{ costPerOp }}&nbsp;&nbsp;生成</template>
      </button>

      <!-- Image display — fills node width, height auto-adapts -->
      <div
        class="w-full rounded-lg flex items-center justify-center overflow-hidden border border-zinc-700/30 cursor-pointer"
        :style="{ minHeight: '120px', background: 'rgba(255,255,255,0.03)' }"
        @click="openLightbox"
      >
        <img
          v-if="currentImage"
          :src="currentImage"
          alt="generated"
          class="w-full h-auto"
        />
        <div v-else class="flex flex-col items-center gap-2 text-zinc-600 py-8">
          <ImageIcon class="w-10 h-10" :size="40" />
          <span class="text-xs">{{ loading ? (progressMessage || '正在请求模型...') : '等待生成' }}</span>
        </div>
      </div>

      <!-- Multi-image nav -->
      <div v-if="images.length > 1" class="flex items-center gap-1.5 flex-wrap">
        <button
          v-for="(img, i) in images"
          :key="i"
          @click="currentIndex = i"
          class="w-7 h-7 rounded text-xs flex items-center justify-center transition-colors"
          :class="i === currentIndex
            ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/40'
            : 'bg-[#252525] text-[#666666] border border-[#333333] hover:text-zinc-300 cursor-pointer'"
        >
          <img :src="img" class="w-5 h-5 rounded object-cover" />
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
        {{ error }}
      </div>
    </div>

    <Handle type="target" :position="Position.Left"
      class="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-800 !left-[-6px] hover:!bg-emerald-300 transition-colors"
    />
  </div>

  <!-- Teleported model selector panel -->
  <Teleport to="body">
    <div
      v-if="modelPanelOpen"
      @click.stop
      class="fixed z-[100] bg-[#1e1e1e] border border-[#333333] rounded-xl shadow-2xl overflow-hidden"
      :style="modelPanelStyle"
    >
      <div class="text-[10px] text-[#666666] px-4 pt-3 pb-2 uppercase tracking-wide">选择模型</div>
      <div class="max-h-[320px] overflow-y-auto">
        <div
          v-for="m in models"
          :key="m.id"
          @click="selectModel(m)"
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] cursor-pointer transition-colors min-w-[200px]"
        >
          <component
            :is="m.provider === 'seedream' ? Zap : Banana"
            class="w-5 h-5 shrink-0"
            :class="m.provider === 'seedream' ? 'text-purple-400' : 'text-yellow-400'"
            :size="20"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-zinc-200">{{ m.name }}</div>
            <div v-if="m.description" class="text-[10px] text-[#666666]">{{ m.description }}</div>
          </div>
          <div
            class="w-2.5 h-2.5 rounded-full shrink-0"
            :class="m.id === selectedModelId ? 'bg-emerald-500' : 'bg-[#444444]'"
          />
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Teleported parameter panel -->
  <Teleport to="body">
    <div
      v-if="paramPanelOpen"
      @click.stop
      class="fixed z-[100] bg-[#1e1e1e] border border-[#333333] rounded-xl shadow-2xl overflow-hidden"
      :style="paramPanelStyle"
    >
      <div class="text-[10px] text-[#666666] px-4 pt-3 pb-2 uppercase tracking-wide">参数配置</div>
      <div class="px-4 pb-3 flex flex-col gap-3 min-w-[240px]">
        <!-- Ratio -->
        <div>
          <div class="text-[10px] text-[#666666] mb-1.5">比例</div>
          <div class="grid grid-cols-5 gap-1">
            <button
              v-for="r in ratios"
              :key="r"
              @click="selectedRatio = r"
              class="text-[11px] py-1.5 rounded-md transition-all duration-150"
              :class="r === selectedRatio
                ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                : 'text-[#888888] hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent cursor-pointer'"
            >{{ r }}</button>
          </div>
        </div>

        <!-- Quality -->
        <div>
          <div class="text-[10px] text-[#666666] mb-1.5">画质</div>
          <div class="flex gap-1.5">
            <button
              v-for="q in availableQualities"
              :key="q"
              @click="selectedQuality = q"
              class="flex-1 text-[11px] py-1.5 rounded-md transition-all duration-150"
              :class="q === selectedQuality
                ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                : 'text-[#888888] hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent cursor-pointer'"
            >{{ qLabel(q) }}</button>
          </div>
        </div>

        <!-- Count -->
        <div v-if="supportsMultiImage">
          <div class="text-[10px] text-[#666666] mb-1.5">生成数量</div>
          <div class="flex gap-1.5">
            <button
              v-for="c in countOptions"
              :key="c"
              @click="selectedCount = c"
              class="flex-1 text-[11px] py-1.5 rounded-md transition-all duration-150"
              :class="c === selectedCount
                ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                : 'text-[#888888] hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent cursor-pointer'"
            >{{ c }}张</button>
          </div>
        </div>

        <!-- Web search -->
        <div v-if="supportsWebSearch">
          <div class="text-[10px] text-[#666666] mb-1.5">联网搜索</div>
          <div class="flex gap-1.5">
            <button
              v-for="opt in webSearchOptions"
              :key="String(opt.value)"
              @click="enableWebSearch = opt.value"
              class="flex-1 text-[11px] py-1.5 rounded-md transition-all duration-150"
              :class="opt.value === enableWebSearch
                ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/30'
                : 'text-[#888888] hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent cursor-pointer'"
            >{{ opt.label }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Lightbox -->
  <Teleport to="body">
    <div
      v-if="lightboxOpen"
      class="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
      @click.self="closeLightbox"
      @keydown.escape="closeLightbox"
    >
      <!-- Close button -->
      <button
        @click="closeLightbox"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <X :size="20" />
      </button>

      <!-- Image counter -->
      <div v-if="images.length > 1" class="absolute top-4 left-4 text-sm text-white/60 z-10">
        {{ lightboxIndex + 1 }} / {{ images.length }}
      </div>

      <!-- Prev button -->
      <button
        v-if="images.length > 1"
        @click="lightboxIndex = (lightboxIndex - 1 + images.length) % images.length"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <ChevronLeft :size="20" />
      </button>

      <!-- Image -->
      <img
        :src="images[lightboxIndex]"
        class="max-w-[90vw] max-h-[90vh] object-contain"
        alt="preview"
      />

      <!-- Next button -->
      <button
        v-if="images.length > 1"
        @click="lightboxIndex = (lightboxIndex + 1) % images.length"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <ChevronRight :size="20" />
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import type { ComputedRef } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Sparkles, Loader2, ImageIcon, ChevronRight, ChevronLeft, Globe, Zap, Banana, X } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  data?: Record<string, any>
  selected?: boolean
}>()

const { edges, findNode, removeNodes, onViewportChange, updateNodeData } = useVueFlow()
const { apiFetch, currentUser } = useAuth()
const canvasId = inject<ComputedRef<number>>('canvasId')
const refreshCredits = inject<() => Promise<number>>('refreshCredits', async () => 0)

// --- refs ---
const nodeRoot = ref<HTMLElement | null>(null)
const modelTriggerRef = ref<HTMLElement | null>(null)
const paramTriggerRef = ref<HTMLElement | null>(null)

// --- state ---
const hover = ref(false)
const loading = ref(false)
const images = ref<string[]>([])
const currentIndex = ref(0)
const error = ref('')
const credits = ref(0)
const modelPanelOpen = ref(false)
const paramPanelOpen = ref(false)
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const selectedModelId = ref<number | null>(null)
const models = ref<Array<{ id: number; name: string; provider: string; description?: string | null; modelName: string; costCredits: number }>>([])

const selectedRatio = ref('1:1')
const selectedQuality = ref('2K')
const selectedCount = ref(1)
const enableWebSearch = ref(false)

const ratios = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9']
const countOptions = [1, 4, 9]
const webSearchOptions = [
  { label: '开启', value: true },
  { label: '关闭', value: false },
]

const modelQualities: Record<string, string[]> = {
  'doubao-seedream-5-0-260128': ['2K', '3K', '4K'],
  'doubao-seedream-5-0-lite-260128': ['2K', '3K', '4K'],
  'doubao-seedream-4-5-251128': ['2K', '4K'],
  'doubao-seedream-4-0-250828': ['1K', '2K', '4K'],
}

// --- panel positioning ---
const modelPanelStyle = ref<Record<string, string>>({})
const paramPanelStyle = ref<Record<string, string>>({})

function updatePanelPositions() {
  if (modelPanelOpen.value && modelTriggerRef.value) {
    const rect = modelTriggerRef.value.getBoundingClientRect()
    modelPanelStyle.value = {
      left: `${rect.right + 8}px`,
      top: `${rect.top}px`,
    }
  }
  if (paramPanelOpen.value && paramTriggerRef.value) {
    const rect = paramTriggerRef.value.getBoundingClientRect()
    paramPanelStyle.value = {
      left: `${rect.right + 8}px`,
      top: `${rect.top}px`,
    }
  }
}

// Reposition panels on viewport change or window resize (no polling)
let viewportCleanup: { off: () => void } | null = null

function startPosTracking() {
  if (viewportCleanup) return
  viewportCleanup = onViewportChange(() => updatePanelPositions())
  window.addEventListener('resize', updatePanelPositions)
}

function stopPosTracking() {
  if (viewportCleanup) {
    viewportCleanup.off()
    viewportCleanup = null
  }
  window.removeEventListener('resize', updatePanelPositions)
}

onUnmounted(() => stopPosTracking())

// --- toggle panels ---
function toggleModelPanel() {
  modelPanelOpen.value = !modelPanelOpen.value
  paramPanelOpen.value = false
  if (modelPanelOpen.value) {
    startPosTracking()
    nextTick(updatePanelPositions)
  } else {
    stopPosTracking()
  }
}

function toggleParamPanel() {
  paramPanelOpen.value = !paramPanelOpen.value
  modelPanelOpen.value = false
  if (paramPanelOpen.value) {
    startPosTracking()
    nextTick(updatePanelPositions)
  } else {
    stopPosTracking()
  }
}

function closeAllPanels() {
  modelPanelOpen.value = false
  paramPanelOpen.value = false
  stopPosTracking()
}

// --- computed ---
const currentImage = computed(() => images.value[currentIndex.value] || null)

const promptText = computed(() => {
  const incomingEdge = edges.value.find(e => e.target === props.id)
  if (!incomingEdge) return ''
  const sourceNode = findNode(incomingEdge.source)
  return sourceNode?.data?.text || ''
})

const hasPrompt = computed(() => promptText.value.length > 0)

const selectedModel = computed(() => models.value.find(m => m.id === selectedModelId.value))
const currentModelName = computed(() => selectedModel.value?.name || '')
const currentModelDesc = computed(() => selectedModel.value?.description || '')
const currentModelProvider = computed(() => selectedModel.value?.provider || '')
const costPerOp = computed(() => {
  const cost = selectedModel.value?.costCredits ?? 1
  const count = supportsMultiImage.value ? selectedCount.value : 1
  return cost * count
})

const connectedImages = computed(() => {
  const imgs: string[] = []
  for (const e of edges.value) {
    if (e.target === props.id) {
      const src = findNode(e.source)
      if (src?.data?.images) {
        imgs.push(...(src.data.images as string[]))
      }
    }
  }
  return imgs
})

const supportsMultiImage = computed(() => currentModelProvider.value === 'seedream')
const supportsWebSearch = computed(() => currentModelProvider.value === 'seedream')

const availableQualities = computed(() => {
  if (currentModelProvider.value !== 'seedream') return ['1K', '2K']
  const mn = selectedModel.value?.modelName as string
  if (mn && modelQualities[mn]) return modelQualities[mn]
  return ['1K', '2K', '4K']
})

const currentRatio = computed(() => selectedRatio.value)
const currentCount = computed(() => selectedCount.value)
const currentQuality = computed(() => selectedQuality.value)

const canGenerate = computed(() => {
  return !loading.value && selectedModelId.value && hasPrompt.value && credits.value > 0
})

// --- methods ---
function qLabel(q: string): string {
  const labels: Record<string, string> = { '1K': '1K标清', '2K': '2K高清', '3K': '3K', '4K': '4K超清' }
  return labels[q] || q
}

function ratioToSize(ratio: string, quality: string): string {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return '2048x2048'
  const mpMap: Record<string, number> = { '1K': 1, '2K': 4, '3K': 9, '4K': 16 }
  const targetMp = mpMap[quality] || 4
  const aspectRatio = w / h
  const totalPixels = targetMp * 1_000_000
  const height = Math.round(Math.sqrt(totalPixels / aspectRatio))
  const width = Math.round(height * aspectRatio)
  const rnd = (v: number) => Math.round(v / 16) * 16
  return `${rnd(width)}x${rnd(height)}`
}

function selectModel(m: (typeof models.value)[0]) {
  selectedModelId.value = m.id
  const patch: Record<string, unknown> = { selectedModelId: m.id }
  modelPanelOpen.value = false
  stopPosTracking()
  const mn = m.modelName as string
  if (mn && modelQualities[mn]) {
    selectedQuality.value = modelQualities[mn][0]
    patch.selectedQuality = modelQualities[mn][0]
  }
  if (m.provider === 'sophnet') {
    selectedCount.value = 1
    enableWebSearch.value = false
    patch.selectedCount = 1
    patch.enableWebSearch = false
  }
  updateNodeData(props.id, { ...props.data, ...patch })
}

function openLightbox() {
  if (!currentImage.value) return
  lightboxIndex.value = currentIndex.value
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

// --- keyboard ---
function onKeydown(e: KeyboardEvent) {
  if (lightboxOpen.value) {
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft' && images.value.length > 1) {
      lightboxIndex.value = (lightboxIndex.value - 1 + images.value.length) % images.value.length
    }
    if (e.key === 'ArrowRight' && images.value.length > 1) {
      lightboxIndex.value = (lightboxIndex.value + 1) % images.value.length
    }
    return
  }
  if (e.key === 'Escape') {
    closeAllPanels()
  }
}

// Click outside panels to close
function onDocumentClick(e: MouseEvent) {
  if (modelPanelOpen.value || paramPanelOpen.value) {
    const target = e.target as HTMLElement
    if (!nodeRoot.value?.contains(target)) {
      closeAllPanels()
    }
  }
}

// --- init ---
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocumentClick)

  if (currentUser.value) {
    credits.value = (currentUser.value as any).credits ?? 0
  }
  try {
    const res = await apiFetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      credits.value = data.user?.credits ?? 0
    }
  } catch { /* ignore */ }

  try {
    const res = await apiFetch('/api/models')
    const data = await res.json()
    if (res.ok) {
      const all = (data.models as Array<Record<string, unknown>>)
        .filter((m: Record<string, unknown>) => m.category === 'image' && m.enabled)
      models.value = all.map((m: Record<string, unknown>) => ({
        id: m.id as number,
        name: m.name as string,
        provider: m.provider as string,
        description: m.description as string | null,
        modelName: m.modelName as string,
        costCredits: (m.costCredits as number) ?? 1,
      }))
    }
  } catch { /* silent */ }

  // 从 node.data 恢复已持久化的图片
  if (props.data?.images?.length) {
    images.value = props.data.images as string[]
  }

  // 从 node.data 恢复模型选择等状态
  if (props.data?.selectedModelId) {
    selectedModelId.value = props.data.selectedModelId as number
  }
  if (props.data?.selectedRatio) {
    selectedRatio.value = props.data.selectedRatio as string
  }
  if (props.data?.selectedQuality) {
    selectedQuality.value = props.data.selectedQuality as string
  }
  if (props.data?.selectedCount) {
    selectedCount.value = props.data.selectedCount as number
  }
  if (props.data?.enableWebSearch !== undefined) {
    enableWebSearch.value = props.data.enableWebSearch as boolean
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocumentClick)
})

watch(availableQualities, (avail) => {
  if (!avail.includes(selectedQuality.value)) {
    selectedQuality.value = avail[0]
  }
})

// Persist parameter changes to node.data
watch(selectedRatio, (val) => { if (props.data) props.data.selectedRatio = val })
watch(selectedQuality, (val) => { if (props.data) props.data.selectedQuality = val })
watch(selectedCount, (val) => { if (props.data) props.data.selectedCount = val })
watch(enableWebSearch, (val) => { if (props.data) props.data.enableWebSearch = val })

// --- generate ---
const progressMessage = ref('')

const handleClick = async () => {
  if (!canGenerate.value) return
  loading.value = true
  images.value = []
  if (props.data?.images) props.data.images.length = 0
  currentIndex.value = 0
  error.value = ''

  const count = supportsMultiImage.value ? selectedCount.value : 1

  // Pre-check credits
  if (credits.value < costPerOp.value) {
    error.value = `算力不足，需要 ${costPerOp.value} 算力，当前 ${credits.value} 算力`
    loading.value = false
    return
  }

  const size = ratioToSize(selectedRatio.value, selectedQuality.value)
  const baseBody: Record<string, unknown> = {
    modelId: selectedModelId.value,
    canvasId: canvasId?.value,
    prompt: promptText.value,
    size,
    enable_web_search: enableWebSearch.value,
    nodeId: props.id,
  }
  if (connectedImages.value.length > 0) {
    baseBody.images = connectedImages.value
  }

  // Fire N parallel requests, each generates exactly 1 image
  const requests: Promise<{ url?: string; error?: string }>[] = []
  for (let i = 0; i < count; i++) {
    requests.push(
      apiFetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify(baseBody),
      }).then(async (res) => {
        const data = await res.json()
        if (res.ok && data.images?.length) {
          return { url: data.images[0].url as string }
        } else if (res.status === 402) {
          return { error: '算力不足' }
        } else {
          return { error: (data as Record<string, string>).error || '生成失败' }
        }
      }).catch(() => ({ error: '请求失败' }))
    )
  }

  // Collect results one at a time as they complete
  for (const req of requests) {
    const result = await req
    if (result.url) {
      images.value = [...images.value, result.url]
      // 写入 node.data 以随 canvas 持久化
      const existingImages = (props.data?.images as string[] | undefined) || []
      updateNodeData(props.id, { ...props.data, images: [...existingImages, result.url] })
      progressMessage.value = `已生成 ${images.value.length}/${count} 张...`
    }
  }

  // Refresh credits
  credits.value = await refreshCredits()

  if (images.value.length === 0) {
    error.value = '所有请求均失败'
  } else if (images.value.length < count) {
    error.value = `仅成功生成 ${images.value.length}/${count} 张`
  }

  loading.value = false
  progressMessage.value = ''
}
</script>
