<template>
  <div class="w-full h-screen flex flex-col" style="background: #121212">
    <div class="flex-1 relative">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :connection-mode="ConnectionMode.Loose"
        :fit-view-on-init="true"
        :default-edge-options="defaultEdgeOptions"
        @init="onInit"
      >
        <template #node-inputNode="nodeProps">
          <InputNode v-bind="nodeProps" />
        </template>
        <template #node-generateNode="nodeProps">
          <GenerateNode v-bind="nodeProps" />
        </template>

        <Background :variant="BackgroundVariant.Dots" :gap="20" :size="1" color="#333" />
        <Controls position="bottom-left" />
        <MiniMap
          v-if="!showWelcome"
          position="bottom-right"
          :node-color="nodeColor"
          class="!bg-[#1a1a1a] !rounded-lg"
          mask-color="rgba(0,0,0,0.6)"
        />
      </VueFlow>

      <ContextMenu
        v-if="menu"
        :x="menu.x"
        :y="menu.y"
        @addNode="addNode"
      />

      <!-- Welcome overlay: only shown when canvas is empty -->
      <div
        v-if="showWelcome"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-y-auto pointer-events-none"
      >
        <div class="flex flex-col items-center px-6 py-12 max-w-5xl w-full">
          <!-- Brand -->
          <div class="flex flex-col items-center mb-10">
            <!-- Logo mark -->
            <div class="mb-5 w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-400/20">
              <Sparkles :size="32" color="#fff" />
            </div>
            <!-- Brand name -->
            <h1 class="text-2xl font-bold tracking-wider mb-2 bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
              索贝灵光画布
            </h1>
            <!-- Slogan -->
            <p class="text-sm text-zinc-500 tracking-widest">灵光一闪，创意成真</p>
          </div>

          <!-- Guide text -->
          <div class="flex items-center gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-5 py-2.5 shadow-lg mb-6 pointer-events-auto">
            <MousePointerClick :size="16" color="#9CA3AF" />
            <span class="text-sm text-[#9CA3AF]">右键空白处，像搭积木一样开启创作</span>
          </div>

          <!-- Quick actions -->
          <div class="flex gap-3 mb-16 pointer-events-auto">
            <button
              @click="createNodePair"
              class="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2.5 cursor-pointer transition-all duration-200"
            >
              <Video :size="16" class="text-gray-400" />
              <span class="text-sm text-gray-300">文字生视频</span>
            </button>
            <button
              @click="createNodePair"
              class="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2.5 cursor-pointer transition-all duration-200"
            >
              <ImageIcon :size="16" class="text-gray-400" />
              <span class="text-sm text-gray-300">首帧生视频</span>
            </button>
            <button
              @click="createNodePair"
              class="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2.5 cursor-pointer transition-all duration-200"
            >
              <Type :size="16" class="text-gray-400" />
              <span class="text-sm text-gray-300">文字生图片</span>
            </button>
            <button
              @click="createNodePair"
              class="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2.5 cursor-pointer transition-all duration-200"
            >
              <Wand2 :size="16" class="text-gray-400" />
              <span class="text-sm text-gray-300">单图生图片</span>
            </button>
          </div>

          <!-- Recent canvases -->
          <div v-if="recentCanvases.length > 0" class="w-full pointer-events-auto">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-sm font-medium text-zinc-400">最近</h2>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div
                v-for="c in visibleRecentCanvases"
                :key="c.id"
                class="rounded-xl border border-zinc-700/30 hover:border-zinc-500/50 transition-all duration-200 p-5 flex flex-col gap-3 cursor-pointer group"
                :style="{ background: '#1a1a1a' }"
                @click="openCanvas(c.id)"
              >
                <div class="flex items-start justify-between">
                  <h3 class="text-sm font-medium text-zinc-200 truncate flex-1 mr-2">{{ c.name }}</h3>
                  <button
                    @click.stop="deleteCanvas(c.id, c.name)"
                    class="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                    title="删除画布"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>

                <div class="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{{ c.nodeCount }} 节点</span>
                  <span class="w-px h-3 bg-zinc-700/50" />
                  <span>{{ c.edgeCount }} 连线</span>
                </div>

                <div class="flex flex-col gap-0.5 mt-auto">
                  <span class="text-[11px] text-zinc-600">
                    创建于 {{ formatDate(c.createdAt) }}
                  </span>
                  <span class="text-[11px] text-zinc-600">
                    修改于 {{ formatRelativeTime(c.updatedAt) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="recentCanvases.length > 4" class="flex justify-center pt-5">
              <button
                @click="showAllRecent = !showAllRecent"
                class="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {{ showAllRecent ? '收起' : `展开全部 (${recentCanvases.length - 4})` }}
                <ChevronDown :size="14" class="transition-transform duration-200" :class="showAllRecent ? 'rotate-180' : ''" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Header -->
      <div v-if="!showWelcome" class="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <button
          @click="goHome"
          class="flex items-center justify-center w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-[#9CA3AF] hover:text-emerald-400 transition-all pointer-events-auto cursor-pointer"
          title="回到首页"
        >
          <Home :size="14" />
        </button>
        <input
          v-if="renaming"
          ref="renameInputRef"
          v-model="renameValue"
          class="text-sm text-zinc-200 font-medium bg-white/10 border border-emerald-500/50 rounded px-2 py-0.5 outline-none w-40"
          @keydown.enter="finishRename"
          @keydown.escape="cancelRename"
          @blur="finishRename"
        />
        <span
          v-else
          class="text-sm text-zinc-300 font-medium cursor-pointer pointer-events-auto hover:text-emerald-400 transition-colors"
          @click="startRename"
        >{{ canvasName || '未命名画布' }}</span>
      </div>

      <div class="absolute top-4 right-4 z-10 flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2 shadow-lg pointer-events-auto">
        <button
          @click="showCreditPanel = true"
          class="flex items-center gap-1 text-sm text-[#9CA3AF] hover:text-emerald-400 transition-colors cursor-pointer"
        >
          <Zap :size="14" />
          <span>{{ currentCredits }}</span>
        </button>
        <span class="w-px h-4 bg-white/10" />
        <button
          @click="resourcePanelOpen = !resourcePanelOpen"
          class="flex items-center gap-1 text-sm transition-colors cursor-pointer"
          :class="resourcePanelOpen ? 'text-emerald-400' : 'text-[#9CA3AF] hover:text-zinc-300'"
        >
          <span>素材库</span>
        </button>
        <span class="w-px h-4 bg-white/10" />
        <router-link
          v-if="currentUser?.role === 'ADMIN'"
          to="/admin"
          class="flex items-center gap-1 text-sm text-[#9CA3AF] hover:text-emerald-400 transition-colors cursor-pointer"
        >
          <Shield :size="14" />
          <span>管理</span>
        </router-link>
        <span v-if="currentUser?.role === 'ADMIN'" class="w-px h-4 bg-white/10" />
        <User :size="16" color="#9CA3AF" />
        <span class="text-sm text-[#9CA3AF]">{{ currentUser?.username }}</span>
        <span class="w-px h-4 bg-white/10" />
        <button
          @click="handleLogout"
          class="flex items-center gap-1 text-sm text-[#9CA3AF] hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <LogOut :size="16" />
        </button>
      </div>
      <ResourceLibraryPanel
        :open="resourcePanelOpen"
        :canvas-id="canvasId"
        :locate-node="onLocateNode"
        @close="resourcePanelOpen = false"
      />
      <CreditBalancePanel v-model:visible="showCreditPanel" />
      <ConfirmDialog ref="confirmRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, provide, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, ConnectionMode } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import type { Node, Connection, GraphNode, GraphEdge, VueFlowStore } from '@vue-flow/core'
import { LogOut, User, Shield, MousePointerClick, Video, ImageIcon, Type, Wand2, Trash2, ChevronDown, Home, Sparkles, Zap } from 'lucide-vue-next'
import InputNode from '../nodes/InputNode.vue'
import GenerateNode from '../nodes/GenerateNode.vue'
import ContextMenu from '../components/ContextMenu.vue'
import ResourceLibraryPanel from '../components/ResourceLibraryPanel.vue'
import CreditBalancePanel from '../components/CreditBalancePanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useAuth } from '../composables/useAuth'

const { currentUser, logout, apiFetch } = useAuth()
const route = useRoute()
const router = useRouter()

let idCounter = 0
const nextId = () => `${++idCounter}`

const canvasId = computed(() => Number(route.params.id))
const canvasName = ref('')
provide('canvasId', canvasId)

async function refreshCredits(): Promise<number> {
  try {
    const res = await apiFetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      currentCredits.value = data.user?.credits || data.credits || 0
      return currentCredits.value
    }
  } catch { /* silent */ }
  return currentCredits.value
}

provide('refreshCredits', refreshCredits)

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#555', strokeWidth: 2 },
}

