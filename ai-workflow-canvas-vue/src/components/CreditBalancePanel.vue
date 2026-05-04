<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="w-[26rem] max-h-[80vh] bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-5 border-b border-[#333333] shrink-0">
          <h2 class="text-lg font-semibold text-zinc-200">算力明细</h2>
          <button
            @click="close"
            class="w-7 h-7 flex items-center justify-center rounded-full text-[#666666] hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Balance card -->
        <div class="px-6 py-5 border-b border-[#333333] shrink-0">
          <p class="text-xs text-[#666666] mb-2">当前余额</p>
          <div class="bg-[#252525] border border-[#333333] rounded-xl px-5 py-4 flex items-center justify-center">
            <span class="text-2xl font-bold text-zinc-200">{{ credits.toLocaleString() }}</span>
            <span class="text-sm text-[#9CA3AF] ml-2">算力</span>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-12 shrink-0">
          <Loader2 :size="24" class="animate-spin text-emerald-400" />
        </div>

        <!-- Error -->
        <div v-else-if="error" class="px-6 py-8 text-center text-sm text-red-400 shrink-0">
          {{ error }}
        </div>

        <!-- Transaction list -->
        <template v-else>
          <div class="px-6 py-4 shrink-0">
            <p class="text-xs text-[#666666]">流水记录</p>
          </div>
          <div class="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
            <div v-if="transactions.length === 0" class="text-center py-8 text-sm text-[#666666]">
              暂无记录
            </div>
            <div
              v-for="tx in transactions"
              :key="tx.id"
              class="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-b-0"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  :class="tx.amount >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'"
                >
                  <Plus v-if="tx.amount >= 0" :size="14" color="#10b981" />
                  <Minus v-else :size="14" color="#ef4444" />
                </div>
                <div>
                  <p class="text-sm text-zinc-200">{{ typeLabel(tx.type) }}</p>
                  <p class="text-xs text-[#666666] mt-0.5">
                    {{ tx.relatedModelName || tx.description || '' }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p
                  class="text-sm font-medium"
                  :class="tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'"
                >{{ tx.amount >= 0 ? '+' : '' }}{{ tx.amount.toLocaleString() }}</p>
                <p class="text-xs text-[#666666] mt-0.5">{{ formatTime(tx.createdAt) }}</p>
              </div>
            </div>

            <!-- Load more -->
            <div v-if="hasMore" class="flex justify-center pt-4 pb-2">
              <button
                @click="loadMore"
                :disabled="loadingMore"
                class="text-sm text-[#9CA3AF] hover:text-zinc-200 transition-colors cursor-pointer py-1.5 px-4"
              >
                <Loader2 v-if="loadingMore" :size="14" class="inline animate-spin mr-1.5" />
                {{ loadingMore ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, Plus, Minus, Loader2 } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { apiFetch } = useAuth()

interface Transaction {
  id: number
  amount: number
  type: string
  description: string | null
  relatedModelId: number | null
  relatedModelName: string | null
  createdAt: string
}

const credits = ref(0)
const transactions = ref<Transaction[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')

const hasMore = computed(() => transactions.value.length < total.value)

const TYPE_LABELS: Record<string, string> = {
  ADMIN_GRANT: '管理员分配',
  GENERATION_DEDUCTION: '生成消耗',
  ADMIN_REVOKE: '管理员回收',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function close() {
  emit('update:visible', false)
}

async function fetchHistory(reset = true) {
  if (reset) {
    page.value = 1
    loading.value = true
    error.value = ''
  } else {
    loadingMore.value = true
  }

  try {
    const res = await apiFetch(`/api/credits/history?page=${page.value}&pageSize=${pageSize}`)
    const data = await res.json()
    if (res.ok) {
      credits.value = data.credits
      if (reset) {
        transactions.value = data.transactions
      } else {
        transactions.value = [...transactions.value, ...data.transactions]
      }
      total.value = data.total
    } else {
      error.value = data.error || '加载失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') error.value = '加载算力流水失败'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore() {
  if (loadingMore.value) return
  page.value++
  await fetchHistory(false)
}

watch(() => props.visible, (v) => {
  if (v) {
    fetchHistory(true)
  }
})
</script>
