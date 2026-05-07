<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>用户管理</h2>
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
    <!-- 分配/回收 -->
    <el-dialog title="给用户分配/回收" v-model="allocateVisible">
      <el-form label-width="100px">
        <el-form-item label="来源"><el-select v-model="allocateSource"><el-option label="租户余额" value="tenant" /><el-option label="主体余额" value="subject" /></el-select></el-form-item>
        <el-form-item label="主体" v-if="allocateSource === 'subject'"><el-select v-model="allocateSubjectId" filterable placeholder="选择主体" @focus="loadSubjects"><el-option v-for="s in subjects" :key="s.id" :label="`${s.name} (${s.credits})`" :value="s.id" /></el-select></el-form-item>
        <el-form-item label="金额（正数分配，负数回收）"><el-input-number v-model="allocateAmount" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="allocateVisible=false">取消</el-button><el-button type="primary" @click="handleAllocate">确认</el-button></template>
    </el-dialog>
    <!-- 编辑用户 -->
    <el-dialog title="编辑用户" v-model="editVisible">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="用户名"><el-input :model-value="editForm.username" disabled /></el-form-item>
        <el-form-item label="绑定主体">
          <el-select v-model="editForm.subjectId" filterable placeholder="选择主体（可清空）" clearable @focus="loadSubjects">
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
const allocateVisible = ref(false); const editVisible = ref(false)
const allocateAmount = ref(0); const allocateUserId = ref(0); const allocateSource = ref('tenant'); const allocateSubjectId = ref('')
const editForm = ref({ id: 0, username: '', subjectId: '' as string | null })

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
function openEdit(row: any) { editForm.value = { id: row.id, username: row.username, subjectId: row.subjectId || '' }; editVisible.value = true; loadSubjects() }
async function handleEditSave() {
  const res = await apiFetch(`/api/tenant/users/${editForm.value.id}`, { method: 'PATCH', body: JSON.stringify({ subjectId: editForm.value.subjectId || null }) })
  if (res.ok) { editVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
onMounted(fetchList)
</script>
