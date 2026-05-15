<template>
  <div class="portal-editor" style="display:flex; height: calc(100vh - 120px); gap: 0;">
    <!-- 左侧：区块列表 -->
    <div style="width: 320px; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; background: #fff;">
      <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">页面区块</h3>
        <el-button type="primary" size="small" @click="showAddMenu = true">添加区块</el-button>
      </div>

      <!-- 区块列表 -->
      <div style="flex: 1; overflow-y: auto; padding: 8px;">
        <div v-if="!tenantReady" style="text-align: center; color: #f59e0b; padding: 40px 16px;">
          ⚠️ 请先在顶部下拉框中选择一个租户
        </div>
        <div v-else-if="blocks.length === 0" style="text-align: center; color: #9ca3af; padding: 40px 16px;">
          暂无区块，点击"添加区块"开始搭建
        </div>
        <div
          v-for="(block, index) in blocks"
          :key="block.id"
          :class="['block-item', { active: selectedId === block.id, 'drag-over': dragOverIndex === index }]"
          draggable="true"
          @click="selectBlock(block)"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent="onDragOver(index)"
          @dragleave="onDragLeave"
          @drop="onDrop(index)"
          @dragend="dragIndex = null; dragOverIndex = null"
        >
          <div class="block-drag-handle">⋮⋮</div>
          <div class="block-info">
            <div class="block-summary">{{ summary(block) }}</div>
            <span class="block-type-tag">{{ typeLabel(block.type) }}</span>
          </div>
          <div class="block-actions">
            <el-switch v-model="block.enabled" size="small" @change="toggleBlock(block)" />
            <el-button :icon="Delete" size="small" text type="danger" @click.stop="deleteBlock(block)" />
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧：配置面板 -->
    <div style="flex: 1; overflow-y: auto; background: #f9fafb; padding: 24px;">
      <!-- 页头设置 — 始终可见 -->
      <div style="margin-bottom: 20px; padding: 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: #374151;">页头设置</span>
        <div style="display: flex; align-items: center; gap: 12px; margin-top: 10px;">
          <img v-if="siteLogo" :src="siteLogo" style="height: 36px; width: auto; object-fit: contain;" />
          <div v-else style="height: 36px; width: 80px; border: 1px dashed #d1d5db; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #9ca3af;">无Logo</div>
          <div style="flex:1">
            <input ref="logoInput" type="file" accept="image/*" style="display:none" @change="uploadLogo" />
            <el-button size="small" @click="($refs.logoInput as HTMLInputElement).click()">{{ siteLogo ? '更换Logo' : '上传Logo' }}</el-button>
            <el-button v-if="siteLogo" size="small" text type="danger" @click="clearLogo">清除</el-button>
          </div>
        </div>
      </div>

      <div v-if="!selectedBlock" style="text-align: center; color: #9ca3af; padding-top: 60px;">
        <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
        <p>选择一个区块进行配置</p>
      </div>

      <template v-else>
        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">
          编辑「{{ typeLabel(selectedBlock.type) }}」
        </h3>
        <el-form label-position="top" size="default">
          <HeroConfig v-if="selectedBlock.type === 'hero'" v-model="editConfig" />
          <BannerConfig v-else-if="selectedBlock.type === 'banner'" v-model="editConfig" />
          <FeaturesConfig v-else-if="selectedBlock.type === 'features'" v-model="editConfig" />
          <ModelsConfig v-else-if="selectedBlock.type === 'models'" v-model="editConfig" />
          <StatsConfig v-else-if="selectedBlock.type === 'stats'" v-model="editConfig" />
          <CtaConfig v-else-if="selectedBlock.type === 'cta'" v-model="editConfig" />
          <DividerConfig v-else-if="selectedBlock.type === 'divider'" v-model="editConfig" />
          <CarouselConfig v-else-if="selectedBlock.type === 'carousel'" v-model="editConfig" />
        </el-form>
        <div style="margin-top: 16px;">
          <el-button type="primary" @click="saveBlock">保存</el-button>
        </div>
      </template>
    </div>

    <!-- 添加区块弹窗 -->
    <el-dialog v-model="showAddMenu" title="选择区块类型" width="480px">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div
          v-for="t in blockTypes"
          :key="t.type"
          style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;"
          :style="{ borderColor: t.type === addType ? '#409EFF' : '#e5e7eb' }"
          @click="addType = t.type"
        >
          <div style="font-size: 20px; margin-bottom: 4px;">{{ t.icon }}</div>
          <div style="font-weight: 600; font-size: 14px;">{{ t.label }}</div>
          <div style="font-size: 12px; color: #9ca3af;">{{ t.desc }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showAddMenu = false">取消</el-button>
        <el-button type="primary" :disabled="!addType" @click="addBlock">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { useAuth } from '../../composables/useAuth'
import { ElMessage, ElMessageBox } from 'element-plus'
import HeroConfig from './HeroConfig.vue'
import BannerConfig from './BannerConfig.vue'
import FeaturesConfig from './FeaturesConfig.vue'
import ModelsConfig from './ModelsConfig.vue'
import StatsConfig from './StatsConfig.vue'
import CtaConfig from './CtaConfig.vue'
import DividerConfig from './DividerConfig.vue'
import CarouselConfig from './CarouselConfig.vue'

const { apiFetch, currentUser, userRole } = useAuth()

const blockTypes = [
  { type: 'hero', label: 'Hero 大标题', icon: '🎯', desc: '大标题+副标题+CTA按钮+背景' },
  { type: 'banner', label: 'Banner 横幅', icon: '🖼️', desc: '全宽图片展示' },
  { type: 'features', label: 'Features 特性', icon: '✨', desc: '图标+标题+描述的卡片网格' },
  { type: 'models', label: 'Models 模型', icon: '🤖', desc: 'AI模型能力卡片' },
  { type: 'stats', label: 'Stats 统计', icon: '📊', desc: '数字统计展示' },
  { type: 'cta', label: 'CTA 行动号召', icon: '🚀', desc: '行动号召按钮区域' },
  { type: 'divider', label: 'Divider 分隔', icon: '⬜', desc: '空白间距' },
  { type: 'carousel', label: 'Carousel 轮播', icon: '🎠', desc: '多图自动轮播+指示器' },
] as const

const defaultConfigs: Record<string, any> = {
  hero: { heading: '欢迎使用AI平台', subheading: '探索AI创作的无限可能', ctaText: '立即体验', ctaUrl: '', bgColor: '#1e293b', bgImage: '', alignment: 'center' },
  banner: { images: [{ url: '', alt: '' }], autoplay: true, interval: 3000 },
  features: { title: '核心能力', columns: 3, items: [{ icon: '🎨', image: '', title: '新功能', desc: '功能描述', link: '' }] },
  models: { title: 'AI能力', columns: 3, modelIds: [] },
  stats: { items: [{ value: '10万+', label: '服务用户' }, { value: '500万+', label: '生成内容' }], bgColor: '#f8fafc' },
  cta: { heading: '准备好开始了吗？', subheading: '', btnText: '免费试用', btnUrl: '', bgColor: '#1d4ed8' },
  divider: { height: 48 },
  carousel: { images: [{ url: '', alt: '', link: '' }], interval: 4000 },
}

const blocks = ref<any[]>([])
const tenantReady = computed(() => !!tenantId())
const siteLogo = ref('')
const selectedId = ref<string | null>(null)
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const selectedBlock = ref<any>(null)
const editConfig = ref<any>(null)
const showAddMenu = ref(false)
const addType = ref('')

function tenantId(): string {
  if (userRole.value === 'TENANT_ADMIN') return currentUser.value?.tenantId || ''
  return localStorage.getItem('admin_selected_tenant') || ''
}

function typeLabel(type: string): string {
  const t = blockTypes.find(b => b.type === type)
  return t ? t.label : type
}

function summary(block: any): string {
  const c = block.config || {}
  if (block.type === 'hero') return c.heading || '无标题'
  if (block.type === 'banner') return `${(c.images || []).filter((i: any) => i.url).length}/${(c.images || []).length} 张图`
  if (block.type === 'features') {
    const t = c.title ? `"${c.title}" · ` : ''
    return `${t}${(c.items || []).length} 卡片`
  }
  if (block.type === 'models') {
    const t = c.title ? `"${c.title}" · ` : ''
    return `${t}${(c.modelIds || []).length} 模型`
  }
  if (block.type === 'stats') {
    const items = c.items || []
    return items.length ? items.map((i: any) => i.value).join(' / ') : '无指标'
  }
  if (block.type === 'cta') return c.heading || '无标题'
  if (block.type === 'divider') return `${c.height || 48}px`
  if (block.type === 'carousel') return `${(c.images || []).filter((i: any) => i.url).length} 张轮播`
  return ''
}

async function loadLogo() {
  const tid = tenantId()
  if (!tid) return
  const res = await apiFetch(`/api/admin/tenants/${tid}`)
  if (res.ok) {
    const data = await res.json()
    siteLogo.value = data.tenant?.logo || ''
  }
}

async function uploadLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  const upRes = await apiFetch('/api/portal/upload', { method: 'POST', body: form })
  if (!upRes.ok) return
  const { url } = await upRes.json()
  const tid = tenantId()
  const patchRes = await apiFetch(`/api/admin/tenants/${tid}`, { method: 'PATCH', body: JSON.stringify({ logo: url }) })
  if (patchRes.ok) {
    siteLogo.value = url
    ElMessage.success('Logo已更新')
  }
}

