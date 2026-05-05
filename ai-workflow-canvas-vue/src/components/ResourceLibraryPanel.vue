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
          <div class="flex items-center gap-2">
            <button
              v-if="trashMode"
              @click="trashMode = false; fetchAssets(true)"
              class="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >← 返回收藏</button>
            <span class="text-sm font-medium text-zinc-200">{{ trashMode ? '垃圾箱' : '我的收藏' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!trashMode"
              @click="trashMode = true; fetchTrash(true)"
              class="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >垃圾箱</button>
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
              @click="fetchAssets()"
              class="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >重试</button>
          </div>

          <!-- Empty -->
          <div v-else-if="assets.length === 0 && !trashMode" class="flex flex-col items-center gap-3 py-16">
            <ImageIcon class="w-10 h-10 text-zinc-700" :size="40" />
            <span class="text-xs text-zinc-600">暂无收藏素材</span>
            <span class="text-[10px] text-zinc-700">生成图片后点击 ☆ 即可收藏</span>
          </div>
          <div v-else-if="assets.length === 0 && trashMode" class="flex flex-col items-center gap-3 py-16">
            <Trash2 class="w-10 h-10 text-zinc-700" :size="40" />
            <span class="text-xs text-zinc-600">垃圾箱为空</span>
          </div>

          <!-- Trash notice -->
          <div v-if="trashMode && assets.length > 0" class="text-[10px] text-zinc-500 px-1 pb-2">
            垃圾箱内素材 7 天后自动清理
          </div>

          <!-- Asset grid -->
          <div v-if="!trashMode && assets.length > 0" class="grid grid-cols-3 gap-1">
            <div
              v-for="asset in assets"
              :key="asset.id"
              class="relative overflow-hidden group cursor-pointer aspect-square"
              :style="{ background: '#252525' }"
              @click="openLightbox(asset)"
            >
              <img
                :src="asset.localUrl"
                class="w-full h-full object-cover"
                loading="lazy"
                :alt="asset.prompt || 'generated'"
              />
              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <p class="text-[10px] text-zinc-300 truncate leading-tight">{{ asset.prompt || '无提示词' }}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5">{{ asset.createdAt ? formatTime(asset.createdAt) : '' }}</p>
              </div>
              <!-- Actions -->
              <div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  @click.stop="downloadAsset(asset)"
                  class="w-5 h-5 rounded bg-black/70 flex items-center justify-center text-zinc-300 hover:text-emerald-400 cursor-pointer"
                  title="下载"
                >
                  <Download :size="10" />
                </button>
                <button
                  v-if="asset.nodeId && asset.canvasId != null"
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

          <!-- Trash grid -->
          <div v-else-if="trashMode && assets.length > 0" class="grid grid-cols-3 gap-1">
            <div
              v-for="asset in assets"
              :key="asset.id"
              class="relative overflow-hidden group aspect-square"
              :style="{ background: '#252525' }"
            >
              <img
                :src="asset.localUrl"
                class="w-full h-full object-cover opacity-50"
                loading="lazy"
                :alt="asset.prompt || 'generated'"
              />
              <!-- Expiry badge -->
              <div class="absolute top-1 left-1 text-[9px] text-zinc-400 bg-black/70 px-1 rounded">
                {{ asset.expiresIn }}天
              </div>
              <!-- Restore button -->
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <button
                  @click.stop="restoreAsset(asset.id)"
                  class="px-3 py-1.5 rounded-full bg-white/15 hover:bg-emerald-500/30 border border-white/20 hover:border-emerald-500/40 text-white hover:text-emerald-300 text-[11px] cursor-pointer transition-colors"
                >恢复</button>
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
      v-if="lightboxIndex != null"
      class="fixed inset-0 z-[250] bg-black/95 flex items-center justify-center"
      @click.self="closeLightbox"
      @keydown.escape="closeLightbox"
    >
      <button
        @click="closeLightbox"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <X :size="20" />
      </button>

      <div v-if="assets.length > 1" class="absolute top-4 left-4 text-sm text-white/60 z-10">
        {{ lightboxIndex + 1 }} / {{ assets.length }}
      </div>

      <button
        v-if="assets.length > 1"
        @click="lightboxIndex = (lightboxIndex - 1 + assets.length) % assets.length"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <ChevronLeft :size="20" />
      </button>

      <img
        :src="assets[lightboxIndex].localUrl"
        class="max-w-[90vw] max-h-[90vh] object-contain"
        alt="preview"
      />

      <button
        v-if="assets.length > 1"
        @click="lightboxIndex = (lightboxIndex + 1) % assets.length"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors z-10"
      >
        <ChevronRight :size="20" />
      </button>

      <!-- Bottom actions -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button
          @click="downloadAsset(assets[lightboxIndex])"
          class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Download :size="14" />
          下载
        </button>
        <button
          @click="deleteFromLightbox()"
          class="px-4 py-2 rounded-full bg-white/10 hover:bg-red-500/30 border border-white/20 hover:border-red-500/40 text-white hover:text-red-300 text-sm flex items-center gap-2 cursor-pointer transition-colors"
        >
          <Trash2 :size="14" />
          删除
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Loader2, ImageIcon, X, Crosshair, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-vue-next'
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
  nodeId?: string | null
  filename?: string
  localUrl: string
  prompt: string | null
  modelName?: string | null
  canvasId?: number | null
  canvasName?: string | null
  createdAt?: string
  deletedAt?: string
  expiresIn?: number
}

const assets = ref<AssetItem[]>([])
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const lightboxIndex = ref<number | null>(null)
const offset = ref(0)
const trashMode = ref(false)
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
    const url = `/api/assets/collected?offset=${o}&limit=${PAGE_SIZE}`
    const res = await apiFetch(url)
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

async function fetchTrash(reset = true) {
  if (loading.value) return
  loading.value = true
  loadError.value = ''

  try {
    const o = reset ? 0 : offset.value
    const url = `/api/assets/trash?offset=${o}&limit=${PAGE_SIZE}`
    const res = await apiFetch(url)
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

async function restoreAsset(id: number) {
  try {
    const res = await apiFetch(`/api/assets/${id}/restore`, { method: 'POST' })
    if (res.ok) {
      assets.value = assets.value.filter(a => a.id !== id)
      total.value--
    }
  } catch { /* ignore */ }
}

async function loadMore() {
  loadingMore.value = true
  if (trashMode.value) {
    await fetchTrash(false)
  } else {
    await fetchAssets(false)
  }
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

function openLightbox(asset: AssetItem) {
  lightboxIndex.value = assets.value.findIndex(a => a.id === asset.id)
}

function closeLightbox() {
  lightboxIndex.value = null
}

async function deleteFromLightbox() {
  if (lightboxIndex.value == null) return
  const asset = assets.value[lightboxIndex.value]
  if (!asset) return
  await deleteAsset(asset.id)
  if (assets.value.length === 0) {
    lightboxIndex.value = null
  } else if (lightboxIndex.value >= assets.value.length) {
    lightboxIndex.value = assets.value.length - 1
  }
}

function downloadAsset(asset: AssetItem) {
  const a = document.createElement('a')
  a.href = asset.localUrl
  a.download = asset.filename || 'image.png'
  a.click()
}

function handleLocate(nodeId: string) {
  props.locateNode?.(nodeId)
}

// Keyboard navigation for lightbox
function onKeydown(e: KeyboardEvent) {
  if (lightboxIndex.value == null) return
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft' && assets.value.length > 1) {
    lightboxIndex.value = (lightboxIndex.value - 1 + assets.value.length) % assets.value.length
  }
  if (e.key === 'ArrowRight' && assets.value.length > 1) {
    lightboxIndex.value = (lightboxIndex.value + 1) % assets.value.length
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// Refresh on open
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    offset.value = 0
    trashMode.value = false
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
