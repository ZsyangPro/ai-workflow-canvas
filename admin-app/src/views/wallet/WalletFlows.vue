<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>钱包流水</h2>
      <el-select v-model="filterType" placeholder="全部类型" clearable @change="fetchList" style="width:160px">
        <el-option label="充值" value="TENANT_RECHARGE" />
        <el-option label="主体分配" value="SUBJECT_ALLOCATE" />
        <el-option label="用户分配" value="USER_ALLOCATE" />
        <el-option label="消费扣减" value="GENERATION_DEDUCTION" />
        <el-option label="退款" value="GENERATION_REFUND" />
      </el-select>
    </div>
    <el-table :data="flows" border stripe v-loading="loading">
      <el-table-column prop="createdAt" label="时间" width="180"><template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template></el-table-column>
      <el-table-column prop="type" label="类型" width="160"><template #default="{ row }"><el-tag>{{ row.type }}</el-tag></template></el-table-column>
      <el-table-column prop="amount" label="金额"><template #default="{ row }"><span :style="{ color: row.amount > 0 ? '#67C23A' : '#F56C6C' }">{{ row.amount > 0 ? '+' : '' }}{{ row.amount }}</span></template></el-table-column>
      <el-table-column prop="description" label="描述" />
    </el-table>
    <el-pagination
      v-if="total > 20"
      style="margin-top:16px;justify-content:flex-end"
      layout="prev, pager, next"
      :total="total"
      :page-size="20"
      @current-change="page => { currentPage = page; fetchList() }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { apiFetch } = useAuth()
const flows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const filterType = ref('')
const currentPage = ref(1)

async function fetchList() {
  loading.value = true
  let url = `/api/tenant/wallet/flows?offset=${(currentPage.value - 1) * 20}&limit=20`
  if (filterType.value) url += `&type=${filterType.value}`
  const res = await apiFetch(url)
  if (res.ok) { const d = await res.json(); flows.value = d.flows; total.value = d.total }
  loading.value = false
}

onMounted(fetchList)
</script>
