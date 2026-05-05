import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { saveBase64 } from '../lib/storage'

const uploadSchema = z.object({
  canvasId: z.number(),
  image: z.string().min(1),
})

const router = Router()

// Shared helper: verify canvas ownership
async function getOwnedCanvas(canvasId: number, userId: number) {
  const canvas = await prisma.canvas.findUnique({ where: { id: canvasId } })
  if (!canvas || canvas.userId !== userId) return null
  return canvas
}

// GET /api/assets — 资源列表（需要登录）
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const canvasId = parseInt(req.query.canvasId as string, 10)
    if (isNaN(canvasId)) {
      res.status(400).json({ error: '缺少 canvasId 参数' })
      return
    }

    const canvas = await getOwnedCanvas(canvasId, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100)
    const nodeId = req.query.nodeId as string | undefined

    const where: Record<string, unknown> = { canvasId, deletedAt: null }
    if (nodeId) where.nodeId = nodeId

    const [assets, total] = await Promise.all([
      prisma.generatedAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.generatedAsset.count({ where }),
    ])

    const result = assets.map((a) => ({
      id: a.id,
      nodeId: a.nodeId,
      filename: a.filename,
      localUrl: `/api/assets/${a.filename}`,
      mimeType: a.mimeType,
      prompt: a.prompt,
      modelName: a.modelName,
      createdAt: a.createdAt.toISOString(),
    }))

    res.json({ assets: result, total })
  } catch {
    res.status(500).json({ error: '获取资源列表失败' })
  }
})

// POST /api/assets/upload — 上传粘贴的图片（base64），返回 URL
router.post('/upload', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const parsed = uploadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { canvasId, image } = parsed.data

  const canvas = await getOwnedCanvas(canvasId, req.user!.userId)
  if (!canvas) {
    res.status(404).json({ error: '画布不存在' })
    return
  }

  try {
    const saved = await saveBase64(image)
    const asset = await prisma.generatedAsset.create({
      data: {
        canvasId,
        filename: saved.filename,
        mimeType: saved.mimeType,
      },
    })

    res.json({
      id: asset.id,
      localUrl: `/api/assets/${saved.filename}`,
    })
  } catch {
    res.status(500).json({ error: '上传失败' })
  }
})

const saveSchema = z.object({
  image: z.string().min(1),
  canvasId: z.number(),
  nodeId: z.string().optional(),
  prompt: z.string().optional(),
  modelName: z.string().optional(),
})

// POST /api/assets/save — 收藏生成的图片（base64 → 存盘 + 建 DB 记录）
router.post('/save', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const parsed = saveSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { image, canvasId, nodeId, prompt, modelName } = parsed.data

  const canvas = await getOwnedCanvas(canvasId, req.user!.userId)
  if (!canvas) {
    res.status(404).json({ error: '画布不存在' })
    return
  }

  try {
    const saved = await saveBase64(image)
    const asset = await prisma.generatedAsset.create({
      data: {
        canvasId,
        nodeId: nodeId || null,
        filename: saved.filename,
        mimeType: saved.mimeType,
        prompt: prompt || null,
        modelName: modelName || null,
      },
    })

    res.json({
      id: asset.id,
      url: `/api/assets/${saved.filename}`,
    })
  } catch {
    res.status(500).json({ error: '收藏失败' })
  }
})

// GET /api/assets/collected — 跨画布获取用户所有已收藏素材
router.get('/collected', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100)

    const userCanvases = await prisma.canvas.findMany({
      where: { userId: req.user!.userId },
      select: { id: true },
    })
    const userCanvasIds = userCanvases.map((c) => c.id)

    const where: Record<string, unknown> = {
      AND: [
        { deletedAt: null },
        {
          OR: [
            { canvasId: { in: userCanvasIds } },
            { canvasId: null },
          ],
        },
      ],
    }

    const [assets, total] = await Promise.all([
      prisma.generatedAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { canvas: { select: { id: true, name: true } } },
      }),
      prisma.generatedAsset.count({ where }),
    ])

    const result = assets.map((a) => ({
      id: a.id,
      nodeId: a.nodeId,
      filename: a.filename,
      localUrl: `/api/assets/${a.filename}`,
      mimeType: a.mimeType,
      prompt: a.prompt,
      modelName: a.modelName,
      canvasId: a.canvasId,
      canvasName: a.canvas?.name || null,
      createdAt: a.createdAt.toISOString(),
    }))

    res.json({ assets: result, total })
  } catch {
    res.status(500).json({ error: '获取收藏列表失败' })
  }
})

