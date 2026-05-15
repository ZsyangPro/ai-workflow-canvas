<template>
  <div>
    <el-form-item label="标题"><el-input v-model="heading" /></el-form-item>
    <el-form-item label="副标题"><el-input v-model="subheading" /></el-form-item>
    <el-form-item label="按钮文字"><el-input v-model="btnText" /></el-form-item>
    <el-form-item label="按钮链接"><el-input v-model="btnUrl" /></el-form-item>
    <el-form-item label="背景色"><el-color-picker v-model="bgColor" /></el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const heading = ref(props.modelValue.heading || '')
const subheading = ref(props.modelValue.subheading || '')
const btnText = ref(props.modelValue.btnText || '')
const btnUrl = ref(props.modelValue.btnUrl || '')
const bgColor = ref(props.modelValue.bgColor || '#1d4ed8')

function emitAll() {
  emit('update:modelValue', { heading: heading.value, subheading: subheading.value, btnText: btnText.value, btnUrl: btnUrl.value, bgColor: bgColor.value })
}

watch([heading, subheading, btnText, btnUrl, bgColor], emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  heading.value = v.heading || ''
  subheading.value = v.subheading || ''
  btnText.value = v.btnText || ''
  btnUrl.value = v.btnUrl || ''
  bgColor.value = v.bgColor || '#1d4ed8'
})
</script>