async function clearLogo() {
  const tid = tenantId()
  const res = await apiFetch(`/api/admin/tenants/${tid}`, { method: 'PATCH', body: JSON.stringify({ logo: '' }) })
  if (res.ok) { siteLogo.value = ''; ElMessage.success('Logo已清除') }
}

async function loadBlocks() {
  const tid = tenantId()
  if (!tid) { blocks.value = []; return }
  const res = await apiFetch(`/api/portal/blocks/${tid}`)
  if (res.ok) blocks.value = await res.json()
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function selectBlock(block: any) {
  selectedId.value = block.id
  selectedBlock.value = block
  editConfig.value = JSON.parse(JSON.stringify(block.config))
}

function onConfigChange() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => saveBlock(true), 600)
}

async function addBlock() {
  if (!addType.value) return
  const tid = tenantId()
  if (!tid) { ElMessage.warning('请先在顶部选择租户'); return }
  const res = await apiFetch(`/api/portal/blocks/${tid}`, {
    method: 'POST',
    body: JSON.stringify({ type: addType.value, config: defaultConfigs[addType.value] }),
  })
  if (res.ok) {
    ElMessage.success('区块已添加')
    showAddMenu.value = false
    addType.value = ''
    await loadBlocks()
  } else {
    ElMessage.error('添加失败')
  }
}

