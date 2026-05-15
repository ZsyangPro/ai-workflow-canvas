<template>
  <div>
    <el-form-item label="间距高度 (px)">
      <el-input-number v-model="height" :min="0" :max="240" :step="8" />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])
const height = computed({
  get: () => props.modelValue.height || 48,
  set: (v) => emit('update:modelValue', { height: v }),
})
</script>
