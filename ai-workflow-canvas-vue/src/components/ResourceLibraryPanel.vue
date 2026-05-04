<template>
  <Teleport to="body">
    <Transition name="slide">
      <div
        v-if="open"
        class="fixed right-0 top-0 h-full z-[150] flex flex-col shadow-2xl"
        :style="{ width: '360px', background: '#1a1a1a', borderLeft: '1px solid #333' }"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40 shrink-0">
          <span class="text-sm font-medium text-zinc-200">素材库</span>
          <div class="flex items-center gap-2">
            <button
              v-if="assets.length > 0"
              @click="clearAll"
              class="text-[10px] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
            >清空全部</button>
            <button
              @click="$emit('close')"
              class="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X :size="14" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-4 py-3">
          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center py-16">
            <Loader2 class="w-5 h-5 animate-spin text-zinc-500" :size="20" />
          </div>

          <!-- Error -->
          <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-16">
            <span class="text-xs text-zinc-500">{{ loadError }}</span>
            <button
              @click="fetchAssets"
              class="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >重试</button>
          </div>

          <!-- Empty -->
          <div v-else-if="assets.length === 0" class="flex flex-col items-center gap-3 py-16">
            <ImageIcon class="w-10 h-10 text-zinc-700" :size="40" />
            <span class="text-xs text-zinc-600">暂无生成素材</span>
            <span class="text-[10px] text-zinc-700">生成图片后会自动出现在这里</span>
          </div>

          <!-- Asset grid -->
          <div v-else class="grid grid-cols-3 gap-2">
            <div
              v-for="asset in assets"
              :key="asset.id"
              class="relative rounded-lg overflow-hidden border border-zinc-700/30 hover:border-zinc-500/50 transition-colors group cursor-pointer"
              :style="{ background: '#252525' }"
              @click="openLightbox(asset)"
            >
              <img
                :src="asset.localUrl"
                class="w-full h-auto object-cover"
                loading="lazy"
                :alt="asset.prompt || 'generated'"
              />
              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <p class="text-[10px] text-zinc-300 truncate leading-tight">{{ asset.prompt || '无提示词' }}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5">{{ formatTime(asset.createdAt) }}</p>
              </div>
              <!-- Actions -->
              <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  v-if="asset.nodeId"
                  @click.stop="handleLocate(asset.nodeId!)"
                  class="w-5 h-5 rounded bg-black/70 flex items-center justify-center text-zinc-300 hover:text-emerald-400 cursor-pointer"
                  title="定位节点"
                >
                  <Crosshair :size="10" />
                </button>
                <button
                  @click.stop="deleteAsset(asset.id)"
                  class="w-5 h-5 rounded bg-black/70 flex items-center justify-center text-zinc-300 hover:text-red-400 cursor-pointer"
                  title="删除"
                >
                  <Trash2 :size="10" />
                </button>
              </div>
            </div>
          </div>

          <!-- Load more -->
          <div v-if="assets.length < total" class="flex justify-center pt-3 pb-2">
            <button
              @click="loadMore"
              :disabled="loadingMore"
              class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {{ loadingMore ? '加载中...' : `加载更多 (${total - assets.length})` }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Lightbox -->
    <div
      v-if="lightboxImage"
      class="fixed inset-0 z-[250] bg-black/95 flex items-center justify-center"
      @click.self="lightboxImage = null"
      @keydown.escape="lightboxImage = null"
    >
      <button
        @click="lightboxImage = null"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors"
      >
        <X :size="20" />
      </button>
      <img
        :src="lightboxImage"
        class="max-w-[90vw] max-h-[90vh] object-contain"
        alt="preview"
      />
    </div>
    <ConfirmDialog ref="confirmRef" />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loader2, ImageIcon, X, Crosshair, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  open: boolean
  canvasId: number
  locateNode?: (nodeId: string) => void
}>()

defineEmits<{
  close: []
}>()

const { apiFetch } = useAuth()

interface AssetItem {
  id: number
  nodeId: string | null
  localUrl: string
  prompt: string | null
  modelName: string | null
  createdAt: string
}

const assets = ref<AssetItem[]>([])
const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const lightboxImage = ref<string | null>(null)
const offset = ref(0)
const PAGE_SIZE = 21

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 365) return `${days}天前`
  return `${Math.floor(days / 365)}年前`
}

async function fetchAssets(reset = true) {
  if (loading.value) return
  loading.value = true
  loadError.value = ''

  try {
    const o = reset ? 0 : offset.value
    const res = await apiFetch(`/api/assets?canvasId=${props.canvasId}&offset=${o}&limit=${PAGE_SIZE}`)
    if (res.ok) {
      const data = await res.json()
      if (reset) {
        assets.value = data.assets as AssetItem[]
        offset.value = data.assets.length
      } else {
        assets.value = [...assets.value, ...(data.assets as AssetItem[])]
        offset.value += data.assets.length
      }
      total.value = data.total as number
    } else {
      loadError.value = '加载失败'
    }
  } catch {
    loadError.value = '网络错误'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore() {
  loadingMore.value = true
  await fetchAssets(false)
}

async function deleteAsset(id: number) {
  try {
    const res = await apiFetch(`/api/assets/${id}`, { method: 'DELETE' })
    if (res.ok) {
      assets.value = assets.value.filter(a => a.id !== id)
      total.value--
    }
  } catch { /* ignore */ }
}

async function clearAll() {
  const ok = await confirmRef.value?.confirm(
    '确定清空所有素材？此操作不可撤销。',
    { title: '清空素材', okText: '清空' },
  )
  if (!ok) return
  try {
    const res = await apiFetch(`/api/assets?canvasId=${props.canvasId}`, { method: 'DELETE' })
    if (res.ok) {
      assets.value = []
      total.value = 0
      offset.value = 0
    }
  } catch { /* ignore */ }
}

function openLightbox(asset: AssetItem) {
  lightboxImage.value = asset.localUrl
}

function handleLocate(nodeId: string) {
  props.locateNode?.(nodeId)
}

// Watch canvasId changes to re-fetch
watch(() => props.canvasId, () => {
  if (props.open) {
    offset.value = 0
    fetchAssets(true)
  }
})

// Watch open state to refresh data
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    offset.value = 0
    fetchAssets(true)
  }
})
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
