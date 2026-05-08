<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>AI模型管理</h2>
      <el-button type="primary" @click="openCreate">新建模型</el-button>
    </div>
    <el-table :data="models" border stripe v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="provider" label="供应商" />
      <el-table-column prop="modelName" label="模型标识" />
      <el-table-column prop="category" label="类型" />
      <el-table-column prop="costCredits" label="消耗算力" />
      <el-table-column prop="enabled" label="状态">
        <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'danger'">{{ row.enabled ? '启用' : '禁用' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog :title="editingId ? '编辑模型' : '新建模型'" v-model="dialogVisible">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="供应商"><el-select v-model="form.provider"><el-option label="Sophnet" value="sophnet" /><el-option label="Seedream" value="seedream" /><el-option label="GPT-Image" value="gpt-image" /><el-option label="Sophnet-Gemini" value="sophnet-gemini" /></el-select></el-form-item>
        <el-form-item label="模型标识" required><el-input v-model="form.modelName" /></el-form-item>
        <el-form-item label="API Key" required><el-input v-model="form.apiKey" type="password" show-password /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="form.baseUrl" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.category"><el-option label="图片" value="image" /><el-option label="视频" value="video" /></el-select></el-form-item>
        <el-form-item label="消耗算力"><el-input-number v-model="form.costCredits" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch } = useAuth()
const models = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingId = ref(0)
const saving = ref(false)
const form = reactive({ name: '', provider: 'sophnet', modelName: '', apiKey: '', baseUrl: '', category: 'image', costCredits: 1, enabled: true })

async function fetchList() {
  loading.value = true
  const res = await apiFetch('/api/models')
  if (res.ok) { const d = await res.json(); models.value = d.models }
  loading.value = false
}

function openCreate() { Object.assign(form, { name: '', provider: 'sophnet', modelName: '', apiKey: '', baseUrl: '', category: 'image', costCredits: 1, enabled: true }); editingId.value = 0; dialogVisible.value = true }
function openEdit(row: any) { Object.assign(form, { name: row.name, provider: row.provider, modelName: row.modelName, apiKey: '', baseUrl: row.baseUrl, category: row.category, costCredits: row.costCredits, enabled: row.enabled, description: row.description || '' }); editingId.value = row.id; dialogVisible.value = true }

async function handleSave() {
  saving.value = true
  const url = editingId.value ? `/api/models/${editingId.value}` : '/api/models'
  const method = editingId.value ? 'PATCH' : 'POST'
  const res = await apiFetch(url, { method, body: JSON.stringify(form) })
  saving.value = false
  if (res.ok) { dialogVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

async function handleDelete(id: number) {
  await ElMessageBox.confirm('确认删除此模型？', '提示', { type: 'warning' })
  await apiFetch(`/api/models/${id}`, { method: 'DELETE' })
  ElMessage.success('已删除')
  fetchList()
}

onMounted(fetchList)
</script>
