<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>模型定价</h2>
      <el-button v-if="canEdit" type="primary" @click="openSet">设置定价</el-button>
    </div>
    <el-table :data="pricings" border stripe v-loading="loading">
      <el-table-column prop="model.name" label="模型名称" />
      <el-table-column prop="model.costCredits" label="平台定价" />
      <el-table-column prop="computing" label="租户定价" />
      <el-table-column label="操作" width="160" v-if="canEdit">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">修改</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.modelId)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog title="设置模型定价" v-model="dialogVisible">
      <el-form label-width="100px">
        <el-form-item label="模型">
          <el-select v-model="form.modelId" filterable placeholder="选择模型" :disabled="!!editingModelId">
            <el-option v-for="m in allModels" :key="m.id" :label="`${m.name} (平台:${m.costCredits})`" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="定价"><el-input-number v-model="form.computing" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch, userRole } = useAuth()
const hasSelectedTenant = computed(() => !!localStorage.getItem('admin_selected_tenant'))
const canEdit = computed(() => userRole.value === 'TENANT_ADMIN' || (userRole.value === 'SUPER_ADMIN' && hasSelectedTenant.value))
const pricings = ref<any[]>([])
const allModels = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingModelId = ref(0)
const form = reactive({ modelId: 0, computing: 10 })

async function fetchList() {
  loading.value = true
  const [pRes, mRes] = await Promise.all([apiFetch('/api/tenant/model-pricing'), apiFetch('/api/models')])
  if (pRes.ok) { const d = await pRes.json(); pricings.value = d.pricings }
  if (mRes.ok) { const d = await mRes.json(); allModels.value = d.models }
  loading.value = false
}

function openSet() { editingModelId.value = 0; form.modelId = 0; form.computing = 10; dialogVisible.value = true }
function openEdit(row: any) { editingModelId.value = row.modelId; form.modelId = row.modelId; form.computing = row.computing; dialogVisible.value = true }

async function handleSave() {
  const res = await apiFetch('/api/tenant/model-pricing', { method: 'POST', body: JSON.stringify({ modelId: form.modelId, computing: form.computing }) })
  if (res.ok) { dialogVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

async function handleDelete(modelId: number) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await apiFetch(`/api/tenant/model-pricing/${modelId}`, { method: 'DELETE' })
  ElMessage.success('已删除')
  fetchList()
}

onMounted(fetchList)
</script>
