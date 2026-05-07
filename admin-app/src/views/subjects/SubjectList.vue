<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>主体管理</h2>
      <el-button v-if="canEdit" type="primary" @click="openCreate">新建主体</el-button>
    </div>
    <el-alert v-if="!canEdit && !hasSelectedTenant" title="请先通过顶部租户选择器选择一个租户" type="info" show-icon style="margin-bottom:16px" />
    <el-table :data="subjects" border stripe v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="status" label="状态" />
      <el-table-column prop="credits" label="算力余额" />
      <el-table-column prop="contactPerson" label="联系人" />
      <el-table-column prop="contactPhone" label="电话" />
      <el-table-column label="操作" width="360" v-if="canEdit">
        <template #default="{ row }">
          <el-button size="small" @click="openAllocate(row)">租户→主体分配</el-button>
          <el-button size="small" @click="openAllocateToUser(row)">主体→用户分配</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 新建/编辑 -->
    <el-dialog :title="editingId ? '编辑主体' : '新建主体'" v-model="dialogVisible">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="正常" value="1" /><el-option label="禁用" value="0" /></el-select></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contactPerson" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.contactPhone" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
    <!-- 租户→主体 -->
    <el-dialog title="租户→主体分配算力" v-model="allocateVisible">
      <el-form label-width="100px"><el-form-item label="金额"><el-input-number v-model="allocateAmount" :min="1" /></el-form-item></el-form>
      <template #footer><el-button @click="allocateVisible=false">取消</el-button><el-button type="primary" @click="handleTenantAllocate">确认</el-button></template>
    </el-dialog>
    <!-- 主体→用户 -->
    <el-dialog title="主体→用户分配算力" v-model="allocateUserVisible">
      <el-form label-width="100px">
        <el-form-item label="用户"><el-select v-model="allocateUserId" filterable placeholder="选择用户" @focus="loadTenantUsers" style="width:100%"><el-option v-for="u in tenantUsers" :key="u.id" :label="`${u.username} (余额:${u.credits})`" :value="u.id" /></el-select></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="allocateAmount" :min="1" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="allocateUserVisible=false">取消</el-button><el-button type="primary" @click="handleSubjectAllocate">确认</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch, userRole } = useAuth()
const hasSelectedTenant = computed(() => !!localStorage.getItem('admin_selected_tenant'))
// TENANT_ADMIN 或选了租户的 SUPER_ADMIN 可以编辑
const canEdit = computed(() => userRole.value === 'TENANT_ADMIN' || (userRole.value === 'SUPER_ADMIN' && hasSelectedTenant.value))
const subjects = ref<any[]>([])
const tenantUsers = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false); const allocateVisible = ref(false); const allocateUserVisible = ref(false)
const editingId = ref(''); const allocateAmount = ref(0); const allocateSubjectId = ref(''); const allocateUserId = ref<number | null>(null)
const form = reactive({ name: '', status: '1', contactPerson: '', contactPhone: '' })

async function fetchList() {
  loading.value = true
  const res = await apiFetch('/api/tenant/subjects')
  if (res.ok) { const d = await res.json(); subjects.value = d.subjects }
  loading.value = false
}
async function loadTenantUsers() {
  const res = await apiFetch('/api/tenant/users?limit=200')
  if (res.ok) { const d = await res.json(); tenantUsers.value = d.users }
}
function openCreate() { Object.assign(form, { name: '', status: '1', contactPerson: '', contactPhone: '' }); editingId.value = ''; dialogVisible.value = true }
function openEdit(row: any) { Object.assign(form, { name: row.name, status: row.status, contactPerson: row.contactPerson || '', contactPhone: row.contactPhone || '' }); editingId.value = row.id; dialogVisible.value = true }
async function handleSave() {
  const url = editingId.value ? `/api/tenant/subjects/${editingId.value}` : '/api/tenant/subjects'
  const method = editingId.value ? 'PATCH' : 'POST'
  const res = await apiFetch(url, { method, body: JSON.stringify(form) })
  if (res.ok) { dialogVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await apiFetch(`/api/tenant/subjects/${id}`, { method: 'DELETE' }); ElMessage.success('已删除'); fetchList()
}
function openAllocate(row: any) { allocateSubjectId.value = row.id; allocateAmount.value = 0; allocateVisible.value = true }
async function handleTenantAllocate() {
  const res = await apiFetch(`/api/tenant/subjects/${allocateSubjectId.value}/allocate`, { method: 'POST', body: JSON.stringify({ amount: allocateAmount.value }) })
  if (res.ok) { allocateVisible.value = false; fetchList(); ElMessage.success('分配成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
function openAllocateToUser(row: any) { allocateSubjectId.value = row.id; allocateAmount.value = 0; allocateUserId.value = null; allocateUserVisible.value = true; loadTenantUsers() }
async function handleSubjectAllocate() {
  if (!allocateUserId.value) { ElMessage.error('请选择用户'); return }
  const res = await apiFetch(`/api/tenant/subjects/${allocateSubjectId.value}/users/${allocateUserId.value}/allocate`, { method: 'POST', body: JSON.stringify({ amount: allocateAmount.value }) })
  if (res.ok) { allocateUserVisible.value = false; fetchList(); ElMessage.success('分配成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}
onMounted(fetchList)
</script>
