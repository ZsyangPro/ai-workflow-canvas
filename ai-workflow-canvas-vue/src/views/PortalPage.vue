<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PortalHero from '../components/diy/PortalHero.vue'
import PortalBanner from '../components/diy/PortalBanner.vue'
import PortalFeatures from '../components/diy/PortalFeatures.vue'
import PortalModels from '../components/diy/PortalModels.vue'
import PortalStats from '../components/diy/PortalStats.vue'
import PortalCta from '../components/diy/PortalCta.vue'
import PortalDivider from '../components/diy/PortalDivider.vue'
import PortalCarousel from '../components/diy/PortalCarousel.vue'

const route = useRoute()
const router = useRouter()

const tenant = ref<Record<string, any>>({})
const blocks = ref<any[]>([])
const loading = ref(true)
const error = ref('')

const componentMap: Record<string, any> = {
  hero: PortalHero,
  banner: PortalBanner,
  features: PortalFeatures,
  models: PortalModels,
  stats: PortalStats,
  cta: PortalCta,
  divider: PortalDivider,
  carousel: PortalCarousel,
}

onMounted(async () => {
  const code = route.params.tenantCode as string
  if (!code) {
    error.value = '缺少租户标识'
    loading.value = false
    return
  }
  try {
    const res = await fetch(`/api/portal/${encodeURIComponent(code)}`)
    if (!res.ok) {
      if (res.status === 404) { error.value = '门户不存在'; loading.value = false; return }
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json()
    tenant.value = data.tenant
    blocks.value = data.blocks
  } catch (e: any) {
    error.value = '加载失败'
  } finally {
    loading.value = false
  }
})

function goLogin() {
  router.push('/login')
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- NavBar -->
    <header class="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" @click="goHome">
          <img
            v-if="tenant.logo"
            :src="tenant.logo"
            :alt="tenant.name"
            class="h-9 w-auto object-contain"
          />
          <span class="font-semibold text-gray-900 text-lg">{{ tenant.name }}</span>
        </div>
        <button
          class="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium"
          @click="goLogin"
        >
          登录
        </button>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center min-h-[60vh]">
      <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <div class="text-6xl mb-4">🏠</div>
      <p class="text-lg">{{ error }}</p>
    </div>

    <!-- Blocks -->
    <template v-else>
      <component
        v-for="block in blocks"
        :key="block.id"
        :is="componentMap[block.type]"
        :config="block.config"
      />

      <!-- Footer -->
      <footer class="py-8 px-4 text-center text-sm text-gray-400 border-t border-gray-100">
        <p v-if="tenant.name">{{ tenant.name }}</p>
        <p>Powered by AI Canvas</p>
      </footer>
    </template>
  </div>
</template>
