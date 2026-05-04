import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware, adminMiddleware } from '../middleware/auth'

const router = Router()

// GET 端点 — 所有登录用户可访问
router.get('/', authMiddleware, async (_req: Request, res: Response): Promise<void> => {
  try {
    const models = await prisma.aiModel.findMany({
      select: modelSelect,
      orderBy: { createdAt: 'desc' },
    })
    res.json({ models: models.map(maskModel) })
  } catch {
    res.status(500).json({ error: '获取模型列表失败' })
  }
})

// 其余端点需要管理员权限
router.use(authMiddleware, adminMiddleware)

const modelSelect = {
  id: true,
  name: true,
  provider: true,
  baseUrl: true,
  apiKey: true,
  modelName: true,
  category: true,
  enabled: true,
  description: true,
  costCredits: true,
  createdAt: true,
  updatedAt: true,
}

function maskApiKey(key: string) {
  if (key.length <= 6) return '***'
  return key.slice(0, 3) + '...' + key.slice(-3)
}

function maskModel(m: Record<string, unknown>) {
  return { ...m, apiKey: maskApiKey(m.apiKey as string) }
}

const createModelSchema = z.object({
  name: z.string().min(1, '模型名称不能为空'),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  modelName: z.string().min(1, '模型标识不能为空'),
  category: z.enum(['image', 'video']).optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  costCredits: z.number().min(0).optional(),
})

const updateModelSchema = z.object({
  name: z.string().min(1).optional(),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  modelName: z.string().min(1).optional(),
  category: z.enum(['image', 'video']).optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  costCredits: z.number().min(0).optional(),
})

// POST — create model
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createModelSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { name, provider, baseUrl, apiKey, modelName, category, enabled, description, costCredits } = parsed.data

  const exists = await prisma.aiModel.findUnique({ where: { name } })
  if (exists) {
    res.status(409).json({ error: '模型名称已存在' })
    return
  }

  try {
    const model = await prisma.aiModel.create({
      data: {
        name,
        provider: provider || 'sophnet',
        baseUrl: baseUrl || 'https://www.sophnet.com/api/open-apis/projects/easyllms',
        apiKey,
        modelName,
        category: category || 'image',
        enabled: enabled ?? true,
        description,
        costCredits: costCredits ?? 1,
      },
      select: modelSelect,
    })
    res.status(201).json({ model: maskModel(model) })
  } catch {
    res.status(500).json({ error: '创建模型失败' })
  }
})

// PATCH — update model
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '模型 ID 无效' })
    return
  }

  const parsed = updateModelSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const data: Record<string, unknown> = { ...parsed.data }

  // apiKey 为空则保留原值
  if (data.apiKey === '' || data.apiKey === undefined) {
    delete data.apiKey
  }

  try {
    const model = await prisma.aiModel.update({
      where: { id },
      data,
      select: modelSelect,
    })
    res.json({ model: maskModel(model) })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '模型不存在' })
    } else {
      res.status(500).json({ error: '更新模型失败' })
    }
  }
})

// DELETE — remove model
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '模型 ID 无效' })
    return
  }

  try {
    await prisma.aiModel.delete({ where: { id } })
    res.json({ success: true })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '模型不存在' })
    } else {
      res.status(500).json({ error: '删除模型失败' })
    }
  }
})

export default router
