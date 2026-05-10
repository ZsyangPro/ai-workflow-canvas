<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo" @click="collapsed = !collapsed">
        <span v-if="!collapsed">AI画布管理</span>
        <span v-else>AI</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        <template v-if="role === 'SUPER_ADMIN'">
          <el-menu-item index="/tenants">
            <el-icon><OfficeBuilding /></el-icon>
            <span>租户管理</span>
          </el-menu-item>
          <el-menu-item index="/system-users">
            <el-icon><UserFilled /></el-icon>
            <span>账号管理</span>
          </el-menu-item>
          <el-menu-item index="/models">
            <el-icon><Cpu /></el-icon>
            <span>AI模型</span>
          </el-menu-item>
        </template>

        <el-menu-item-group>
          <template #title><span style="font-size:12px;color:#8b9db5">渠道商管理</span></template>
          <el-menu-item index="/subjects">
            <el-icon><Collection /></el-icon>
            <span>主体管理</span>
          </el-menu-item>
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/wallet">
            <el-icon><Wallet /></el-icon>
            <span>钱包流水</span>
          </el-menu-item>
          <el-menu-item index="/model-pricing">
            <el-icon><Coin /></el-icon>
            <span>模型定价</span>
          </el-menu-item>
        </el-menu-item-group>
        <!-- TODO: 文件管理待完善
        <el-menu-item index="/files">
          <el-icon><Folder /></el-icon>
          <span>文件管理</span>
        </el-menu-item>
        -->
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed" :size="20">
            <Fold v-if="!collapsed" /><Expand v-else />
          </el-icon>
          <el-select
            v-if="role === 'SUPER_ADMIN' && showTenantSelector"
            v-model="selectedTenant"
            placeholder="选择租户"
            clearable
            filterable
            remote
            :remote-method="searchTenants"
            style="width: 240px; margin-left: 16px"
            @change="onTenantChange"
          >
            <el-option v-for="t in tenantOptions" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
          <template v-if="dashboard && (role === 'TENANT_ADMIN' || showTenantSelector)">
            <el-divider direction="vertical" />
            <span class="stat">剩余算力 <b>{{ dashboard.credits }}</b></span>
            <span class="stat">剩余主体 <b>{{ Math.max(0, (dashboard.subjectLimit || 0) - dashboard.subjectCount) }}</b>/{{ dashboard.subjectLimit || '∞' }}</span>
            <span class="stat">剩余用户 <b>{{ Math.max(0, (dashboard.userLimit || 0) - dashboard.userCount) }}</b>/{{ dashboard.userLimit || '∞' }}</span>
          </template>
        </div>
        <div class="header-right">
          <span class="user-info">{{ user?.username }} ({{ roleLabel }})</span>
          <el-button text @click="handleLogout">退出</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view :key="route.fullPath + '-' + tenantKey" />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { OfficeBuilding, UserFilled, User, Collection, Wallet, Coin, Folder, Fold, Expand, Cpu, DataAnalysis } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const { userRole, currentUser, apiFetch, logout } = useAuth()

const role = userRole
const user = currentUser
const collapsed = ref(false)
const selectedTenant = ref('')
const tenantOptions = ref<{ id: string; name: string }[]>([])
const tenantKey = ref(0)

const dashboard = ref<{ credits: number; subjectCount: number; subjectLimit: number; userCount: number; userLimit: number } | null>(null)

async function fetchDashboard() {
  if (role.value === 'TENANT_ADMIN' || (role.value === 'SUPER_ADMIN' && selectedTenant.value)) {
    const res = await apiFetch('/api/tenant/dashboard')
    if (res.ok) dashboard.value = await res.json()
  } else { dashboard.value = null }
}

const roleLabel = computed(() => {
  const m: Record<string, string> = { SUPER_ADMIN: '总后台', TENANT_ADMIN: '租户管理员', USER: '用户' }
  return m[role.value || ''] || ''
})

const tenantScopedRoutes = ['/subjects', '/users', '/wallet', '/model-pricing']
const showTenantSelector = computed(() => tenantScopedRoutes.includes(route.path))

async function searchTenants(query: string) {
  const res = await apiFetch(`/api/admin/tenants?limit=20&q=${encodeURIComponent(query)}`)
  if (res.ok) {
    const data = await res.json()
    tenantOptions.value = data.tenants
  }
}

function onTenantChange() {
  localStorage.setItem('admin_selected_tenant', selectedTenant.value || '')
  tenantKey.value++
  fetchDashboard()
}

onMounted(() => {
  selectedTenant.value = localStorage.getItem('admin_selected_tenant') || ''
  fetchDashboard()
})

async function handleLogout() {
  await logout()
  router.push('/login')
}
</script>

<style scoped>
.layout { height: 100vh; }
.sidebar { background: #304156; overflow-y: auto; }
.logo { height: 60px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: bold; cursor: pointer; user-select: none; }
.header { background: #fff; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e6e6e6; padding: 0 20px; height: 60px; }
.header-left { display: flex; align-items: center; }
.header-right { display: flex; align-items: center; gap: 12px; }
.collapse-btn { cursor: pointer; }
.stat { font-size: 13px; color: #606266; white-space: nowrap; }
.user-info { color: #666; font-size: 14px; }

</style>
