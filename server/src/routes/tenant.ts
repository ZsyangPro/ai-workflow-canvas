import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware, scopeMiddleware, requireTenantScope } from '../middleware/auth'

const router = Router()
router.use(authMiddleware, requireTenantScope, scopeMiddleware)

function paramId(req: Request): string {
  return req.params.id as string
}

function getTenantId(req: Request): string {
  const tenantId = req.scope?.tenantId
  if (!tenantId) throw new Error('scopeMiddleware 未注入 tenantId')
  return tenantId
}

// GET /api/tenant/dashboard — 租户概览（余额、配额、消耗统计）
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const tid = getTenantId(req)
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [tenant, subjectCount, userCount, stats] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tid }, select: { credits: true, seatNum: true, subjectNum: true } }),
      prisma.subject.count({ where: { tenantId: tid, deletedAt: null } }),
      prisma.user.count({ where: { tenantId: tid } }),
      // 消耗统计
      Promise.all([
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: 'GENERATION_DEDUCTION', createdAt: { gte: todayStart } }, _sum: { amount: true } }),
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: 'GENERATION_DEDUCTION', createdAt: { gte: yesterdayStart, lt: todayStart } }, _sum: { amount: true } }),
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: 'GENERATION_DEDUCTION', createdAt: { gte: weekStart } }, _sum: { amount: true } }),
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: 'GENERATION_DEDUCTION', createdAt: { gte: monthStart } }, _sum: { amount: true } }),
        // 累计获得（充值+分配）
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: { in: ['TENANT_RECHARGE'] } }, _sum: { amount: true } }),
        prisma.creditTransaction.aggregate({ where: { tenantId: tid, type: { in: ['SUBJECT_ALLOCATE', 'USER_ALLOCATE', 'SUBJECT_TO_USER'] } }, _sum: { amount: true } }),
        // 近7天每日消耗
        prisma.$queryRaw<{ day: string; consumed: number }[]>`
          SELECT DATE(ct."createdAt") as day, COALESCE(SUM(ABS(ct.amount)), 0)::int as consumed
          FROM "CreditTransaction" ct
          WHERE ct."tenantId" = ${tid}
            AND ct.type = 'GENERATION_DEDUCTION'
            AND ct."createdAt" >= ${weekStart}
          GROUP BY DATE(ct."createdAt")
          ORDER BY day ASC
        `,
      ]),
    ])

    if (!tenant) { res.status(404).json({ error: '租户不存在' }); return }

    const [todayConsume, yesterdayConsume, weekConsume, monthConsume, totalRecharge, allocated, dailyConsume] = stats

    res.json({
      credits: tenant.credits,
      subjectCount,
      subjectLimit: tenant.subjectNum,
      userCount,
      userLimit: tenant.seatNum,
      consume: {
        today: -(todayConsume._sum.amount || 0),
        yesterday: -(yesterdayConsume._sum.amount || 0),
        week: -(weekConsume._sum.amount || 0),
        month: -(monthConsume._sum.amount || 0),
      },
      totalRecharge: totalRecharge._sum.amount || 0,
      allocated: allocated._sum.amount || 0,
      dailyConsume,
    })
  } catch {
    res.status(500).json({ error: '获取租户统计失败' })
  }
})

function tenantScope(req: Request): string {
  const tenantId = req.scope?.tenantId
  if (!tenantId) throw new Error('scopeMiddleware 未注入 tenantId')
  return tenantId
}

// ===== 主体管理 =====

const subjectSelect = {
  id: true,
  tenantId: true,
  name: true,
  status: true,
  credits: true,
  contactPerson: true,
  contactPhone: true,
  theme: true,
  createdAt: true,
  updatedAt: true,
}

const createSubjectSchema = z.object({
  name: z.string().min(1, '主体名称不能为空'),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
})

const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  theme: z.string().optional(),
})

// GET /api/tenant/subjects — 主体列表
router.get('/subjects', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)

    const where = { tenantId: tenantScope(req) }
    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where,
        select: subjectSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.subject.count({ where }),
    ])
    res.json({ subjects, total })
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('scopeMiddleware')) {
      res.status(400).json({ error: e.message })
      return
    }
    res.status(500).json({ error: '获取主体列表失败' })
  }
})

