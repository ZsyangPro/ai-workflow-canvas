<template>
  <div
    ref="nodeRoot"
    class="relative rounded-xl border transition-all duration-200 shadow-lg"
    :class="selected || hover
      ? 'shadow-violet-500/20 border-violet-500/60'
      : 'border-zinc-700/60 shadow-black/40'"
    :style="{ width: '340px', background: 'linear-gradient(145deg, #1f1f1f 0%, #1a1a1a 100%)' }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-700/40">
      <Video class="w-4 h-4 text-violet-400" :size="16" />
      <span class="text-xs font-medium text-zinc-200 tracking-wide uppercase flex-1">视频生成</span>
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
            {{ i === 0 ? '首帧' : `图${i + 1}` }}
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
          :is="isZlHub ? Zap : Video"
          class="w-5 h-5"
          :class="isZlHub ? 'text-purple-400' : 'text-amber-400'"
          :size="20"
        />
        <div class="flex-1 min-w-0">
          <div class="text-sm text-zinc-200 truncate">{{ selectedModel?.name || '选择模型...' }}</div>
          <div v-if="selectedModel?.description" class="text-[10px] text-[#666666] truncate">{{ selectedModel.description }}</div>
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
        <span class="flex-1">{{ selectedDuration }}s · {{ selectedRatio }} · {{ selectedResolution }}</span>
        <span v-if="enableAudio" class="text-violet-400 text-[10px]">音频</span>
        <ChevronRight :size="12" class="text-[#666666]" />
      </div>

      <!-- Generate button -->
      <button
        :disabled="!canGenerate"
        @click="handleGenerate"
        class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
        :class="loading
          ? 'bg-violet-500/30 text-violet-300 cursor-wait'
          : canGenerate
            ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 hover:text-violet-300 active:scale-[0.98] border border-violet-500/30 cursor-pointer'
            : 'bg-[#252525] text-[#666666] border border-[#333333] cursor-not-allowed'"
      >
        <Loader2 v-if="loading" class="w-4 h-4 animate-spin" :size="16" />
        <Play v-else class="w-4 h-4" :size="16" />
        <template v-if="loading && progress > 0">生成中... {{ progress }}%</template>
        <template v-else-if="loading">提交中...</template>
        <template v-else-if="credits === 0 && selectedModelId">算力不足</template>
        <template v-else>{{ costPerOp }}&nbsp;&nbsp;生成视频</template>
      </button>

      <!-- Progress bar -->
      <div v-if="taskStatus === 'running'" class="w-full bg-[#252525] rounded-full h-1.5 overflow-hidden border border-[#333333]">
        <div
          class="bg-violet-500 h-full rounded-full transition-all duration-1000"
          :style="{ width: progress + '%' }"
        />
      </div>

      <!-- Video result -->
      <div
        v-if="videoUrl && taskStatus === 'succeeded'"
        class="w-full rounded-lg overflow-hidden border border-zinc-700/30 relative group/video"
        :style="{ minHeight: '120px', background: 'rgba(255,255,255,0.03)' }"
      >
        <video :src="videoUrl" controls class="w-full rounded-lg" preload="metadata" />
      </div>

      <!-- Empty placeholder -->
      <div
        v-else-if="!videoUrl && !loading"
        class="w-full rounded-lg flex flex-col items-center justify-center gap-2 text-zinc-600 py-8 border border-zinc-700/30"
        :style="{ minHeight: '120px', background: 'rgba(255,255,255,0.03)' }"
      >
        <Video class="w-10 h-10" :size="40" />
        <span class="text-xs">等待生成</span>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
        {{ error }}
      </div>
    </div>

    <Handle type="target" :position="Position.Left"
      class="!w-3 !h-3 !bg-violet-500 !border-2 !border-zinc-800 !left-[-6px] hover:!bg-violet-300 transition-colors"
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
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] cursor-pointer transition-colors min-w-[220px]"
        >
          <component
            :is="m.provider === 'zlhub' ? Zap : Video"
            class="w-5 h-5 shrink-0"
            :class="m.provider === 'zlhub' ? 'text-purple-400' : 'text-amber-400'"
            :size="20"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-zinc-200">{{ m.name }}</div>
            <div v-if="m.description" class="text-[10px] text-[#666666]">{{ m.description }}</div>
          </div>
          <div
            class="w-2.5 h-2.5 rounded-full shrink-0"
            :class="m.id === selectedModelId ? 'bg-violet-500' : 'bg-[#444444]'"
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
      <div class="px-4 pb-3 flex flex-col gap-3 min-w-[200px]">
        <!-- Duration -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#666666] uppercase tracking-wide">时长</span>
          <div class="flex gap-1.5">
            <button
              v-for="d in [3, 5, 8, 10, 15]"
              :key="d"
              @click="selectedDuration = d"
              class="px-3 py-1.5 rounded text-xs transition-colors"
              :class="selectedDuration === d
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-[#252525] text-[#9CA3AF] border border-[#333333] hover:text-zinc-300 cursor-pointer'"
            >{{ d }}s</button>
          </div>
        </div>
        <!-- Ratio -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#666666] uppercase tracking-wide">比例</span>
          <div class="flex gap-1.5">
            <button
              v-for="r in ['16:9', '9:16', '1:1']"
              :key="r"
              @click="selectedRatio = r"
              class="px-3 py-1.5 rounded text-xs transition-colors"
              :class="selectedRatio === r
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-[#252525] text-[#9CA3AF] border border-[#333333] hover:text-zinc-300 cursor-pointer'"
            >{{ r }}</button>
          </div>
        </div>
        <!-- Resolution -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[#666666] uppercase tracking-wide">分辨率</span>
          <div class="flex gap-1.5">
            <button
              v-for="r in ['720p', '1080p']"
              :key="r"
              @click="selectedResolution = r"
              class="px-3 py-1.5 rounded text-xs transition-colors"
              :class="selectedResolution === r
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-[#252525] text-[#9CA3AF] border border-[#333333] hover:text-zinc-300 cursor-pointer'"
            >{{ r }}</button>
          </div>
        </div>
        <!-- Audio toggle (ZLHub only) -->
        <div v-if="isZlHub" class="flex items-center justify-between">
          <span class="text-[10px] text-[#666666] uppercase tracking-wide">音频生成</span>
          <button
            @click="enableAudio = !enableAudio"
            class="px-3 py-1.5 rounded text-xs transition-colors"
            :class="enableAudio
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'bg-[#252525] text-[#9CA3AF] border border-[#333333] hover:text-zinc-300 cursor-pointer'"
          >{{ enableAudio ? '开启' : '关闭' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import type { ComputedRef } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { Video, Play, Loader2, ChevronRight, Zap, X } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  id: string
  data?: Record<string, any>
  selected?: boolean
}>()

const { edges, findNode, removeNodes, onViewportChange } = useVueFlow()
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
const error = ref('')
const credits = ref(0)
const modelPanelOpen = ref(false)
const paramPanelOpen = ref(false)

const selectedModelId = ref<number | null>(null)
const models = ref<Array<{ id: number; name: string; provider: string; description?: string | null; modelName: string; costCredits: number }>>([])

const selectedDuration = ref(5)
const selectedRatio = ref('16:9')
const selectedResolution = ref('720p')
const enableAudio = ref(false)

const taskStatus = ref<'idle' | 'running' | 'succeeded' | 'failed'>('idle')
const progress = ref(0)
const videoUrl = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

// --- computed ---
const selectedModel = computed(() => models.value.find((m) => m.id === selectedModelId.value))
const isZlHub = computed(() => selectedModel.value?.provider === 'zlhub')
const costPerOp = computed(() => (selectedModel.value?.costCredits || 1) * selectedDuration.value)

const promptText = computed(() => {
  const incomingEdge = edges.value.find(e => e.target === props.id)
  if (!incomingEdge) return ''
  const sourceNode = findNode(incomingEdge.source)
  return sourceNode?.data?.text || ''
})
const hasPrompt = computed(() => promptText.value.length > 0)

const connectedImages = computed(() => {
  const imgs: string[] = []
  for (const e of edges.value) {
    if (e.target === props.id) {
      const src = findNode(e.source)
      if (src?.data?.images) imgs.push(...(src.data.images as string[]))
    }
  }
  return imgs
})

const canGenerate = computed(() => !loading.value && selectedModelId.value && hasPrompt.value && credits.value > 0)

// --- panel positioning ---
const modelPanelStyle = ref<Record<string, string>>({})
const paramPanelStyle = ref<Record<string, string>>({})
let viewportCleanup: (() => void) | null = null

function updatePanelPositions() {
  if (modelPanelOpen.value && modelTriggerRef.value) {
    const rect = modelTriggerRef.value.getBoundingClientRect()
    modelPanelStyle.value = { left: `${rect.right + 8}px`, top: `${rect.top}px` }
  }
  if (paramPanelOpen.value && paramTriggerRef.value) {
    const rect = paramTriggerRef.value.getBoundingClientRect()
    paramPanelStyle.value = { left: `${rect.right + 8}px`, top: `${rect.top}px` }
  }
}

// --- panel toggles ---
function toggleModelPanel() {
  modelPanelOpen.value = !modelPanelOpen.value
  paramPanelOpen.value = false
  if (modelPanelOpen.value) nextTick(updatePanelPositions)
}

function toggleParamPanel() {
  paramPanelOpen.value = !paramPanelOpen.value
  modelPanelOpen.value = false
  if (paramPanelOpen.value) nextTick(updatePanelPositions)
}

function selectModel(m: typeof models.value[0]) {
  selectedModelId.value = m.id
  modelPanelOpen.value = false
}

// --- click outside ---
function onDocumentClick(e: MouseEvent) {
  if (modelPanelOpen.value || paramPanelOpen.value) {
    const target = e.target as Node
    if (!nodeRoot.value?.contains(target)) {
      modelPanelOpen.value = false
      paramPanelOpen.value = false
    }
  }
}

// --- data fetch ---
async function fetchModels() {
  try {
    const res = await apiFetch('/api/models')
    const data = await res.json()
    const arr = (data.models as Array<Record<string, unknown>>) || []
    models.value = arr
      .filter((m: Record<string, unknown>) => m.category === 'video' && m.enabled)
      .map((m: Record<string, unknown>) => ({
        id: m.id as number,
        name: m.name as string,
        provider: m.provider as string,
        description: m.description as string | null,
        modelName: m.modelName as string,
        costCredits: (m.costCredits as number) ?? 1,
      }))
    if (models.value.length > 0 && !selectedModelId.value) {
      selectedModelId.value = models.value[0].id
    }
  } catch (e) {
    console.error('[VideoNode] fetch models:', e)
  }
}

// --- polling ---
function startPolling(tid: string) {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await apiFetch(`/api/generate-video/${tid}`)
      const data = await res.json()
      if (data.status === 'succeeded') {
        videoUrl.value = data.videoUrl
        taskStatus.value = 'succeeded'
        progress.value = 100
        stopPolling()
        refreshCredits()
      } else if (data.status === 'failed') {
        error.value = data.error || '视频生成失败'
        taskStatus.value = 'failed'
        stopPolling()
        refreshCredits()
      } else {
        progress.value = Math.min(progress.value + 3, 90)
      }
    } catch {}
  }, 3000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// --- generate ---
async function handleGenerate() {
  if (!canGenerate.value || !selectedModel.value) return
  loading.value = true
  error.value = ''
  taskStatus.value = 'idle'
  progress.value = 0
  videoUrl.value = null

  try {
    const body: Record<string, unknown> = {
      modelId: selectedModelId.value,
      canvasId: canvasId?.value,
      nodeId: props.id,
      prompt: promptText.value,
      duration: selectedDuration.value,
      aspectRatio: selectedRatio.value,
      resolution: selectedResolution.value,
      generateAudio: enableAudio.value,
    }
    if (connectedImages.value.length > 0) {
      body.firstFrameUrl = connectedImages.value[0]
      if (connectedImages.value.length > 1) body.referenceUrls = connectedImages.value.slice(1)
    }

    const res = await apiFetch('/api/generate-video', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error((data as any).error || '请求失败')

    credits.value = (data as any).credits
    taskStatus.value = 'running'
    startPolling((data as any).taskId)
  } catch (e: any) {
    error.value = e?.message || '请求失败'
    taskStatus.value = 'failed'
  } finally {
    loading.value = false
  }
}

// --- lifecycle ---
onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  viewportCleanup = onViewportChange(() => updatePanelPositions())

  if (currentUser.value) {
    credits.value = (currentUser.value as any).credits ?? 0
  }
  try {
    const res = await apiFetch('/api/auth/me')
    const data = await res.json()
    if (res.ok) credits.value = data.user?.credits ?? 0
  } catch { /* ignore */ }

  await fetchModels()

  if (props.data) {
    selectedModelId.value = props.data.modelId || selectedModelId.value
    selectedDuration.value = props.data.duration || 5
    selectedRatio.value = props.data.ratio || '16:9'
    selectedResolution.value = props.data.resolution || '720p'
    enableAudio.value = props.data.audio || false
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  viewportCleanup?.()
  stopPolling()
})

// --- persist state ---
watch([selectedModelId, selectedDuration, selectedRatio, selectedResolution, enableAudio], () => {
  if (props.data) {
    props.data.modelId = selectedModelId.value
    props.data.duration = selectedDuration.value
    props.data.ratio = selectedRatio.value
    props.data.resolution = selectedResolution.value
    props.data.audio = enableAudio.value
  }
})
</script>
