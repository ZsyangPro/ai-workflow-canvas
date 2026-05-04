<template>
  <div class="w-full h-screen flex flex-col" style="background: #121212">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-[#333333]">
      <div class="flex items-center gap-4">
        <span class="text-[#9CA3AF] font-medium tracking-wide">索贝灵光画布</span>
        <router-link to="/canvas" class="flex items-center gap-1 text-sm text-[#666666] hover:text-emerald-400 transition-colors cursor-pointer">
          <ArrowLeft :size="14" />
          <span>返回画布</span>
        </router-link>
      </div>
      <div class="flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2">
        <User :size="16" class="text-gray-400" />
        <span class="text-sm text-[#9CA3AF]">{{ currentUser?.username }}</span>
        <span class="w-px h-4 bg-white/10" />
        <button
          @click="handleLogout"
          class="flex items-center gap-1 text-sm text-[#9CA3AF] hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <LogOut :size="16" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-4xl mx-auto">
        <!-- Tabs -->
        <div class="flex gap-1 mb-6 bg-[#1a1a1a] rounded-lg p-1 border border-[#333333] w-fit">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer"
            :class="activeTab === tab.key
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-[#666666] hover:text-[#9CA3AF]'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <UserTab v-if="activeTab === 'users'" />
        <ModelTab v-if="activeTab === 'models'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { User, LogOut, ArrowLeft } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'
import UserTab from '../components/admin/UserTab.vue'
import ModelTab from '../components/admin/ModelTab.vue'

const { currentUser, logout } = useAuth()

const tabs = [
  { key: 'users', label: '用户管理' },
  { key: 'models', label: '模型管理' },
]
const activeTab = ref('users')

function handleLogout() {
  logout()
}
</script>
