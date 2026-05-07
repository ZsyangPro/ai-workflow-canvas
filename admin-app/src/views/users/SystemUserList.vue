<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>系统用户管理</h2>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </div>
    <el-table :data="users" border stripe v-loading="loading">
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="role" label="角色">
        <template #default="{ row }"><el-tag>{{ row.role }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="credits" label="算力" />
      <el-table-column prop="tenantId" label="绑定租户" width="200">
        <template #default="{ row }">{{ row.tenantId || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)" :disabled="row.id === user?.id">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog :title="editingId ? '编辑用户' : '新建用户'" v-model="dialogVisible">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名" required><el-input v-model="form.username" :disabled="!!editingId" /></el-form-item>
        <el-form-item label="密码" :required="!editingId"><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item label="角色" required><el-select v-model="form.role"><el-option label="总后台" value="SUPER_ADMIN" /><el-option label="租户管理员" value="TENANT_ADMIN" /><el-option label="普通用户" value="USER" /></el-select></el-form-item>
        <el-form-item label="租户" v-if="form.role === 'TENANT_ADMIN'"><el-input v-model="form.tenantId" placeholder="租户ID" /></el-form-item>
        <el-form-item label="主体"><el-input v-model="form.subjectId" placeholder="主体ID（可选）" /></el-form-item>
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

const { apiFetch, currentUser } = useAuth()
const user = currentUser
const users = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingId = ref(0)
const saving = ref(false)
const form = reactive({ username: '', password: '', role: 'USER', tenantId: '', subjectId: '' })

async function fetchList() {
  loading.value = true
  const res = await apiFetch('/api/users')
  if (res.ok) { const d = await res.json(); users.value = d.users }
  loading.value = false
}

function openCreate() { Object.assign(form, { username: '', password: '', role: 'USER', tenantId: '', subjectId: '' }); editingId.value = 0; dialogVisible.value = true }
function openEdit(row: any) { Object.assign(form, row); editingId.value = row.id; dialogVisible.value = true }

async function handleSave() {
  saving.value = true
  const url = editingId.value ? `/api/users/${editingId.value}` : '/api/users'
  const method = editingId.value ? 'PATCH' : 'POST'
  const res = await apiFetch(url, { method, body: JSON.stringify(form) })
  saving.value = false
  if (res.ok) { dialogVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

async function handleDelete(id: number) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
  ElMessage.success('已删除')
  fetchList()
}

onMounted(fetchList)
</script>
