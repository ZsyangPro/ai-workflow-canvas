<template>
  <div>
    <el-form-item label="背景色"><el-color-picker v-model="bgColor" /></el-form-item>
    <el-form-item label="统计项">
      <div v-for="(item, i) in items" :key="i" style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
        <el-input v-model="item.value" placeholder="数值" style="width:120px;" @change="emitItems" />
        <el-input v-model="item.label" placeholder="描述" style="flex:1;" @change="emitItems" />
        <el-button size="small" text type="danger" @click="removeItem(i)">✕</el-button>
      </div>
      <el-button size="small" @click="addItem">+ 添加指标</el-button>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const items = ref<any[]>((props.modelValue.items || []).map((it: any) => ({ ...it })))
const bgColor = ref(props.modelValue.bgColor || '#f8fafc')

function emitAll() {
  emit('update:modelValue', { ...props.modelValue, items: items.value, bgColor: bgColor.value })
}
function emitItems() { emitAll() }

watch(bgColor, emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  items.value = (v.items || []).map((it: any) => ({ ...it }))
  bgColor.value = v.bgColor || '#f8fafc'
})

function addItem() { items.value = [...items.value, { value: '', label: '' }]; emitAll() }
function removeItem(i: number) { items.value = items.value.filter((_: any, idx: number) => idx !== i); emitAll() }
</script>