// POST /api/tenant/subjects — 创建主体
router.post('/subjects', async (req: Request, res: Response): Promise<void> => {
  const parsed = createSubjectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const tid = tenantScope(req)

  // 检查租户存在且可用
  const tenant = await prisma.tenant.findUnique({ where: { id: tid } })
  if (!tenant || tenant.status === 'DISABLED') {
    res.status(400).json({ error: '租户不可用' })
    return
  }

  // 检查主体数量配额
  if (tenant.subjectNum > 0) {
    const count = await prisma.subject.count({ where: { tenantId: tid } })
    if (count >= tenant.subjectNum) {
      res.status(400).json({ error: `已达到主体数量上限（${tenant.subjectNum}）` })
      return
    }
  }

  try {
    const subject = await prisma.subject.create({
      data: { ...parsed.data, tenantId: tid, contactPerson: parsed.data.contactPerson || null, contactPhone: parsed.data.contactPhone || null },
      select: subjectSelect,
    })
    res.status(201).json({ subject })
  } catch {
    res.status(500).json({ error: '创建主体失败' })
  }
})

// PATCH /api/tenant/subjects/:id — 编辑主体
router.patch('/subjects/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateSubjectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const id = paramId(req)
  const tid = tenantScope(req)

  try {
    const subject = await prisma.subject.findFirst({ where: { id, tenantId: tid } })
    if (!subject) {
      res.status(404).json({ error: '主体不存在' })
      return
    }
    const updated = await prisma.subject.update({
      where: { id },
      data: parsed.data,
      select: subjectSelect,
    })
    res.json({ subject: updated })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '主体不存在' })
    } else {
      res.status(500).json({ error: '更新主体失败' })
    }
  }
})

// DELETE /api/tenant/subjects/:id — 删除主体
router.delete('/subjects/:id', async (req: Request, res: Response): Promise<void> => {
  const id = paramId(req)
  const tid = tenantScope(req)

  try {
    const subject = await prisma.subject.findFirst({ where: { id, tenantId: tid } })
    if (!subject) {
      res.status(404).json({ error: '主体不存在' })
      return
    }
    await prisma.subject.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '主体不存在' })
    } else {
      res.status(500).json({ error: '删除主体失败' })
    }
  }
})

// ===== 给主体分配算力 =====

const allocateSubjectSchema = z.object({
  amount: z.number().refine(v => v !== 0, '金额不能为0'),
})

// POST /api/tenant/subjects/:id/allocate — 正数分配算力，负数回收算力
router.post('/subjects/:id/allocate', async (req: Request, res: Response): Promise<void> => {
  const parsed = allocateSubjectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { amount } = parsed.data
  const subjectId = paramId(req)
  const tid = tenantScope(req)

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, tenantId: tid } })
  if (!subject) { res.status(404).json({ error: '主体不存在' }); return }

  const absAmount = Math.abs(amount)
  const isRevoke = amount < 0

  try {
    if (isRevoke) {
      // 回收：从主体退回给租户
      const [updated] = await prisma.$transaction([
        prisma.subject.update({
          where: { id: subjectId, credits: { gte: absAmount } },
          data: { credits: { decrement: absAmount } },
        }),
        prisma.tenant.update({
          where: { id: tid },
          data: { credits: { increment: absAmount } },
          select: { id: true, credits: true },
        }),
        prisma.creditTransaction.create({
          data: { tenantId: tid, subjectId, amount, type: 'SUBJECT_REVOKE', description: `从主体回收 ${absAmount} 算力` },
        }),
      ])
      res.json({ tenant: updated })
    } else {
      // 分配：租户给主体
      const [updated] = await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tid, credits: { gte: amount } },
          data: { credits: { decrement: amount } },
          select: { id: true, credits: true },
        }),
        prisma.subject.update({
          where: { id: subjectId },
          data: { credits: { increment: amount } },
        }),
        prisma.creditTransaction.create({
          data: { tenantId: tid, subjectId, amount, type: 'SUBJECT_ALLOCATE', description: `向主体分配 ${amount} 算力` },
        }),
      ])
      res.json({ tenant: updated })
    }
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(400).json({ error: isRevoke ? '主体算力不足' : '租户算力不足' })
    } else {
      res.status(500).json({ error: '操作失败' })
    }
  }
})

// ===== 用户管理（租户视角） =====

const userSelect = {
  id: true,
  username: true,
  role: true,
  credits: true,
  tenantId: true,
  subjectId: true,
  createdAt: true,
  updatedAt: true,
}

// GET /api/tenant/users — 租户下用户列表
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)
    const tid = tenantScope(req)

    const where = { tenantId: tid }
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])
    res.json({ users, total })
  } catch {
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

const updateTenantUserSchema = z.object({
  subjectId: z.string().nullable().optional(),
})

// PATCH /api/tenant/users/:id — 编辑用户（绑定主体等）
router.patch('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateTenantUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const id = parseInt(paramId(req), 10)
  const tid = tenantScope(req)

  if (isNaN(id)) {
    res.status(400).json({ error: '用户 ID 无效' })
    return
  }

  // 校验用户属于本租户
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.tenantId !== tid) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { subjectId: parsed.data.subjectId },
      select: userSelect,
    })
    res.json({ user: updated })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '用户不存在' })
    } else {
      res.status(500).json({ error: '更新用户失败' })
    }
  }
})

