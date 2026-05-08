import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

// GET /api/credits/history — 获取当前用户算力流水
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1
    const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 20, 100)
    const offset = (page - 1) * pageSize

    const userId = req.user!.userId

    const [transactions, total, user] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      prisma.creditTransaction.count({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    ])

    // 批量获取关联模型名称
    const modelIds = [...new Set(
      transactions
        .map((t) => t.relatedModelId)
        .filter((id): id is number => id != null),
    )]
    const models = modelIds.length > 0
      ? await prisma.aiModel.findMany({
          where: { id: { in: modelIds } },
          select: { id: true, name: true },
        })
      : []
    const modelNameMap = new Map(models.map((m) => [m.id, m.name]))

    const result = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      description: t.description,
      relatedModelId: t.relatedModelId,
      relatedModelName: t.relatedModelId ? (modelNameMap.get(t.relatedModelId) || null) : null,
      createdAt: t.createdAt.toISOString(),
    }))

    res.json({
      credits: user?.credits || 0,
      transactions: result,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (e) {
    console.error("[credits]", e)
    res.status(500).json({ error: '获取算力流水失败' })
  }
})

export default router
