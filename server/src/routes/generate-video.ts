import { Router } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware, AuthPayload } from '../middleware/auth'
import { downloadAndSave } from '../lib/storage'
import { getVideoProvider } from '../lib/providers/video'
import type { VideoGenerateRequest } from '../lib/providers/video-types'

const router = Router()

interface CachedTask {
  status: string
  videoUrl?: string
  lastFrameUrl?: string
  error?: string
  _ts: number // 最后查询 provider API 的时间戳
}

const taskCache = new Map<string, CachedTask>()

const submitSchema = z.object({
  modelId: z.number(),
  canvasId: z.number(),
  nodeId: z.string().optional(),
  prompt: z.string().min(1, '提示词不能为空'),
  duration: z.number().min(2).max(15).optional().default(5),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9'),
  resolution: z.enum(['720p', '1080p']).optional().default('720p'),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  referenceUrls: z.array(z.string()).optional(),
  referenceVideoUrl: z.string().optional(),
  referenceAudioUrl: z.string().optional(),
  generateAudio: z.boolean().optional(),
  save: z.boolean().optional().default(true),
})

// ============================================================
// POST /api/generate-video — 提交视频生成任务
// ============================================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    const body = parsed.data

    const model = await prisma.aiModel.findUnique({ where: { id: body.modelId } })
    if (!model || !model.enabled || model.category !== 'video') {
      res.status(404).json({ error: '模型不存在、已禁用或非视频模型' })
      return
    }

    const canvas = await prisma.canvas.findUnique({ where: { id: body.canvasId } })
    if (!canvas || canvas.userId !== req.user!.userId) {
      res.status(403).json({ error: '画布不存在或无权访问' })
      return
    }

    const costCredits = model.costCredits * body.duration
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user || user.credits < costCredits) {
      res.status(402).json({ error: '算力不足', credits: user?.credits || 0, required: costCredits })
      return
    }

    // 扣费
    await prisma.user.update({
      where: { id: req.user!.userId, credits: { gte: costCredits } },
      data: { credits: { decrement: costCredits } },
    })
    await prisma.creditTransaction.create({
      data: {
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        type: 'GENERATION_DEDUCTION',
        amount: -costCredits,
        relatedModelId: model.id,
        description: `视频生成: ${model.name} (${body.duration}s)`,
      },
    })

    const provider = getVideoProvider(model.provider)
    if (!provider) {
      await refund(req.user!, costCredits, model.id, `provider不存在: ${model.provider}`)
      res.status(500).json({ error: `不支持的视频provider: ${model.provider}` })
      return
    }

    const genReq: VideoGenerateRequest = {
      prompt: body.prompt,
      duration: body.duration,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      firstFrameUrl: body.firstFrameUrl,
      lastFrameUrl: body.lastFrameUrl,
      referenceImageUrls: body.referenceUrls,
      referenceVideoUrl: body.referenceVideoUrl,
      referenceAudioUrl: body.referenceAudioUrl,
      generateAudio: body.generateAudio,
    }

    const { taskId } = await provider.submitTask(
      { baseUrl: model.baseUrl, apiKey: model.apiKey, modelName: model.modelName },
      genReq
    )

    // 持久化到 DB + 缓存
    taskCache.set(taskId, { status: 'running', _ts: Date.now() })
    await prisma.videoTask.create({
      data: {
        taskId,
        userId: req.user!.userId,
        modelId: model.id,
        canvasId: body.canvasId,
        nodeId: body.nodeId || null,
        prompt: body.prompt,
        duration: body.duration,
        costCredits,
      },
    })

    // 后台轮询下载
    if (body.save && provider.waitForResult) {
      pollAndSave(taskId, provider, model, body, req.user!, costCredits)
    }

    const updated = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { credits: true },
    })

    res.json({ taskId, status: 'running', credits: updated?.credits || 0 })
  } catch (e: any) {
    console.error('[generate-video]', e)
    res.status(500).json({ error: e.message || '视频生成请求失败' })
  }
})

