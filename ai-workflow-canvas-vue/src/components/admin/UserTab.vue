<template>
  <div>
    <!-- Title row -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold text-zinc-200">用户管理</h1>
        <span class="text-sm text-[#666666]">共 {{ users.length }} 人</span>
      </div>
      <button
        @click="openCreate"
        class="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg px-4 py-2 text-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
      >
        <Plus :size="16" />
        新建用户
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

    <!-- Users table -->
    <div v-else-if="users.length" class="bg-[#1a1a1a] border border-[#333333] rounded-xl overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-[#333333]">
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">用户名</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">角色</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">算力余额</th>
            <th class="text-left text-xs text-[#666666] font-medium px-6 py-3">创建时间</th>
            <th class="text-right text-xs text-[#666666] font-medium px-6 py-3">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-b border-[#333333] last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            <td class="px-6 py-4">
              <span class="text-sm text-zinc-200">{{ user.username }}</span>
            </td>
            <td class="px-6 py-4">
              <span
                class="text-xs px-2 py-0.5 rounded-full border"
                :class="user.role === 'ADMIN'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : 'text-[#9CA3AF] bg-white/5 border-white/10'"
              >{{ user.role === 'ADMIN' ? '管理员' : '普通用户' }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="text-sm text-zinc-200">{{ user.credits ?? 0 }}</span>
            </td>
            <td class="px-6 py-4">
              <span class="text-sm text-[#666666]">{{ formatDate(user.createdAt) }}</span>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center justify-end gap-2">
                <button
                  @click="openCredits(user)"
                  class="text-sm text-emerald-400/70 hover:text-emerald-400 transition-colors cursor-pointer px-2 py-1"
                >算力</button>
                <button
                  @click="openEdit(user)"
                  class="text-sm text-[#9CA3AF] hover:text-zinc-200 transition-colors cursor-pointer px-2 py-1"
                >编辑</button>
                <button
                  @click="confirmDelete(user)"
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
      暂无用户
    </div>

    <!-- Edit/Create modal -->
    <Teleport to="body">
      <div
        v-if="modal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div class="w-96 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-zinc-200 mb-5">
            {{ modal.mode === 'create' ? '新建用户' : '编辑用户' }}
          </h2>

          <div v-if="modalError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
            <span class="text-sm text-red-400">{{ modalError }}</span>
          </div>

          <div class="flex flex-col gap-4">
            <!-- Username -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">用户名</label>
              <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5">
                <User :size="16" class="text-gray-400 shrink-0" />
                <input
                  v-model="form.username"
                  type="text"
                  class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                  :placeholder="modal.mode === 'create' ? '用户名' : modal.username"
                />
              </div>
            </div>

            <!-- Password -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">
                {{ modal.mode === 'create' ? '密码' : '新密码（留空则不修改）' }}
              </label>
              <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5">
                <Lock :size="16" class="text-gray-400 shrink-0" />
                <input
                  v-model="form.password"
                  type="password"
                  class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
                  placeholder="密码"
                />
              </div>
            </div>

            <!-- Role -->
            <div>
              <label class="text-xs text-[#666666] block mb-1.5">角色</label>
              <div class="flex gap-3">
                <label
                  class="flex-1 flex items-center justify-center gap-2 bg-[#252525] border rounded-lg px-4 py-2.5 cursor-pointer transition-all"
                  :class="form.role === 'USER'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-[#333333] text-[#9CA3AF] hover:border-[#555555]'"
                >
                  <input v-model="form.role" type="radio" value="USER" class="sr-only" />
                  <User :size="14" />
                  <span class="text-sm">普通用户</span>
                </label>
                <label
                  class="flex-1 flex items-center justify-center gap-2 bg-[#252525] border rounded-lg px-4 py-2.5 cursor-pointer transition-all"
                  :class="form.role === 'ADMIN'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-[#333333] text-[#9CA3AF] hover:border-[#555555]'"
                >
                  <input v-model="form.role" type="radio" value="ADMIN" class="sr-only" />
                  <Shield :size="14" />
                  <span class="text-sm">管理员</span>
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
                @click="saveUser"
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
          <p class="text-sm text-[#9CA3AF] mb-5">确定要删除用户 <span class="text-zinc-200">{{ deleting.username }}</span> 吗？此操作不可撤销。</p>
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
    <!-- Credit adjustment modal -->
    <Teleport to="body">
      <div
        v-if="creditTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="creditTarget = null"
      >
        <div class="w-80 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-zinc-200 mb-1">调整算力</h2>
          <p class="text-sm text-[#666666] mb-5">
            用户 <span class="text-zinc-200">{{ creditTarget.username }}</span> · 当前余额 <span class="text-zinc-200">{{ creditTarget.credits ?? 0 }}</span>
          </p>

          <div v-if="creditError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
            <span class="text-sm text-red-400">{{ creditError }}</span>
          </div>

          <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-2.5 mb-5">
            <span class="text-sm text-[#666666] shrink-0">数量</span>
            <input
              v-model.number="creditAmount"
              type="number"
              class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
              placeholder="正数增加，负数减少"
            />
          </div>

          <div class="flex gap-3">
            <button
              @click="creditTarget = null"
              class="flex-1 py-2.5 rounded-lg text-sm text-[#9CA3AF] hover:text-zinc-200 border border-[#333333] hover:border-[#555555] transition-all cursor-pointer"
            >取消</button>
            <button
              :disabled="creditSaving"
              @click="doAdjustCredits"
              class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
              :class="creditSaving
                ? 'bg-emerald-500/30 text-emerald-300 cursor-wait'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-[0.98]'"
            >
              <Loader2 v-if="creditSaving" :size="14" class="inline animate-spin mr-1.5" />
              {{ creditSaving ? '处理中...' : '确认调整' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { User, Plus, Lock, Shield, Loader2 } from 'lucide-vue-next'
import { useAuth } from '../../composables/useAuth'

interface UserItem {
  id: number
  username: string
  role: string
  credits: number
  createdAt: string
}

const { apiFetch } = useAuth()

const users = ref<UserItem[]>([])
const loading = ref(true)
const error = ref('')

const modal = ref<{ mode: 'create' | 'edit'; username?: string; id?: number } | null>(null)
const form = ref({ username: '', password: '', role: 'USER' })
const saving = ref(false)
const modalError = ref('')

const deleting = ref<UserItem | null>(null)
const deleteLoading = ref(false)

const creditTarget = ref<UserItem | null>(null)
const creditAmount = ref(0)
const creditSaving = ref(false)
const creditError = ref('')

onMounted(fetchUsers)

async function fetchUsers() {
  loading.value = true
  error.value = ''
  try {
    const res = await apiFetch('/api/users')
    const data = await res.json()
    if (res.ok) {
      users.value = data.users
    } else {
      error.value = data.error || '加载失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') error.value = '加载用户列表失败'
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function openCreate() {
  form.value = { username: '', password: '', role: 'USER' }
  modalError.value = ''
  modal.value = { mode: 'create' }
}

function openEdit(user: UserItem) {
  form.value = { username: '', password: '', role: user.role }
  modalError.value = ''
  modal.value = { mode: 'edit', username: user.username, id: user.id }
}

function closeModal() {
  modal.value = null
  modalError.value = ''
}

async function saveUser() {
  modalError.value = ''

  if (modal.value?.mode === 'create') {
    if (!form.value.username || !form.value.password) {
      modalError.value = '用户名和密码为必填项'
      return
    }
  }

  saving.value = true
  try {
    const body: Record<string, string> = {}
    if (form.value.username) body.username = form.value.username
    if (form.value.password) body.password = form.value.password
    body.role = form.value.role

    let res: Response
    if (modal.value?.mode === 'create') {
      res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) })
    } else {
      res = await apiFetch(`/api/users/${modal.value?.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    }

    const data = await res.json()
    if (res.ok) {
      closeModal()
      await fetchUsers()
    } else {
      modalError.value = data.error || '保存失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') modalError.value = '请求失败'
  } finally {
    saving.value = false
  }
}

function confirmDelete(user: UserItem) {
  deleting.value = user
}

function openCredits(user: UserItem) {
  creditTarget.value = user
  creditAmount.value = 0
  creditError.value = ''
}

async function doAdjustCredits() {
  if (!creditTarget.value) return
  if (!creditAmount.value || creditAmount.value === 0) {
    creditError.value = '请输入调整数量'
    return
  }
  if (creditAmount.value < -100000 || creditAmount.value > 100000) {
    creditError.value = '调整范围 -100000 ~ 100000'
    return
  }

  creditSaving.value = true
  creditError.value = ''
  try {
    const res = await apiFetch(`/api/users/${creditTarget.value.id}/credits`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: creditAmount.value }),
    })
    const data = await res.json()
    if (res.ok) {
      creditTarget.value = null
      await fetchUsers()
    } else {
      creditError.value = data.error || '调整失败'
    }
  } catch (e: any) {
    if (e.message !== '登录已过期') creditError.value = '请求失败'
  } finally {
    creditSaving.value = false
  }
}

async function doDelete() {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    const res = await apiFetch(`/api/users/${deleting.value.id}`, { method: 'DELETE' })
    if (res.ok) {
      deleting.value = null
      await fetchUsers()
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