async function saveBlock(silent = false) {
  if (!selectedBlock.value) return
  const tid = tenantId()
  if (!tid) { ElMessage.warning('请先在顶部选择租户'); return }
  const block = selectedBlock.value
  const res = await apiFetch(`/api/portal/blocks/${tid}/${block.id}`, {
    method: 'PUT',
    body: JSON.stringify({ config: editConfig.value }),
  })
  if (res.ok) {
    if (!silent) ElMessage.success('已保存')
    block.config = JSON.parse(JSON.stringify(editConfig.value))
  } else {
    ElMessage.error('保存失败')
  }
}

async function toggleBlock(block: any) {
  const tid = tenantId()
  await apiFetch(`/api/portal/blocks/${tid}/${block.id}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: block.enabled }),
  })
}

async function deleteBlock(block: any) {
  try {
    await ElMessageBox.confirm('确定删除该区块？', '提示', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  const tid = tenantId()
  const res = await apiFetch(`/api/portal/blocks/${tid}/${block.id}`, { method: 'DELETE' })
  if (res.ok) {
    ElMessage.success('已删除')
    if (selectedId.value === block.id) { selectedId.value = null; selectedBlock.value = null }
    await loadBlocks()
  }
}

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number) {
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

async function onDrop(targetIndex: number) {
  if (dragIndex.value === null || dragIndex.value === targetIndex) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const newBlocks = [...blocks.value]
  const [item] = newBlocks.splice(dragIndex.value, 1)
  newBlocks.splice(targetIndex, 0, item)
  const orderedIds = newBlocks.map(b => b.id)
  const tid = tenantId()
  const res = await apiFetch(`/api/portal/blocks/${tid}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds }),
  })
  if (res.ok) {
    blocks.value = newBlocks
  }
  dragIndex.value = null
  dragOverIndex.value = null
}

watch(() => userRole.value, () => { loadBlocks(); loadLogo() })

// 自动保存：editConfig 变化后 600ms 自动保存
watch(editConfig, () => { if (selectedBlock.value) onConfigChange() }, { deep: true })

onMounted(() => { loadBlocks(); loadLogo() })
</script>

<style scoped>
.block-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px;
  margin-bottom: 6px; cursor: pointer; transition: border-color 0.2s;
}
.block-item:hover { border-color: #93c5fd; }
.block-item.active { border-color: #409EFF; background: #eff6ff; }
.block-drag-handle { cursor: grab; color: #9ca3af; font-size: 14px; letter-spacing: -2px; user-select: none; padding: 0 4px; line-height: 1; }
.block-drag-handle:active { cursor: grabbing; }
.block-item.drag-over { border-color: #409EFF; background: #eff6ff; border-style: dashed; }
.block-info { flex: 1; min-width: 0; }
.block-type-tag { display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 3px; background: #dbeafe; color: #1d4ed8; }
.block-summary { font-size: 13px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 1px; font-weight: 500; }
.block-actions { display: flex; align-items: center; gap: 4px; }
</style>
