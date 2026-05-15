<template>
  <div>
    <el-form-item label="自动播放间隔(ms)">
      <el-input-number v-model="interval" :min="1000" :max="10000" :step="500" />
    </el-form-item>
    <el-form-item label="轮播图片">
      <div v-for="(img, i) in images" :key="i" style="margin-bottom: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px;color:#6b7280;">图片 {{ i + 1 }}</span>
          <el-button size="small" text type="danger" @click="removeImage(i)">删除</el-button>
        </div>
        <ImageUpload :model-value="img.url || ''" @update:model-value="(v: string) => updateUrl(i, v)" />
        <el-input v-model="img.alt" placeholder="替代文字" size="small" style="margin-top: 8px;" @change="emitAll" />
        <el-input v-model="img.link" placeholder="点击跳转链接(可选)" size="small" style="margin-top: 4px;" @change="emitAll" />
      </div>
      <el-button size="small" @click="addImage">+ 添加图片</el-button>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ImageUpload from './ImageUpload.vue'

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits(['update:modelValue'])

const images = ref<any[]>((props.modelValue.images || []).map((it: any) => ({ ...it })))
const interval = ref(props.modelValue.interval || 4000)

function emitAll() {
  emit('update:modelValue', { images: images.value, interval: interval.value })
}

watch(interval, emitAll)

watch(() => props.modelValue, (v) => {
  if (!v) return
  images.value = (v.images || []).map((it: any) => ({ ...it }))
  interval.value = v.interval || 4000
})

function updateUrl(i: number, url: string) {
  images.value = images.value.map((img: any, idx: number) => idx === i ? { ...img, url } : img)
  emitAll()
}
function addImage() { images.value = [...images.value, { url: '', alt: '', link: '' }]; emitAll() }
function removeImage(i: number) { images.value = images.value.filter((_: any, idx: number) => idx !== i); emitAll() }
</script>