const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])
const menu = ref<{ x: number; y: number } | null>(null)
const resourcePanelOpen = ref(false)
const showCreditPanel = ref(false)
const confirmRef = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const currentCredits = ref(0)
const renaming = ref(false)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

let vfInstance: VueFlowStore | null = null
const loaded = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const showWelcome = computed(() => nodes.value.length === 0 && loaded.value && !menu.value)

// --- Recent canvases ---
interface CanvasSummary {
  id: number; name: string; nodeCount: number; edgeCount: number
  createdAt: string; updatedAt: string
}
const recentCanvases = ref<CanvasSummary[]>([])
const showAllRecent = ref(false)
const visibleRecentCanvases = computed(() =>
  showAllRecent.value ? recentCanvases.value : recentCanvases.value.slice(0, 4)
)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return formatDate(iso)
}

async function fetchRecentCanvases() {
  try {
    const res = await apiFetch('/api/canvas?limit=20')
    if (res.ok) {
      const data = await res.json()
      recentCanvases.value = (data.canvases as CanvasSummary[])
        .filter((c: CanvasSummary) => c.id !== canvasId.value)
    }
  } catch { /* ignore */ }
}

async function createNewCanvas() {
  try {
    const res = await apiFetch('/api/canvas', { method: 'POST', body: JSON.stringify({}) })
    if (res.ok) {
      const data = await res.json()
      router.push(`/canvas/${data.canvas.id}`)
    }
  } catch { /* ignore */ }
}

