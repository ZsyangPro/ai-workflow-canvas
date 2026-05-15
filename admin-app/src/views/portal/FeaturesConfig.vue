<template>
  <div>
    <el-form-item label="标题"><el-input v-model="title" /></el-form-item>
    <el-form-item label="卡片列数">
      <el-radio-group v-model="columns">
        <el-radio :value="2">2列</el-radio>
        <el-radio :value="3">3列</el-radio>
        <el-radio :value="4">4列</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="卡片列表">
      <div v-for="(item, i) in items" :key="i" style="margin-bottom: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px;color:#6b7280;">卡片 {{ i + 1 }}</span>
          <el-button size="small" text type="danger" @click="removeItem(i)">删除</el-button>
        </div>
        <el-input v-model="item.icon" placeholder="图标 emoji" style="margin-bottom: 8px;" @change="emitAll" />
        <span style="font-size:12px;color:#6b7280;">卡片图片</span>
        <ImageUpload :model-value="item.image || ''" @update:model-value="(v: string) => updateItemImage(i, v)" />
        <el-input v-model="item.title" placeholder="标题" style="margin-bottom: 8px; margin-top: 8px;" @change="emitAll" />
        <el-input v-model="item.desc" placeholder="描述" type="textarea" :rows="2" style="margin-bottom: 8px;" @change="emitAll" />
        <el-input v-model="item.link" placeholder="链接地址" @change="emitAll" />
      </div>
      <el-button size="small" @click="addItem">+ 添加卡片</el-button>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ImageUpload from './ImageUpload.vue'

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const title = ref(props.modelValue.title || '')
const columns = ref(props.modelValue.columns || 3)
const items = ref<any[]>((props.modelValue.items || []).map((it: any) => ({ ...it })))

function emitAll() {
  emit('update:modelValue', { title: title.value, columns: columns.value, items: items.value })
}

watch([title, columns], emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  title.value = v.title || ''
  columns.value = v.columns || 3
  items.value = (v.items || []).map((it: any) => ({ ...it }))
})

function updateItemImage(index: number, url: string) {
  items.value = items.value.map((item: any, i: number) => i === index ? { ...item, image: url } : item)
  emitAll()
}
function addItem() { items.value = [...items.value, { icon: '', image: '', title: '', desc: '', link: '' }]; emitAll() }
function removeItem(i: number) { items.value = items.value.filter((_: any, idx: number) => idx !== i); emitAll() }
</script>
