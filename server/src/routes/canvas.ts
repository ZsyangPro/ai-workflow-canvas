import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { deleteFile } from '../lib/storage'

const router = Router()

router.use(authMiddleware)

const saveSchema = z.object({
  nodes: z.array(z.record(z.unknown())).max(200, '节点数量不能超过 200'),
  edges: z.array(z.record(z.unknown())).max(500, '连线数量不能超过 500'),
})

const createSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

const renameSchema = z.object({
  name: z.string().min(1).max(100),
})

// Shared helper: get a canvas by ID, verify ownership
async function getOwnedCanvas(canvasId: number, userId: number) {
  const canvas = await prisma.canvas.findUnique({ where: { id: canvasId } })
  if (!canvas) return null
  if (canvas.userId !== userId) return null
  return canvas
}

// GET /api/canvas — list all canvases for current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100)

    const [canvases, total] = await Promise.all([
      prisma.canvas.findMany({
        where: { userId: req.user!.userId },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          nodes: true,
          edges: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.canvas.count({ where: { userId: req.user!.userId } }),
    ])

    const result = canvases.map((c) => ({
      id: c.id,
      name: c.name,
      nodeCount: (c.nodes as unknown[]).length,
      edgeCount: (c.edges as unknown[]).length,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))

    res.json({ canvases: result, total })
  } catch {
    res.status(500).json({ error: '获取画布列表失败' })
  }
})

// POST /api/canvas — create a new canvas
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const canvas = await prisma.canvas.create({
      data: {
        userId: req.user!.userId,
        name: parsed.data.name || '未命名画布',
      },
    })
    res.status(201).json({
      canvas: {
        id: canvas.id,
        name: canvas.name,
        createdAt: canvas.createdAt.toISOString(),
        updatedAt: canvas.updatedAt.toISOString(),
      },
    })
  } catch {
    res.status(500).json({ error: '创建画布失败' })
  }
})

// GET /api/canvas/:id — get single canvas with nodes/edges
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效的画布 ID' })
      return
    }

    const canvas = await getOwnedCanvas(id, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    res.json({
      id: canvas.id,
      name: canvas.name,
      nodes: canvas.nodes,
      edges: canvas.edges,
      createdAt: canvas.createdAt.toISOString(),
      updatedAt: canvas.updatedAt.toISOString(),
    })
  } catch {
    res.status(500).json({ error: '获取画布失败' })
  }
})

// PUT /api/canvas/:id — save nodes and edges
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '无效的画布 ID' })
    return
  }

  const parsed = saveSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const canvas = await getOwnedCanvas(id, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    await prisma.canvas.update({
      where: { id },
      data: {
        nodes: parsed.data.nodes as any,
        edges: parsed.data.edges as any,
      },
    })
    res.json({ saved: true })
  } catch {
    res.status(500).json({ error: '保存画布失败' })
  }
})

// PATCH /api/canvas/:id — rename a canvas
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '无效的画布 ID' })
    return
  }

  const parsed = renameSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const canvas = await getOwnedCanvas(id, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    const updated = await prisma.canvas.update({
      where: { id },
      data: { name: parsed.data.name },
    })
    res.json({ canvas: { id: updated.id, name: updated.name } })
  } catch {
    res.status(500).json({ error: '重命名画布失败' })
  }
})

// DELETE /api/canvas/:id — delete a canvas and its assets
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效的画布 ID' })
      return
    }

    const canvas = await getOwnedCanvas(id, req.user!.userId)
    if (!canvas) {
      res.status(404).json({ error: '画布不存在' })
      return
    }

    // Delete asset files from disk
    const assets = await prisma.generatedAsset.findMany({ where: { canvasId: id } })
    await Promise.all(assets.map((a) => deleteFile(a.filename)))

    // Delete canvas (cascade deletes GeneratedAsset rows)
    await prisma.canvas.delete({ where: { id } })

    res.json({ deleted: true })
  } catch {
    res.status(500).json({ error: '删除画布失败' })
  }
})

export default router