// ============================================================
// GET /api/generate-video/:id — 查询任务状态
// Map缓存 → DB兜底 → 回源provider(5s限频)
// ============================================================
router.get('/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string

  // 1. Map 缓存
  const cached = taskCache.get(id)
  if (cached) {
    const age = Date.now() - cached._ts
    const isFinal = cached.status === 'succeeded' || cached.status === 'failed'
    if (isFinal || age < 5000) {
      res.json({ taskId: id, status: cached.status, videoUrl: cached.videoUrl, lastFrameUrl: cached.lastFrameUrl, error: cached.error })
      return
    }
  }

  // 2. 查 DB
  const task = await prisma.videoTask.findUnique({ where: { taskId: id } })
  if (!task) {
    res.status(404).json({ error: '任务不存在或已过期' })
    return
  }

  // 3. 终态直接返回
  if (task.status === 'succeeded') {
    res.json({ taskId: id, status: 'succeeded', videoUrl: task.videoUrl, lastFrameUrl: task.lastFrameUrl })
    return
  }
  if (task.status === 'failed') {
    res.json({ taskId: id, status: 'failed', error: task.refunded ? '已退款' : '视频生成失败' })
    return
  }

  // 4. running → 回源 provider 查询
  const model = await prisma.aiModel.findUnique({ where: { id: task.modelId } })
  if (model) {
    const provider = getVideoProvider(model.provider)
    if (provider) {
      try {
        const result = await provider.queryTask(
          { baseUrl: model.baseUrl, apiKey: model.apiKey, modelName: model.modelName },
          id
        )
        const now = Date.now()
        taskCache.set(id, { ...result, _ts: now })

        if (result.status === 'succeeded' && result.videoUrl) {
          await onTaskSuccess(task, { videoUrl: result.videoUrl, lastFrameUrl: result.lastFrameUrl }, model)
          res.json({ taskId: id, status: 'succeeded', videoUrl: result.videoUrl, lastFrameUrl: result.lastFrameUrl })
          return
        }
        if (result.status === 'failed') {
          await onTaskFailure(task, result.error || '视频生成失败')
          res.json({ taskId: id, status: 'failed', error: result.error })
          return
        }

        res.json({ taskId: id, status: result.status })
        return
      } catch { /* provider查询失败，静默回退 */ }
    }
  }

  res.json({ taskId: id, status: 'running' })
})

// ============================================================
// 后台轮询 + 保存
// ============================================================
async function pollAndSave(
  taskId: string,
  provider: NonNullable<ReturnType<typeof getVideoProvider>>,
  model: { id: number; name: string; modelName: string; baseUrl: string; apiKey: string },
  body: z.infer<typeof submitSchema>,
  user: AuthPayload,
  costCredits: number
) {
  try {
    for await (const event of provider.waitForResult!(
      { baseUrl: model.baseUrl, apiKey: model.apiKey, modelName: model.modelName },
      taskId
    )) {
      if (event.type === 'succeeded') {
        await onTaskSuccess(
          { taskId, canvasId: body.canvasId, nodeId: body.nodeId, userId: user.userId, modelId: model.id, prompt: body.prompt },
          event,
          model
        )
        taskCache.set(taskId, { status: 'succeeded', videoUrl: event.videoUrl, lastFrameUrl: event.lastFrameUrl, _ts: Date.now() })
        return
      }
      if (event.type === 'failed') {
        taskCache.set(taskId, { status: 'failed', error: event.error, _ts: Date.now() })
        const dbTask = await prisma.videoTask.findUnique({ where: { taskId } })
        if (dbTask) await onTaskFailure(dbTask, event.error)
        return
      }
      taskCache.set(taskId, { status: 'running', _ts: Date.now() })
    }
  } catch (e: any) {
    taskCache.set(taskId, { status: 'failed', error: e.message, _ts: Date.now() })
    const dbTask = await prisma.videoTask.findUnique({ where: { taskId } })
    if (dbTask) await onTaskFailure(dbTask, e.message)
  }
}

