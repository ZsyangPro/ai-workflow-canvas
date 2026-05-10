<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>用户管理</h2>
      <el-button type="primary" @click="openCreate" v-if="canEdit">新建用户</el-button>
    </div>
    <el-table :data="users" border stripe v-loading="loading">
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="credits" label="算力" />
      <el-table-column prop="subjectId" label="所属主体" width="200"><template #default="{ row }">{{ row.subjectId ? row.subjectId.slice(0, 8) + '...' : '未绑定' }}</template></el-table-column>
      <el-table-column label="操作" width="200" v-if="canEdit">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openAllocate(row)">分配/回收</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 新建用户 -->
    <el-dialog title="新建用户" v-model="createVisible" width="400px">
      <el-form :model="createForm" label-width="70px">
        <el-form-item label="用户名" required><el-input v-model="createForm.username" /></el-form-item>
        <el-form-item label="密码" required><el-input v-model="createForm.password" type="password" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="handleCreate">创建</el-button></template>
    </el-dialog>
    <!-- 分配/回收 -->
    <el-dialog title="给用户分配/回收" v-model="allocateVisible" width="420px">
      <el-form label-width="50px">
        <el-form-item label="来源"><el-select v-model="allocateSource" style="width:100%"><el-option label="租户余额" value="tenant" /><el-option label="主体余额" value="subject" /></el-select></el-form-item>
        <el-form-item label="主体" v-if="allocateSource === 'subject'"><el-select v-model="allocateSubjectId" filterable placeholder="选择主体" @focus="loadSubjects" style="width:100%"><el-option v-for="s in subjects" :key="s.id" :label="`${s.name} (${s.credits})`" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="allocateAmount" style="width:100%" />
          <div style="color:#999;font-size:12px;margin-top:4px">正数分配，负数回收</div>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="allocateVisible=false">取消</el-button><el-button type="primary" @click="handleAllocate">确认</el-button></template>
    </el-dialog>
    <!-- 编辑用户 -->
    <el-dialog title="编辑用户" v-model="editVisible" width="420px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="用户名"><el-input v-model="editForm.username" /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="editForm.password" type="password" placeholder="留空表示不修改" /></el-form-item>
        <el-form-item label="绑定主体">
          <el-select v-model="editForm.subjectId" filterable placeholder="选择主体" clearable @focus="loadSubjects" style="width:100%">
            <el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" @click="handleEditSave">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch, userRole } = useAuth()
const hasSelectedTenant = computed(() => !!localStorage.getItem('admin_selected_tenant'))
const canEdit = computed(() => userRole.value === 'TENANT_ADMIN' || (userRole.value === 'SUPER_ADMIN' && hasSelectedTenant.value))
const users = ref<any[]>([])
const subjects = ref<any[]>([])
const loading = ref(false)
const allocateVisible = ref(false); const editVisible = ref(false); const createVisible = ref(false)
const allocateAmount = ref(0); const allocateUserId = ref(0); const allocateSource = ref('tenant'); const allocateSubjectId = ref('')
const createForm = ref({ username: '', password: '' })
const editForm = ref({ id: 0, username: '', password: '', subjectId: '' as string | null })

async function fetchList() {
  loading.value = true
  const url = userRole.value === 'TENANT_ADMIN' || hasSelectedTenant.value ? '/api/tenant/users' : '/api/users'
  const res = await apiFetch(url)
  if (res.ok) { const d = await res.json(); users.value = d.users }
  loading.value = false
}
async function loadSubjects() {
  const res = await apiFetch('/api/tenant/subjects')
  if (res.ok) { const d = await res.json(); subjects.value = d.subjects }
}
function openAllocate(row: any) { allocateUserId.value = row.id; allocateAmount.value = 0; allocateSource.value = 'tenant'; allocateSubjectId.value = ''; allocateVisible.value = true; loadSubjects() }
async function handleAllocate() {
  const url = allocateSource.value === 'subject'
    ? `/api/tenant/subjects/${allocateSubjectId.value}/users/${allocateUserId.value}/allocate`
    : `/api/tenant/users/${allocateUserId.value}/allocate`
  const res = await apiFetch(url, { method: 'POST', body: JSON.stringify({ amount: allocateAmount.value }) })
  if (res.ok) { allocateVisible.value = false; fetchList(); ElMessage.success('分配成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
function openCreate() { createForm.value = { username: '', password: '' }; createVisible.value = true }
async function handleCreate() {
  if (!createForm.value.username || !createForm.value.password) { ElMessage.error('用户名和密码不能为空'); return }
  const res = await apiFetch('/api/tenant/users', { method: 'POST', body: JSON.stringify(createForm.value) })
  if (res.ok) { createVisible.value = false; fetchList(); ElMessage.success('创建成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
function openEdit(row: any) { editForm.value = { id: row.id, username: row.username, password: '', subjectId: row.subjectId || '' }; editVisible.value = true; loadSubjects() }
async function handleEditSave() {
  const body: Record<string, unknown> = { username: editForm.value.username, subjectId: editForm.value.subjectId || null }
  if (editForm.value.password) body.password = editForm.value.password
  const res = await apiFetch(`/api/tenant/users/${editForm.value.id}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (res.ok) { editVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
onMounted(fetchList)
</script>
