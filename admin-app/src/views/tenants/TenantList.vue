<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>租户管理</h2>
      <el-button type="primary" @click="openCreate">新建租户</el-button>
    </div>
    <el-table :data="tenants" border stripe v-loading="loading">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="code" label="编码" />
      <el-table-column prop="status" label="状态">
        <template #default="{ row }">
          <el-tag :type="row.status==='ACTIVE'?'success':row.status==='DISABLED'?'danger':'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="credits" label="算力余额" />
      <el-table-column prop="contactPerson" label="联系人" />
      <el-table-column prop="contactPhone" label="电话" />
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <el-button size="small" @click="openRecharge(row)">充值</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 新建/编辑弹窗 -->
    <el-dialog :title="editingId ? '编辑租户' : '新建租户'" v-model="dialogVisible">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="联系人" required><el-input v-model="form.contactPerson" /></el-form-item>
        <el-form-item label="电话" required><el-input v-model="form.contactPhone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.contactEmail" /></el-form-item>
        <el-form-item label="域名"><el-input v-model="form.domain" /></el-form-item>
        <el-form-item label="用户上限"><el-input-number v-model="form.seatNum" :min="0" /></el-form-item>
        <el-form-item label="主体上限"><el-input-number v-model="form.subjectNum" :min="0" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="正常" value="ACTIVE" /><el-option label="禁用" value="DISABLED" /></el-select></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
    <!-- 充值弹窗 -->
    <el-dialog title="租户充值/回收" v-model="rechargeVisible" width="400px">
      <el-form :model="rechargeForm" label-width="60px">
        <el-form-item label="金额">
          <el-input-number v-model="rechargeForm.amount" :max="10000000" style="width:100%" />
          <div style="color:#999;font-size:12px;margin-top:4px">正数充值，负数回收</div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="rechargeForm.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeVisible=false">取消</el-button>
        <el-button type="primary" @click="handleRecharge">确认充值</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch } = useAuth()
const tenants = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const rechargeVisible = ref(false)
const editingId = ref('')
const saving = ref(false)
const form = reactive({ name: '', contactPerson: '', contactPhone: '', contactEmail: '', domain: '', seatNum: 0, subjectNum: 0, status: 'ACTIVE' } as Record<string, any>)
const rechargeForm = reactive({ amount: 0, description: '', tenantId: '' })

async function fetchList() {
  loading.value = true
  const res = await apiFetch('/api/admin/tenants')
  if (res.ok) { const d = await res.json(); tenants.value = d.tenants }
  loading.value = false
}

function openCreate() {
  Object.assign(form, { name: '', contactPerson: '', contactPhone: '', contactEmail: '', domain: '', seatNum: 0, subjectNum: 0, status: 'ACTIVE' })
  editingId.value = ''
  dialogVisible.value = true
}

function openEdit(row: any) {
  Object.assign(form, {
    name: row.name,
    contactPerson: row.contactPerson,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail || '',
    domain: row.domain || '',
    seatNum: row.seatNum,
    subjectNum: row.subjectNum,
    status: row.status,
  })
  editingId.value = row.id
  dialogVisible.value = true
}

async function handleSave() {
  saving.value = true
  const url = editingId.value ? `/api/admin/tenants/${editingId.value}` : '/api/admin/tenants'
  const method = editingId.value ? 'PATCH' : 'POST'
  const res = await apiFetch(url, { method, body: JSON.stringify(form) })
  saving.value = false
  if (res.ok) { dialogVisible.value = false; fetchList(); ElMessage.success('保存成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  const res = await apiFetch(`/api/admin/tenants/${id}`, { method: 'DELETE' })
  if (res.ok) {
    ElMessage.success('已删除')
    fetchList()
  } else {
    const data = await res.json().catch(() => ({}))
    ElMessage.error((data as any).error || '删除失败')
  }
}

function openRecharge(row: any) {
  rechargeForm.amount = 0; rechargeForm.description = ''; rechargeForm.tenantId = row.id
  rechargeVisible.value = true
}

async function handleRecharge() {
  const res = await apiFetch(`/api/admin/tenants/${rechargeForm.tenantId}/recharge`, {
    method: 'POST',
    body: JSON.stringify({ amount: rechargeForm.amount, description: rechargeForm.description }),
  })
  if (res.ok) { rechargeVisible.value = false; fetchList(); ElMessage.success('充值成功') }
  else { const e = await res.json(); ElMessage.error(e.error) }
}

onMounted(fetchList)
</script>
