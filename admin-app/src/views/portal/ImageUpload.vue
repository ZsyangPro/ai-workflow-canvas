<template>
  <div>
    <div v-if="modelValue" class="preview">
      <img :src="modelValue" @click="triggerUpload" />
      <div class="overlay" @click="triggerUpload">点击更换</div>
      <button class="clear-btn" @click.stop="clearImage" title="清除图片">✕</button>
    </div>
    <div v-else class="upload-box" @click="triggerUpload">
      <span style="font-size: 28px; color: #9ca3af;">+</span>
      <span style="font-size: 12px; color: #9ca3af;">上传图片</span>
    </div>
    <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="handleFile" />
    <div v-if="uploading" style="font-size: 12px; color: #409EFF; margin-top: 4px;">上传中...</div>
    <el-input v-model="urlInput" placeholder="或直接输入图片URL" size="small" style="margin-top: 8px;" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuth } from '../../composables/useAuth'

const { apiFetch } = useAuth()

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits(['update:modelValue'])
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)

const urlInput = computed({
  get: () => props.modelValue || '',
  set: (v) => emit('update:modelValue', v),
})

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch('/api/portal/upload', {
      method: 'POST',
      body: form,
    })
    if (res.ok) {
      const data = await res.json()
      emit('update:modelValue', data.url)
      ElMessage.success('上传成功')
    } else {
      const err = await res.json().catch(() => ({ error: '上传失败' }))
      ElMessage.error(err.error || '上传失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '上传失败')
  }
  finally { uploading.value = false; if (input) input.value = '' }
}

function clearImage() {
  emit('update:modelValue', '')
}
</script>

<style scoped>
.upload-box {
  width: 100%; height: 100px; border: 2px dashed #d1d5db; border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; cursor: pointer; transition: border-color 0.2s;
}
.upload-box:hover { border-color: #409EFF; }
.preview {
  position: relative; cursor: pointer; border-radius: 8px; overflow: hidden;
  max-height: 150px;
}
.preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; opacity: 0; transition: opacity 0.2s;
}
.preview:hover .overlay { opacity: 1; }
.clear-btn {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,0.5); color: #fff; border: none;
  font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s;
}
.preview:hover .clear-btn { opacity: 1; }
.clear-btn:hover { background: rgba(220,38,38,0.8); }
</style>
