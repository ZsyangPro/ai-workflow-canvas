<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>文件分类</h2>
      <el-button v-if="canEdit" type="primary" @click="openCreate">新建分类</el-button>
    </div>
    <el-table :data="categories" border stripe v-loading="loading">
      <el-table-column prop="name" label="分类名称" />
      <el-table-column prop="sort" label="排序" />
      <el-table-column prop="createdAt" label="创建时间" width="180"><template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template></el-table-column>
      <el-table-column label="操作" width="120" v-if="canEdit">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog title="新建文件分类" v-model="dialogVisible">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
    <h3 style="margin-top:24px;margin-bottom:12px">文件列表</h3>
    <el-table :data="files" border stripe v-loading="fileLoading">
      <el-table-column prop="filename" label="文件名" />
      <el-table-column prop="mimeType" label="类型" />
      <el-table-column prop="prompt" label="提示词" />
      <el-table-column prop="createdAt" label="创建时间" width="180"><template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template></el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch, userRole } = useAuth()
const hasSelectedTenant = computed(() => !!localStorage.getItem('admin_selected_tenant'))
const canEdit = computed(() => userRole.value === 'TENANT_ADMIN' || (userRole.value === 'SUPER_ADMIN' && hasSelectedTenant.value))
const categories = ref<any[]>([])
const files = ref<any[]>([])
const loading = ref(false)
const fileLoading = ref(false)
const dialogVisible = ref(false)
const form = reactive({ name: '', sort: 0 })

async function fetchCategories() {
  loading.value = true
  const res = await apiFetch('/api/tenant/files/categories')
  if (res.ok) { const d = await res.json(); categories.value = d.categories }
  loading.value = false
}

async function fetchFiles() {
  fileLoading.value = true
  const res = await apiFetch('/api/tenant/files?limit=50')
  if (res.ok) { const d = await res.json(); files.value = d.files }
  fileLoading.value = false
}

function openCreate() { form.name = ''; form.sort = 0; dialogVisible.value = true }

async function handleSave() {
  const res = await apiFetch('/api/tenant/files/categories', { method: 'POST', body: JSON.stringify(form) })
  if (res.ok) { dialogVisible.value = false; fetchCategories(); ElMessage.success('创建成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await apiFetch(`/api/tenant/files/categories/${id}`, { method: 'DELETE' })
  ElMessage.success('已删除')
  fetchCategories()
}

onMounted(() => { fetchCategories(); fetchFiles() })
</script>
