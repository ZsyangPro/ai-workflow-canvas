<template>
  <div class="w-full h-screen flex items-center justify-center" style="background: #121212">
    <div class="w-96 bg-[#1a1a1a] border border-[#333333] rounded-2xl shadow-2xl p-8">
      <div class="flex flex-col items-center mb-6">
        <Sparkles :size="32" class="text-emerald-400 mb-3" />
        <h1 class="text-xl font-semibold text-zinc-200">索贝灵光画布</h1>
        <p class="text-sm text-[#666666] mt-1">登录你的账号</p>
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
            placeholder="用户名"
            class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            @keydown.enter="handleLogin"
          />
        </div>

        <div class="flex items-center gap-3 bg-[#252525] border border-[#333333] rounded-lg px-4 py-3">
          <Lock :size="18" class="text-gray-400 shrink-0" />
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            class="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            @keydown.enter="handleLogin"
          />
        </div>

        <button
          :disabled="loading"
          @click="handleLogin"
          class="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200"
          :class="loading
            ? 'bg-emerald-500/30 text-emerald-300 cursor-wait'
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-[0.98]'"
        >
          <Loader2 v-if="loading" :size="16" class="inline animate-spin mr-2" />
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </div>

      <p class="text-center text-sm text-[#666666] mt-6">
        还没有账号？
        <router-link to="/register" class="text-emerald-400 hover:text-emerald-300 transition-colors">
          立即注册
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
const { login } = useAuth()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const handleLogin = async () => {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请填写用户名和密码'
    return
  }
  loading.value = true
  try {
    await login(username.value, password.value)
    router.push('/canvas')
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>