const allocateUserSchema = z.object({
  amount: z.number().refine(v => v !== 0, '金额不能为0'),
})

// POST /api/tenant/users/:id/allocate — 正数分配，负数回收
router.post('/users/:id/allocate', async (req: Request, res: Response): Promise<void> => {
  const parsed = allocateUserSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }

  const { amount } = parsed.data
  const userId = parseInt(paramId(req), 10)
  const tid = tenantScope(req)
  if (isNaN(userId)) { res.status(400).json({ error: '用户 ID 无效' }); return }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.tenantId !== tid) { res.status(404).json({ error: '用户不存在' }); return }

  const absAmount = Math.abs(amount)
  const isRevoke = amount < 0

  try {
    if (isRevoke) {
      const [updated] = await prisma.$transaction([
        prisma.user.update({ where: { id: userId, credits: { gte: absAmount } }, data: { credits: { decrement: absAmount } } }),
        prisma.tenant.update({ where: { id: tid }, data: { credits: { increment: absAmount } }, select: { id: true, credits: true } }),
        prisma.creditTransaction.create({ data: { tenantId: tid, userId, amount, type: 'USER_REVOKE', description: `从用户 ${user.username} 回收 ${absAmount} 算力` } }),
      ])
      res.json({ tenant: updated })
    } else {
      const [updated] = await prisma.$transaction([
        prisma.tenant.update({ where: { id: tid, credits: { gte: amount } }, data: { credits: { decrement: amount } }, select: { id: true, credits: true } }),
        prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount }, tenantId: user.tenantId || tid } }),
        prisma.creditTransaction.create({ data: { tenantId: tid, userId, amount, type: 'USER_ALLOCATE', description: `向用户 ${user.username} 分配 ${amount} 算力` } }),
      ])
      res.json({ tenant: updated })
    }
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') res.status(400).json({ error: isRevoke ? '用户算力不足' : '租户算力不足' })
    else res.status(500).json({ error: '操作失败' })
  }
})

// POST /api/tenant/subjects/:id/users/:uid/allocate — 从主体余额给用户分配算力
router.post('/subjects/:id/users/:uid/allocate', async (req: Request, res: Response): Promise<void> => {
  const parsed = allocateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { amount } = parsed.data
  const subjectId = paramId(req)
  const userId = parseInt(req.params.uid as string, 10)
  const tid = tenantScope(req)

  if (isNaN(userId)) {
    res.status(400).json({ error: '用户 ID 无效' })
    return
  }

  // 校验主体属于本租户
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, tenantId: tid } })
  if (!subject) {
    res.status(404).json({ error: '主体不存在' })
    return
  }

  // 校验用户属于本租户
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.tenantId !== tid) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  const absAmount = Math.abs(amount)
  const isRevoke = amount < 0

  try {
    if (isRevoke) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId, credits: { gte: absAmount } }, data: { credits: { decrement: absAmount } } }),
        prisma.subject.update({ where: { id: subjectId }, data: { credits: { increment: absAmount } } }),
        prisma.creditTransaction.create({ data: { tenantId: tid, subjectId, userId, amount, type: 'SUBJECT_TO_USER_REVOKE', description: `从用户 ${user.username} 回收 ${absAmount} 算力，退回主体 ${subject.name}` } }),
      ])
    } else {
      await prisma.$transaction([
        prisma.subject.update({ where: { id: subjectId, credits: { gte: amount } }, data: { credits: { decrement: amount } } }),
        prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount }, subjectId } }),
        prisma.creditTransaction.create({ data: { tenantId: tid, subjectId, userId, amount, type: 'SUBJECT_TO_USER', description: `主体 ${subject.name} 向用户 ${user.username} 分配 ${amount} 算力` } }),
      ])
    }
    res.json({ subjectId, userId, amount })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(400).json({ error: isRevoke ? '用户算力不足' : '主体算力不足' })
    } else {
      res.status(500).json({ error: '分配算力失败' })
    }
  }
})

// ===== 钱包流水 =====

// GET /api/tenant/wallet/flows — 租户算力流水
router.get('/wallet/flows', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)
    const tid = tenantScope(req)

    const where: Record<string, unknown> = { tenantId: tid }
    const type = req.query.type as string | undefined
    if (type) where.type = type

    const [flows, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          amount: true,
          type: true,
          userId: true,
          subjectId: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.creditTransaction.count({ where }),
    ])
    res.json({ flows, total })
  } catch {
    res.status(500).json({ error: '获取流水失败' })
  }
})

