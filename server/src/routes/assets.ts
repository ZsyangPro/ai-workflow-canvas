import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { deleteFile, saveBase64 } from '../lib/storage'

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

    const where: Record<string, unknown> = { canvasId }
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

    // 检查权限
    const canvas = await prisma.canvas.findUnique({ where: { id: asset.canvasId } })
    if (!canvas || canvas.userId !== req.user!.userId) {
      res.status(403).json({ error: '无权删除此资源' })
      return
    }

    await deleteFile(asset.filename)
    await prisma.generatedAsset.delete({ where: { id } })

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

    const assets = await prisma.generatedAsset.findMany({ where: { canvasId } })
    await Promise.all(assets.map((a) => deleteFile(a.filename)))
    const result = await prisma.generatedAsset.deleteMany({ where: { canvasId } })

    res.json({ deleted: result.count })
  } catch {
    res.status(500).json({ error: '清空资源失败' })
  }
})

export default router