function openCanvas(id: number) {
  cleanupEmptyCanvas()
  router.push(`/canvas/${id}`)
}

async function cleanupEmptyCanvas() {
  if (nodes.value.length === 0 && edges.value.length === 0) {
    apiFetch(`/api/canvas/${canvasId.value}`, { method: 'DELETE' }).catch(() => {})
  }
}

async function deleteCanvas(id: number, name: string) {
  const ok = await confirmRef.value?.confirm(
    `确定删除画布「${name}」？画布内的所有节点、连线和生成图片将被永久删除。`,
    { title: '删除画布', okText: '删除' },
  )
  if (!ok) return
  try {
    const res = await apiFetch(`/api/canvas/${id}`, { method: 'DELETE' })
    if (res.ok) {
      recentCanvases.value = recentCanvases.value.filter(c => c.id !== id)
    }
  } catch { /* ignore */ }
}

// --- Canvas ---
const nodeColor = (node: GraphNode) => {
  switch (node.type) {
    case 'inputNode': return '#06b6d4'
    case 'generateNode': return '#10b981'
    default: return '#555'
  }
}

const onInit = (instance: VueFlowStore) => {
  vfInstance = instance
  instance.onPaneContextMenu((event: MouseEvent) => {
    event.preventDefault()
    menu.value = { x: event.clientX, y: event.clientY }
  })
  instance.onPaneClick(() => { menu.value = null })
  instance.onConnect((connection: Connection) => {
    edges.value = [...edges.value, {
      id: `edge-${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      animated: true,
      style: { stroke: '#555', strokeWidth: 2 },
    } as GraphEdge]
  })
}

const addNode = (type: 'inputNode' | 'generateNode') => {
  if (!menu.value || !vfInstance) return
  const pos = vfInstance.screenToFlowCoordinate({ x: menu.value.x, y: menu.value.y })
  nodes.value = [...nodes.value, {
    id: `${type}-${nextId()}`,
    type,
    position: pos,
    data: {},
  } as GraphNode]
  menu.value = null
}

function createNodePair() {
  const inputId = `inputNode-${nextId()}`
  const genId = `generateNode-${nextId()}`
  nodes.value = [
    { id: inputId, type: 'inputNode', position: { x: 180, y: 140 }, data: {} },
    { id: genId, type: 'generateNode', position: { x: 500, y: 130 }, data: {} },
  ] as GraphNode[]
  edges.value = [{
    id: `edge-${inputId}-${genId}`,
    source: inputId, target: genId,
    animated: true,
    style: { stroke: '#555', strokeWidth: 2 },
  }] as GraphEdge[]
}

// --- Persistence ---
async function loadCanvas() {
  try {
    const res = await apiFetch(`/api/canvas/${canvasId.value}`)
    if (res.ok) {
      const data = await res.json()
      canvasName.value = data.name as string
      if (data.nodes?.length) {
        nodes.value = data.nodes as GraphNode[]
        edges.value = data.edges as GraphEdge[]
        const maxNum = [...nodes.value.map(n => n.id), ...edges.value.map(e => e.id)]
          .map(id => { const m = (id as string).match(/\d+$/); return m ? parseInt(m[0], 10) : 0 })
          .reduce((a, b) => Math.max(a, b), 0)
        idCounter = maxNum
      }
    } else if (res.status === 403 || res.status === 404) {
      // Canvas not found — create a new one
      const newRes = await apiFetch('/api/canvas', { method: 'POST', body: JSON.stringify({}) })
      if (newRes.ok) {
        const data = await newRes.json()
        loaded.value = true
        router.replace(`/canvas/${data.canvas.id}`)
        return
      }
    }
  } catch (e) { console.error('Canvas load failed:', e) }
  loaded.value = true
}

function saveCanvas() {
  if (!loaded.value || isNaN(canvasId.value)) return

  // Auto-delete canvas that became empty after having content
  if (nodes.value.length === 0 && edges.value.length === 0 && idCounter > 0) {
    apiFetch(`/api/canvas/${canvasId.value}`, { method: 'DELETE' })
      .catch((e) => { console.error('Canvas delete failed:', e) })
    router.push('/')
    return
  }

  const cleanNodes = nodes.value.map(({ id, type, position, data }) => ({ id, type, position, data }))
  const cleanEdges = edges.value.map(({ id, source, target, sourceHandle, targetHandle }) => ({
    id, source, target, sourceHandle, targetHandle, animated: true, style: { stroke: '#555', strokeWidth: 2 },
  }))
  apiFetch(`/api/canvas/${canvasId.value}`, {
    method: 'PUT', body: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }),
  }).catch((e) => { console.error('Canvas save failed:', e) })
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCanvas, 800)
}

function onLocateNode(nodeId: string) {
  if (!vfInstance) return
  const node = vfInstance.findNode(nodeId)
  if (node) vfInstance.setCenter(node.position.x + 170, node.position.y + 60, { zoom: 1.5, duration: 300 })
}

function startRename() {
  renameValue.value = canvasName.value
  renaming.value = true
  nextTick(() => renameInputRef.value?.select())
}

async function finishRename() {
  if (!renaming.value) return
  renaming.value = false
  const name = renameValue.value.trim()
  if (!name || name === canvasName.value) return
  try {
    const res = await apiFetch(`/api/canvas/${canvasId.value}`, {
      method: 'PATCH', body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const data = await res.json()
      canvasName.value = data.canvas.name
    }
  } catch { /* ignore */ }
}

function cancelRename() {
  renaming.value = false
}

function handleLogout() { logout() }

function goHome() {
  cleanupEmptyCanvas()
  router.push('/')
}

watch(canvasId, (n, o) => {
  if (n !== o) {
    clearTimeout(saveTimer); saveTimer = null
    loaded.value = false; nodes.value = []; edges.value = []; idCounter = 0
    loadCanvas()
  }
})

watch([nodes, edges], scheduleSave, { deep: true })

onMounted(() => {
  idCounter = 0
  loadCanvas()
  fetchRecentCanvases()
  refreshCredits()
})
</script>
