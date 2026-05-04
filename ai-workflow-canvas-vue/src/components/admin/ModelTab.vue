<template>
  <div>
    <!-- Title row -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold text-zinc-200">模型管理</h1>
        <span class="text-sm text-[#666666]">共 {{ models.length }} 个</span>
      </div>
      <button
        @click="openCreate"
        class="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
      >
        <Plus :size="16" />
        新建模型
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
      <span class="text-sm text-red-400">{{ error }}</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Loader2 :size="24" class="animate-spin text-emerald-400" />
    </div>

    <!-- Models table -->
    <div v-else-if="models.length" class="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-[#333333]">
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">名称</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">模型标识</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">类别</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">算力消耗</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">API Key</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">状态</th>
            <th class="text-right text-xs text-[#666666] font-medium px-6 py-3">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in models"
            :key="model.id"
            class="border-b border-[#333333] last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            <td class="px-6 py-4">
              <span class="text-sm text-zinc-200">{{ model.name }}</span>
            </td>
            <td class="px-6 py-4">
              <code class="text-xs text-[#9CA3AF] bg-[#252525] rounded px-1.5 py-0.5">{{ model.modelName }}</code>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-0.5 rounded-full border"
                :class="model.category === 'video'
                  ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'"
              >{{ model.category === 'video' ? '视频' : '图片' }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="text-sm text-zinc-200">{{ model.costCredits }}</span>
            </td>
            <td class="px-6 py-4">
              <code class="text-xs text-[#666666]">{{ model.apiKey }}</code>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-0.5 rounded-full border"
                :class="model.enabled
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-[#666666] bg-white/5 border-white/10'"
              >{{ model.enabled ? '启用' : '禁用' }}</span>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center justify-end gap-2">
                <button
                  @click="openEdit(model)"
                  class="text-sm text-[#9CA3AF] hover:text-zinc-200 transition-colors cursor-pointer px-2 py-1"
                >编辑</button>
                <button
                  @click="confirmDelete(model)"
                  class="text-sm text-red-400/70 hover:text-red-400 transition-colors cursor-pointer px-2 py-1"
                >删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty -->
    <div v-else class="flex items-center justify-center py-20 text-sm text-[#666666]">
      暂无模型，点击「新建模型」添加
    </div>

    <!-- Edit/Create modal -->
    <Teleport to="body">
      <div
        v-if="modal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div class="w-[28rem] bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-zinc-200 mb-5">
            {{ modal.mode === 'create' ? '新建模型' : '编辑模型' }}
          </h2>

          <div v-if="modalError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
            <span class="text-sm text-red-400">{{ modalError }}</span>
          </div>

          <div class="flex flex-col gap-4">
            <!-- Name -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">显示名称</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                placeholder="如 Qwen-Image-Plus"
              />
            </div>

            <!-- Provider -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">供应商</label>
              <select
                v-model="form.provider"
                @change="onProviderChange"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 outline-none cursor-pointer"
              >
                <option value="sophnet">Sophnet</option>
                <option value="seedream">Seedream (火山方舟)</option>
              </select>
            </div>

            <!-- Base URL -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">Base URL</label>
              <input
                v-model="form.baseUrl"
                type="text"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                placeholder="根据供应商填写 API 地址"
              />
            </div>

            <!-- API Key -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">API Key</label>
              <input
                v-model="form.apiKey"
                type="password"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                :placeholder="modal.mode === 'edit' ? '留空则不修改' : 'API Key'"
              />
            </div>

            <!-- Model Name -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">模型标识</label>
              <input
                v-model="form.modelName"
                type="text"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                placeholder="如 Z-Image-Turbo, dall-e-3"
              />
            </div>

            <!-- Description -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">描述（选填）</label>
              <input
                v-model="form.description"
                type="text"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                placeholder="如 轻量稳定，画面质感佳"
              />
            </div>

            <!-- 算力消耗 -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">算力消耗</label>
              <input
                v-model.number="form.costCredits"
                type="number"
                min="0"
                class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 outline-none"
              />
            </div>

            <!-- Category + Enabled -->
            <div class="flex gap-4">
              <div class="flex-1">
                <label class="text-xs text-[#666666] block mb-1.5">类别</label>
                <select
                  v-model="form.category"
                  class="w-full bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 text-sm text-zinc-200 outline-none cursor-pointer"
                >
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                </select>
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 cursor-pointer">
                  <input v-model="form.enabled" type="checkbox" class="sr-only" />
                  <span
                    class="w-8 h-5 rounded-full transition-colors"
                    :class="form.enabled ? 'bg-emerald-500' : 'bg-[#444444]'"
                  />
                  <span class="text-xs text-[#9CA3AF]">{{ form.enabled ? '启用' : '禁用' }}</span>
                </label>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-3 mt-2">
              <button
                @click="closeModal"
                class="flex-1 py-2.5 rounded-lg text-sm text-[#9CA3AF] hover:text-zinc-200 border border-[#333333] hover:border-[#555555] transition-all cursor-pointer"
              >取消</button>
              <button
                :disabled="saving"
                @click="saveModel"
                class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
                :class="saving
                  ? 'bg-emerald-500/30 text-emerald-300 cursor-wait'
                  : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-[0.98]'"
              >
                <Loader2 v-if="saving" :size="14" class="inline animate-spin mr-1.5" />
                {{ saving ? '保存中...' : (modal.mode === 'create' ? '创建' : '保存') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirmation -->
    <Teleport to="body">
      <div
        v-if="deleting"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="deleting = null"
      >
        <div class="w-80 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-zinc-200 mb-2">确认删除</h2>
          <p class="text-sm text-[#9CA3AF] mb-5">确定要删除模型 <span class="text-zinc-200">{{ deleting.name }}</span> 吗？此操作不可撤销。</p>
          <div class="flex gap-3">
            <button
              @click="deleting = null"
              class="flex-1 py-2.5 rounded-lg text-sm text-[#9CA3AF] hover:text-zinc-200 border border-[#333333] hover:border-[#555555] transition-all cursor-pointer"
            >取消</button>
            <button
              :disabled="deleteLoading"
              @click="doDelete"
              class="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all duration-200 cursor-pointer active:scale-[0.98]"
            >
              <Loader2 v-if="deleteLoading" :size="14" class="inline animate-spin mr-1.5" />
              {{ deleteLoading ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Loader2 } from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

interface ModelItem {
  id: number
  name: string
  provider: string
  baseUrl: string
  apiKey: string
  modelName: string
  category: string
  enabled: boolean
  description?: string | null
  costCredits: number
  createdAt: string
}

const { apiFetch } = useAuth()

const models = ref<ModelItem[]>([])
const loading = ref(true)
const error = ref('')

const modal = ref<{ mode: 'create' | 'edit'; id?: number } | null>(null)
const form = ref({
  name: '',
  provider: 'sophnet',
  baseUrl: 'https://www.sophnet.com/api/open-apis/projects/easyllms',
  apiKey: '',
  modelName: '',
  category: 'image',
  enabled: true,
  description: '',
  costCredits: 1,
})
const saving = ref(false)
const modalError = ref('')

const deleting = ref<ModelItem | null>(null)
const deleteLoading = ref(false)

onMounted(fetchModels)

async function fetchModels() {
  loading.value = true
  error.value = ''
  try {
    const res = await apiFetch('/api/models')
    const data = await res.json()
    if (res.ok) {
      models.value = data.models
    } else {
      error.value = data.error || '加载失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') error.value = '加载模型列表失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = {
    name: '',
    provider: 'seedream',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    modelName: '',
    category: 'image',
    enabled: true,
    description: '',
    costCredits: 1,
  }
  modalError.value = ''
  modal.value = { mode: 'create' }
}

function openEdit(model: ModelItem) {
  form.value = {
    name: model.name,
    provider: model.provider,
    baseUrl: model.baseUrl,
    apiKey: '',
    modelName: model.modelName,
    category: model.category,
    enabled: model.enabled,
    description: model.description || '',
    costCredits: model.costCredits,
  }
  modalError.value = ''
  modal.value = { mode: 'edit', id: model.id }
}

function closeModal() {
  modal.value = null
  modalError.value = ''
}

function onProviderChange() {
  if (form.value.provider === 'seedream') {
    form.value.baseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
  }
}

async function saveModel() {
  modalError.value = ''

  if (modal.value?.mode === 'create') {
    if (!form.value.name || !form.value.apiKey || !form.value.modelName) {
      modalError.value = '名称、API Key 和模型标识为必填项'
      return
    }
  }

  saving.value = true
  try {
    const body: Record<string, unknown> = {
      name: form.value.name,
      provider: form.value.provider,
      baseUrl: form.value.baseUrl,
      modelName: form.value.modelName,
      category: form.value.category,
      enabled: form.value.enabled,
      description: form.value.description || undefined,
      costCredits: form.value.costCredits,
    }
    if (form.value.apiKey) body.apiKey = form.value.apiKey

    let res: Response
    if (modal.value?.mode === 'create') {
      res = await apiFetch('/api/models', { method: 'POST', body: JSON.stringify(body) })
    } else {
      res = await apiFetch(`/api/models/${modal.value?.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    }

    const data = await res.json()
    if (res.ok) {
      closeModal()
      await fetchModels()
    } else {
      modalError.value = data.error || '保存失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') modalError.value = '请求失败'
  } finally {
    saving.value = false
  }
}

function confirmDelete(model: ModelItem) {
  deleting.value = model
}

async function doDelete() {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    const res = await apiFetch(`/api/models/${deleting.value.id}`, { method: 'DELETE' })
    if (res.ok) {
      deleting.value = null
      await fetchModels()
    } else {
      const data = await res.json()
      error.value = data.error || '删除失败'
      deleting.value = null
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') error.value = '请求失败'
    deleting.value = null
  } finally {
    deleteLoading.value = false
  }
}
</script>