// GET /api/assets/trash — 垃圾箱列表
router.get('/trash', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100)

    const userCanvases = await prisma.canvas.findMany({
      where: { userId: req.user!.userId },
      select: { id: true },
    })
    const userCanvasIds = userCanvases.map((c) => c.id)

    const where: Record<string, unknown> = {
      AND: [
        { deletedAt: { not: null } },
        {
          OR: [
            { canvasId: { in: userCanvasIds } },
            { canvasId: null },
          ],
        },
      ],
    }

    const [assets, total] = await Promise.all([
      prisma.generatedAsset.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        skip: offset,
        take: limit,
        include: { canvas: { select: { id: true, name: true } } },
      }),
      prisma.generatedAsset.count({ where }),
    ])

    const result = assets.map((a) => ({
      id: a.id,
      filename: a.filename,
      localUrl: `/api/assets/${a.filename}`,
      prompt: a.prompt,
      canvasName: a.canvas?.name || null,
      deletedAt: a.deletedAt!.toISOString(),
      expiresIn: Math.max(0, 7 - Math.ceil((Date.now() - a.deletedAt!.getTime()) / (24 * 60 * 60 * 1000))),
    }))

    res.json({ assets: result, total })
  } catch {
    res.status(500).json({ error: '获取垃圾箱列表失败' })
  }
})

// POST /api/assets/:id/restore — 从垃圾箱恢复
router.post('/:id/restore', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效的资源 ID' })
      return
    }

    const asset = await prisma.generatedAsset.findUnique({ where: { id } })
    if (!asset) {
      res.status(404).json({ error: '资源不存在' })
      return
    }

    // 权限检查
    if (asset.canvasId != null) {
      const canvas = await prisma.canvas.findUnique({ where: { id: asset.canvasId } })
      if (!canvas || canvas.userId !== req.user!.userId) {
        res.status(403).json({ error: '无权操作此资源' })
        return
      }
    }

    await prisma.generatedAsset.update({
      where: { id },
      data: { deletedAt: null },
    })

    res.json({ restored: true })
  } catch {
    res.status(500).json({ error: '恢复失败' })
  }
})

// DELETE /api/assets/:id — 删除单个资源（需要登录）
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效的资源 ID' })
      return
    }

    const asset = await prisma.generatedAsset.findUnique({ where: { id } })
    if (!asset) {
      res.status(404).json({ error: '资源不存在' })
      return
    }

    // 检查权限（canvasId 可能为 null，来源画布已删除的素材仍允许用户删除）
    if (asset.canvasId != null) {
      const canvas = await prisma.canvas.findUnique({ where: { id: asset.canvasId } })
      if (!canvas || canvas.userId !== req.user!.userId) {
        res.status(403).json({ error: '无权删除此资源' })
        return
      }
    }

    // 软删除：移入垃圾箱，7天后自动清理
    await prisma.generatedAsset.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    res.json({ deleted: true })
  } catch {
    res.status(500).json({ error: '删除资源失败' })
  }
})

// DELETE /api/assets — 清空指定画布所有资源（需要登录）
router.delete('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const canvasId = parseInt(req.query.canvasId as string, 10)
    if (isNaN(canvasId)) {
      res.status(400).json({ error: '缺少 canvasId 参数' })
      return
    }

    const canvas = await getOwnedCanvas(canvasId, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    const result = await prisma.generatedAsset.updateMany({
      where: { canvasId },
      data: { deletedAt: new Date() },
    })

    res.json({ deleted: result.count })
  } catch {
    res.status(500).json({ error: '清空资源失败' })
  }
})

export default router