// ============================================================
// 任务成功：下载视频 + 创建GeneratedAsset + 更新DB
// ============================================================
interface TaskRecord {
  taskId: string
  canvasId: number
  nodeId?: string | null
  userId: number
  modelId: number
  prompt: string
}

async function onTaskSuccess(
  task: TaskRecord,
  event: { videoUrl: string; lastFrameUrl?: string },
  model: { name: string }
) {
  try {
    const { filename, mimeType } = await downloadAndSave(event.videoUrl)
    await prisma.$transaction([
      prisma.generatedAsset.create({
        data: {
          canvasId: task.canvasId,
          nodeId: task.nodeId || null,
          userId: task.userId,
          filename,
          mimeType,
          prompt: task.prompt,
          modelName: model.name,
        },
      }),
      prisma.videoTask.update({
        where: { taskId: task.taskId },
        data: {
          status: 'succeeded',
          videoUrl: `/api/assets/${filename}`,
          lastFrameUrl: event.lastFrameUrl || null,
        },
      }),
    ])
  } catch (e) {
    console.error('[generate-video save]', e)
    await prisma.videoTask.update({
      where: { taskId: task.taskId },
      data: { status: 'failed' },
    })
  }
}

// ============================================================
// 任务失败：退款 + 更新DB
// ============================================================
async function onTaskFailure(
  task: { taskId: string; userId: number; costCredits: number; refunded: boolean; modelId: number },
  error: string
) {
  if (task.refunded) return
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: task.userId },
        data: { credits: { increment: task.costCredits } },
      }),
      prisma.creditTransaction.create({
        data: {
          userId: task.userId,
          type: 'GENERATION_REFUND',
          amount: task.costCredits,
          relatedModelId: task.modelId,
          description: `视频生成退款: ${error}`,
        },
      }),
      prisma.videoTask.update({
        where: { taskId: task.taskId },
        data: { status: 'failed', refunded: true },
      }),
    ])
  } catch (e) {
    console.error('[generate-video refund]', e)
  }
}

async function refund(user: AuthPayload, amount: number, modelId: number, reason: string) {
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.userId }, data: { credits: { increment: amount } } }),
      prisma.creditTransaction.create({
        data: { userId: user.userId, tenantId: user.tenantId, type: 'GENERATION_REFUND', amount, relatedModelId: modelId, description: `视频生成退款: ${reason}` },
      }),
    ])
  } catch (e) {
    console.error('[generate-video refund]', e)
  }
}

// ============================================================
// 服务启动：恢复 pending 任务的后台轮询
// ============================================================
async function recoverPendingTasks() {
  try {
    const pending = await prisma.videoTask.findMany({ where: { status: 'running' } })
    if (pending.length === 0) return

    console.log(`[generate-video] 恢复 ${pending.length} 个运行中任务...`)
    for (const task of pending) {
      const model = await prisma.aiModel.findUnique({ where: { id: task.modelId } })
      if (!model || !model.enabled) continue
      const provider = getVideoProvider(model.provider)
      if (!provider?.waitForResult) continue

      taskCache.set(task.taskId, { status: 'running', _ts: 0 })

      pollAndSave(
        task.taskId, provider,
        { id: model.id, name: model.name, modelName: model.modelName, baseUrl: model.baseUrl, apiKey: model.apiKey },
        { canvasId: task.canvasId, modelId: task.modelId, prompt: task.prompt, duration: task.duration, aspectRatio: '16:9' as const, resolution: '720p' as const, save: true, nodeId: task.nodeId || undefined },
        { userId: task.userId, username: '', role: '', tokenVersion: 0, tenantId: null },
        task.costCredits
      )
    }
  } catch (e) {
    console.error('[generate-video recover]', e)
  }
}

recoverPendingTasks()

export default router
