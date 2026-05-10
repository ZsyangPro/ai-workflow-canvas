<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>钱包流水</h2>
      <el-select v-model="filterType" placeholder="全部类型" clearable @change="fetchList" style="width:160px">
        <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
    </div>
    <el-table :data="flows" border stripe v-loading="loading">
      <el-table-column prop="createdAt" label="时间" width="170"><template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template></el-table-column>
      <el-table-column label="类型" width="140">
        <template #default="{ row }">
          <span :style="{ color: flowStyle(row.type).color }">{{ flowStyle(row.type).label }}</span>
        </template>
      </el-table-column>
      <el-table-column label="变动" width="100" align="right">
        <template #default="{ row }">
          <span :style="{ color: flowStyle(row.type).color, fontWeight: 600 }">{{ flowAmount(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="对象" width="160">
        <template #default="{ row }">
          {{ row.user?.username || row.subject?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="详情" min-width="200" />
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

const typeOptions = [
  { label: '平台充值', value: 'TENANT_RECHARGE' },
  { label: '平台回收', value: 'TENANT_REVOKE' },
  { label: '分配→主体', value: 'SUBJECT_ALLOCATE' },
  { label: '主体回收→租户', value: 'SUBJECT_REVOKE' },
  { label: '分配→用户', value: 'USER_ALLOCATE' },
  { label: '用户回收→租户', value: 'USER_REVOKE' },
  { label: '主体→用户', value: 'SUBJECT_TO_USER' },
  { label: '用户退回→主体', value: 'SUBJECT_TO_USER_REVOKE' },
  { label: '用户消耗', value: 'GENERATION_DEDUCTION' },
  { label: '生成退款', value: 'GENERATION_REFUND' },
]

const FLOW_STYLE: Record<string, { label: string; color: string; impact: 'in' | 'out' | 'neutral' }> = {
  TENANT_RECHARGE:        { label: '平台充值',       color: '#67C23A', impact: 'in' },
  TENANT_REVOKE:          { label: '平台回收',       color: '#F56C6C', impact: 'out' },
  SUBJECT_ALLOCATE:       { label: '分配→主体',      color: '#F56C6C', impact: 'out' },
  SUBJECT_REVOKE:         { label: '主体回收→租户',   color: '#67C23A', impact: 'in' },
  USER_ALLOCATE:          { label: '分配→用户',      color: '#F56C6C', impact: 'out' },
  USER_REVOKE:            { label: '用户回收→租户',   color: '#67C23A', impact: 'in' },
  SUBJECT_TO_USER:        { label: '主体→用户',      color: '#909399', impact: 'neutral' },
  SUBJECT_TO_USER_REVOKE: { label: '用户退回→主体',   color: '#909399', impact: 'neutral' },
  GENERATION_DEDUCTION:   { label: '用户消耗',       color: '#909399', impact: 'neutral' },
  GENERATION_REFUND:      { label: '生成退款',       color: '#909399', impact: 'neutral' },
}

function flowStyle(type: string) { return FLOW_STYLE[type] || { label: type, color: '#909399', impact: 'neutral' } }

function flowAmount(row: any) {
  const s = FLOW_STYLE[row.type]
  if (!s || s.impact === 'neutral') return String(row.amount)
  return (row.amount > 0 ? '+' : '') + row.amount
}

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
