<template>
  <div>
    <h2>数据看板</h2>

    <!-- 概览卡片 -->
    <el-row :gutter="16" style="margin-bottom:20px">
      <el-col :span="6" v-for="c in overviewCards" :key="c.label">
        <el-card shadow="hover">
          <div class="card-label">{{ c.label }}</div>
          <div class="card-value" :style="{ color: c.color }">{{ c.value }}</div>
          <div class="card-sub">{{ c.sub }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 消耗统计 -->
    <el-card style="margin-bottom:20px">
      <template #header>算力消耗统计</template>
      <el-row :gutter="16">
        <el-col :span="6"><div class="stat-label">今日消耗</div><div class="stat-num red">{{ data.consume?.today ?? '-' }}</div></el-col>
        <el-col :span="6"><div class="stat-label">昨日消耗</div><div class="stat-num">{{ data.consume?.yesterday ?? '-' }}</div></el-col>
        <el-col :span="6"><div class="stat-label">近7天消耗</div><div class="stat-num">{{ data.consume?.week ?? '-' }}</div></el-col>
        <el-col :span="6"><div class="stat-label">本月消耗</div><div class="stat-num">{{ data.consume?.month ?? '-' }}</div></el-col>
      </el-row>
      <div v-if="data.dailyConsume?.length" style="margin-top:16px">
        <div class="stat-label" style="margin-bottom:8px">近7天消耗趋势</div>
        <div class="bar-chart">
          <div v-for="d in data.dailyConsume" :key="d.day" class="bar-col">
            <div class="bar" :style="{ height: barHeight(d.consumed) + '%' }" :title="`${d.day}: ${d.consumed}`" />
            <div class="bar-label">{{ d.day.slice(5) }}</div>
            <div class="bar-val">{{ d.consumed }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 排行 -->
    <el-row :gutter="16">
      <el-col :span="12" v-if="data.topTenants">
        <el-card header="租户算力排行 TOP5">
          <div v-for="(t, i) in data.topTenants" :key="t.id" class="rank-item">
            <span class="rank-idx">{{ i + 1 }}</span>
            <span class="rank-name">{{ t.name }}</span>
            <span class="rank-val">{{ t.credits }}</span>
          </div>
          <el-empty v-if="!data.topTenants?.length" description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="最近流水">
          <div v-for="(f, i) in (data.recentFlows || []).slice(0, 10)" :key="i" class="flow-item">
            <el-tag :type="f.amount > 0 ? 'success' : 'danger'" size="small">{{ f.type === 'TENANT_RECHARGE' ? '充值' : '消耗' }}</el-tag>
            <span class="flow-desc">{{ f.description || f.tenantName }}</span>
            <span :class="f.amount > 0 ? 'flow-plus' : 'flow-minus'">{{ f.amount > 0 ? '+' : '' }}{{ f.amount }}</span>
          </div>
          <el-empty v-if="!data.recentFlows?.length" description="暂无流水" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'

const { apiFetch, userRole } = useAuth()
const isSuperAdmin = computed(() => userRole.value === 'SUPER_ADMIN')

const data = ref<any>({})

const overviewCards = computed(() => {
  if (isSuperAdmin.value) return [
    { label: '租户总数', value: data.value.tenantTotal ?? '-', sub: `活跃 ${data.value.tenantActive ?? '-'}`, color: '#409EFF' },
    { label: '平台总充值', value: data.value.totalRecharge?.toLocaleString() ?? '-', sub: '累计算力', color: '#67C23A' },
    { label: '近7天消耗', value: data.value.weekConsume?.toLocaleString() ?? '-', sub: '平台算力消耗', color: '#F56C6C' },
    { label: '近7天日均', value: data.value.weekConsume ? Math.round(data.value.weekConsume / 7).toLocaleString() : '-', sub: '日均消耗', color: '#E6A23C' },
  ]
  return [
    { label: '可用算力', value: data.value.credits?.toLocaleString() ?? '-', sub: `已分配 ${(data.value.allocated || 0).toLocaleString()}`, color: '#409EFF' },
    { label: '累计获得', value: (data.value.totalRecharge || 0).toLocaleString(), sub: '平台充值总额', color: '#67C23A' },
    { label: '近7天消耗', value: (data.value.consume?.week || 0).toLocaleString(), sub: `本月 ${(data.value.consume?.month || 0).toLocaleString()}`, color: '#F56C6C' },
    { label: '今日消耗', value: (data.value.consume?.today || 0).toLocaleString(), sub: `昨日 ${(data.value.consume?.yesterday || 0).toLocaleString()}`, color: '#E6A23C' },
  ]
})

function barHeight(v: number) {
  const max = Math.max(...(data.value.dailyConsume || []).map((d: any) => d.consumed), 1)
  return Math.round((v / max) * 100)
}

onMounted(async () => {
  const url = isSuperAdmin.value ? '/api/admin/dashboard' : '/api/tenant/dashboard'
  const res = await apiFetch(url)
  if (res.ok) data.value = await res.json()
})
</script>

<style scoped>
.card-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.card-value { font-size: 28px; font-weight: bold; }
.card-sub { font-size: 12px; color: #c0c4cc; margin-top: 4px; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.stat-num { font-size: 22px; font-weight: bold; }
.stat-num.red { color: #F56C6C; }
.bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 100px; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
.bar { width: 100%; max-width: 40px; background: #409EFF; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
.bar-label { font-size: 10px; color: #909399; margin-top: 4px; }
.bar-val { font-size: 10px; color: #606266; }
.rank-item { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
.rank-idx { width: 24px; color: #909399; font-weight: bold; }
.rank-name { flex: 1; }
.rank-val { font-weight: bold; color: #409EFF; }
.flow-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.flow-desc { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-plus { color: #67C23A; font-weight: bold; }
.flow-minus { color: #F56C6C; font-weight: bold; }
</style>