// ===== 租户模型定价 =====

const pricingSelect = {
  id: true,
  tenantId: true,
  modelId: true,
  computing: true,
  model: { select: { id: true, name: true, costCredits: true } },
}

const pricingSchema = z.object({
  modelId: z.number(),
  computing: z.number().min(1, '算力值必须大于0'),
})

// GET /api/tenant/model-pricing — 租户模型定价列表
router.get('/model-pricing', async (req: Request, res: Response): Promise<void> => {
  try {
    const tid = tenantScope(req)
    const pricings = await prisma.tenantModelPricing.findMany({
      where: { tenantId: tid },
      select: pricingSelect,
      orderBy: { modelId: 'asc' },
    })
    res.json({ pricings })
  } catch {
    res.status(500).json({ error: '获取定价列表失败' })
  }
})

// POST /api/tenant/model-pricing — 设置租户模型定价
router.post('/model-pricing', async (req: Request, res: Response): Promise<void> => {
  const parsed = pricingSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const tid = tenantScope(req)
  const { modelId, computing } = parsed.data

  const model = await prisma.aiModel.findUnique({ where: { id: modelId } })
  if (!model) {
    res.status(404).json({ error: '模型不存在' })
    return
  }
  if (computing < model.costCredits) {
    res.status(400).json({ error: `租户定价不能低于平台定价（${model.costCredits}）` })
    return
  }

  try {
    const pricing = await prisma.tenantModelPricing.upsert({
      where: { tenantId_modelId: { tenantId: tid, modelId } },
      create: { tenantId: tid, modelId, computing },
      update: { computing },
      select: pricingSelect,
    })
    res.json({ pricing })
  } catch {
    res.status(500).json({ error: '设置定价失败' })
  }
})

// DELETE /api/tenant/model-pricing/:id — 删除租户模型定价
router.delete('/model-pricing/:id', async (req: Request, res: Response): Promise<void> => {
  const tid = tenantScope(req)
  const modelId = parseInt(paramId(req), 10)

  if (isNaN(modelId)) {
    res.status(400).json({ error: '模型 ID 无效' })
    return
  }

  try {
    await prisma.tenantModelPricing.delete({
      where: { tenantId_modelId: { tenantId: tid, modelId } },
    })
    res.json({ success: true })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '定价记录不存在' })
    } else {
      res.status(500).json({ error: '删除定价失败' })
    }
  }
})

// ===== 租户文件管理 =====

const fileCategorySchema = z.object({
  name: z.string().min(1, '分类名称不能为空'),
  sort: z.number().optional(),
})

// GET /api/tenant/files/categories — 文件分类列表
router.get('/files/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const tid = tenantScope(req)
    const categories = await prisma.tenantFileCategory.findMany({
      where: { tenantId: tid },
      orderBy: { sort: 'asc' },
    })
    res.json({ categories })
  } catch {
    res.status(500).json({ error: '获取文件分类失败' })
  }
})

// POST /api/tenant/files/categories — 创建文件分类
router.post('/files/categories', async (req: Request, res: Response): Promise<void> => {
  const parsed = fileCategorySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const tid = tenantScope(req)
  try {
    const category = await prisma.tenantFileCategory.create({
      data: { tenantId: tid, name: parsed.data.name, sort: parsed.data.sort ?? 0 },
    })
    res.status(201).json({ category })
  } catch {
    res.status(500).json({ error: '创建文件分类失败' })
  }
})

// DELETE /api/tenant/files/categories/:id — 删除文件分类
router.delete('/files/categories/:id', async (req: Request, res: Response): Promise<void> => {
  const id = paramId(req)
  const tid = tenantScope(req)

  try {
    const cat = await prisma.tenantFileCategory.findFirst({ where: { id, tenantId: tid } })
    if (!cat) {
      res.status(404).json({ error: '文件分类不存在' })
      return
    }
    await prisma.tenantFileCategory.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: '删除文件分类失败' })
  }
})

// GET /api/tenant/files — 租户文件列表
router.get('/files', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)
    const tid = tenantScope(req)

    const where: Record<string, unknown> = { tenantId: tid, deletedAt: null }
    const categoryId = req.query.categoryId as string | undefined
    if (categoryId) where.categoryId = categoryId

    const [files, total] = await Promise.all([
      prisma.generatedAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.generatedAsset.count({ where }),
    ])
    res.json({ files, total })
  } catch {
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

export default router
