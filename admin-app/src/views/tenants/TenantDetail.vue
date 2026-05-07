<template>
  <div v-loading="loading">
    <el-button @click="$router.push('/tenants')" style="margin-bottom:16px">← 返回列表</el-button>
    <el-descriptions v-if="tenant" :column="2" border>
      <el-descriptions-item label="名称">{{ tenant.name }}</el-descriptions-item>
      <el-descriptions-item label="编码">{{ tenant.code }}</el-descriptions-item>
      <el-descriptions-item label="状态"><el-tag :type="tenant.status==='ACTIVE'?'success':'danger'">{{ tenant.status }}</el-tag></el-descriptions-item>
      <el-descriptions-item label="算力余额">{{ tenant.credits }}</el-descriptions-item>
      <el-descriptions-item label="联系人">{{ tenant.contactPerson }}</el-descriptions-item>
      <el-descriptions-item label="电话">{{ tenant.contactPhone }}</el-descriptions-item>
      <el-descriptions-item label="主体数">{{ tenant._count?.subjects ?? 0 }}</el-descriptions-item>
      <el-descriptions-item label="用户数">{{ tenant._count?.users ?? 0 }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const route = useRoute()
const { apiFetch } = useAuth()
const tenant = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  const res = await apiFetch(`/api/admin/tenants/${route.params.id}`)
  if (res.ok) { const d = await res.json(); tenant.value = d.tenant }
  loading.value = false
})
</script>
