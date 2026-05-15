<template>
  <div>
    <el-form-item label="Banner图片">
      <ImageUpload v-model="imageUrl" />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ImageUpload from './ImageUpload.vue'

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const imageUrl = ref(((props.modelValue.images || [])[0]?.url) || '')

watch(imageUrl, (v) => {
  emit('update:modelValue', { ...props.modelValue, images: [{ url: v, alt: '' }] })
})

watch(() => props.modelValue, (newVal) => {
  imageUrl.value = ((newVal.images || [])[0]?.url) || ''
})
</script>
