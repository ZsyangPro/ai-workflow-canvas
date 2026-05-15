<template>
  <div>
    <el-form-item label="大标题"><el-input v-model="heading" /></el-form-item>
    <el-form-item label="副标题"><el-input v-model="subheading" type="textarea" :rows="2" /></el-form-item>
    <el-form-item label="按钮文字"><el-input v-model="ctaText" /></el-form-item>
    <el-form-item label="按钮链接"><el-input v-model="ctaUrl" placeholder="留空则跳转登录" /></el-form-item>
    <el-form-item label="对齐方式">
      <el-radio-group v-model="alignment">
        <el-radio value="center">居中</el-radio>
        <el-radio value="left">左对齐</el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="背景色"><el-color-picker v-model="bgColor" /></el-form-item>
    <el-form-item label="背景图">
      <ImageUpload v-model="bgImage" />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ImageUpload from './ImageUpload.vue'

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const heading = ref(props.modelValue.heading || '')
const subheading = ref(props.modelValue.subheading || '')
const ctaText = ref(props.modelValue.ctaText || '')
const ctaUrl = ref(props.modelValue.ctaUrl || '')
const alignment = ref(props.modelValue.alignment || 'center')
const bgColor = ref(props.modelValue.bgColor || '#1e293b')
const bgImage = ref(props.modelValue.bgImage || '')

function emitAll() {
  emit('update:modelValue', {
    heading: heading.value,
    subheading: subheading.value,
    ctaText: ctaText.value,
    ctaUrl: ctaUrl.value,
    alignment: alignment.value,
    bgColor: bgColor.value,
    bgImage: bgImage.value,
  })
}

watch([heading, subheading, ctaText, ctaUrl, alignment, bgColor, bgImage], emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  heading.value = v.heading || ''
  subheading.value = v.subheading || ''
  ctaText.value = v.ctaText || ''
  ctaUrl.value = v.ctaUrl || ''
  alignment.value = v.alignment || 'center'
  bgColor.value = v.bgColor || '#1e293b'
  bgImage.value = v.bgImage || ''
})
</script>
