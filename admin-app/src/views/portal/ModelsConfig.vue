<template>
  <div>
    <el-form-item label="标题"><el-input v-model="title" /></el-form-item>
    <el-form-item label="列数">
      <el-radio-group v-model="columns">
        <el-radio :value="2">2列</el-radio>
        <el-radio :value="3">3列</el-radio>
        <el-radio :value="4">4列</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="展示模型">
      <div style="max-height: 300px; overflow-y: auto;">
        <el-checkbox-group v-model="selectedIds">
          <div v-for="m in allModels" :key="m.id" style="margin-bottom: 4px;">
            <el-checkbox :value="m.id" :label="m.id">
              {{ m.name }}
              <span style="font-size:11px;color:#9ca3af;">({{ m.category }})</span>
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
      <div v-if="allModels.length === 0" style="color:#9ca3af;font-size:13px;">暂无可用模型</div>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { apiFetch } = useAuth()

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])
const allModels = ref<any[]>([])

const title = ref(props.modelValue.title || '')
const columns = ref(props.modelValue.columns || 3)
const selectedIds = ref<number[]>([...(props.modelValue.modelIds || [])])

function emitAll() {
  emit('update:modelValue', { title: title.value, columns: columns.value, modelIds: selectedIds.value })
}

watch([title, columns, selectedIds], emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  title.value = v.title || ''
  columns.value = v.columns || 3
  selectedIds.value = [...(v.modelIds || [])]
})

onMounted(async () => {
  const res = await apiFetch('/api/models')
  if (res.ok) {
    const data = await res.json()
    allModels.value = data.models || []
  }
})
</script>
