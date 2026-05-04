<template>
  <div class="w-full h-screen flex items-center justify-center" style="background: #121212">
    <div class="w-96 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-8">
      <div class="flex flex-col items-center mb-6">
        <Sparkles :size="32" class="text-emerald-400 mb-3" />
        <h1 class="text-xl font-semibold text-zinc-200">索贝灵光画布</h1>
        <p class="text-sm text-[#666666] mt-1">注册后即可开始创作</p>
      </div>

      <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
        <span class="text-sm text-red-400">{{ error }}</span>
      </div>

      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-3">
          <User :size="18" class="text-gray-400 shrink-0" />
          <input
            v-model="username"
            type="text"
            placeholder="用户名（至少2位）"
            class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
          />
        </div>

        <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-3">
          <Lock :size="18" class="text-gray-400 shrink-0" />
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
          />
        </div>

        <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-3">
          <Lock :size="18" class="text-gray-400 shrink-0" />
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="确认密码"
            class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            @keydown.enter="handleRegister"
          />
        </div>

        <button
          :disabled="loading"
          @click="handleRegister"
          class="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200"
          :class="loading
            ? 'bg-emerald-500/30 text-emerald-300 cursor-wait'
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-[0.98]'"
        >
          <Loader2 v-if="loading" :size="16" class="inline animate-spin mr-2" />
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </div>

      <p class="text-center text-sm text-[#666666] mt-6">
        已有账号？
        <router-link to="/login" class="text-emerald-400 hover:text-emerald-300 transition-colors">
          去登录
        </router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles, User, Lock, Loader2 } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { register } = useAuth()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

const handleRegister = async () => {
  error.value = ''
  if (username.value.length < 2) {
    error.value = '用户名至少需要2个字符'
    return
  }
  if (!password.value) {
    error.value = '请设置密码'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    await register(username.value, password.value)
    router.push('/canvas')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>
