import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware, requireSuperAdmin } from '../middleware/auth'

const router = Router()
router.use(authMiddleware, requireSuperAdmin)

const tenantSelect = {
  id: true,
  code: true,
  name: true,
  domain: true,
  status: true,
  credits: true,
  seatNum: true,
  subjectNum: true,
  contactPerson: true,
  contactPhone: true,
  contactEmail: true,
  logo: true,
  expireTime: true,
  createdAt: true,
  updatedAt: true,
}

// ===== 租户 CRUD =====

const createTenantSchema = z.object({
  code: z.string().min(2).optional(),
  name: z.string().min(1, '租户名称不能为空'),
  domain: z.string().optional(),
  contactPerson: z.string().min(1, '联系人不能为空'),
  contactPhone: z.string().min(1, '联系电话不能为空'),
  contactEmail: z.string().optional(),
  logo: z.string().optional(),
  seatNum: z.number().min(0).optional(),
  subjectNum: z.number().min(0).optional(),
  expireTime: z.string().optional(),
})

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED']).optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  logo: z.string().optional(),
  seatNum: z.number().min(0).optional(),
  subjectNum: z.number().min(0).optional(),
  expireTime: z.string().nullable().optional(),
})

function paramId(req: Request): string {
  return req.params.id as string
}

// GET /api/admin/tenants — 租户列表
router.get('/tenants', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        select: tenantSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.tenant.count(),
    ])
    res.json({ tenants, total })
  } catch {
    res.status(500).json({ error: '获取租户列表失败' })
  }
})

// GET /api/admin/tenants/:id — 租户详情
router.get('/tenants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = paramId(req)
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        ...tenantSelect,
        _count: { select: { subjects: true, users: true } },
      },
    })
    if (!tenant) {
      res.status(404).json({ error: '租户不存在' })
      return
    }
    res.json({ tenant })
  } catch {
    res.status(500).json({ error: '获取租户详情失败' })
  }
})

// POST /api/admin/tenants — 创建租户
router.post('/tenants', async (req: Request, res: Response): Promise<void> => {
  const parsed = createTenantSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { name, domain, contactPerson, contactPhone, contactEmail, logo, seatNum, subjectNum, expireTime } = parsed.data
  const code = parsed.data.code || randomUUID().slice(0, 8)

  try {
    const tenant = await prisma.tenant.create({
      data: {
        code,
        name,
        domain: domain || null,
        contactPerson,
        contactPhone,
        contactEmail: contactEmail || null,
        logo: logo || null,
        seatNum: seatNum ?? 0,
        subjectNum: subjectNum ?? 0,
        expireTime: expireTime ? new Date(expireTime) : null,
      },
      select: tenantSelect,
    })
    res.status(201).json({ tenant })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2002') {
      res.status(409).json({ error: '租户编码或手机号已存在' })
    } else {
      res.status(500).json({ error: '创建租户失败' })
    }
  }
})

// PATCH /api/admin/tenants/:id — 编辑租户
router.patch('/tenants/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateTenantSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const id = paramId(req)
  const data: Record<string, unknown> = { ...parsed.data }
  if (data.expireTime !== undefined) {
    data.expireTime = data.expireTime ? new Date(data.expireTime as string) : null
  }

  try {
    const tenant = await prisma.tenant.update({
      where: { id },
      data,
      select: tenantSelect,
    })
    res.json({ tenant })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '租户不存在' })
    } else if (err.code === 'P2002') {
      res.status(409).json({ error: '域名或手机号已存在' })
    } else {
      res.status(500).json({ error: '更新租户失败' })
    }
  }
})

// DELETE /api/admin/tenants/:id — 删除租户（软删除）
router.delete('/tenants/:id', async (req: Request, res: Response): Promise<void> => {
  const id = paramId(req)
  try {
    await prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '租户不存在' })
    } else {
      res.status(500).json({ error: '删除租户失败' })
    }
  }
})

// ===== 租户充值 =====

const rechargeSchema = z.object({
  amount: z.number().refine(v => v !== 0, '金额不能为0').refine(v => Math.abs(v) <= 10000000, '金额过大'),
  description: z.string().optional(),
})

// POST /api/admin/tenants/:id/recharge — 正数充值，负数回收
router.post('/tenants/:id/recharge', async (req: Request, res: Response): Promise<void> => {
  const parsed = rechargeSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }

  const { amount, description } = parsed.data
  const tenantId = paramId(req)
  const absAmount = Math.abs(amount)
  const isRevoke = amount < 0

  try {
    if (isRevoke) {
      const [tenant] = await prisma.$transaction([
        prisma.tenant.update({ where: { id: tenantId, credits: { gte: absAmount } }, data: { credits: { decrement: absAmount } }, select: { id: true, credits: true } }),
        prisma.creditTransaction.create({ data: { tenantId, amount, type: 'TENANT_REVOKE', description: description || `平台回收 ${absAmount} 算力` } }),
      ])
      res.json({ tenant })
    } else {
      const [tenant] = await prisma.$transaction([
        prisma.tenant.update({ where: { id: tenantId }, data: { credits: { increment: amount } }, select: { id: true, credits: true } }),
        prisma.creditTransaction.create({ data: { tenantId, amount, type: 'TENANT_RECHARGE', description: description || `平台充值 ${amount} 算力` } }),
      ])
      res.json({ tenant })
    }
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') res.status(400).json({ error: isRevoke ? '租户算力不足' : '租户不存在' })
    else res.status(500).json({ error: '操作失败' })
  }
})

// GET /api/admin/dashboard — 平台总览
router.get('/dashboard', async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000)

    const [tenantTotal, tenantActive, consume, recharge, topTenants, recentFlows, dailyConsume] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.creditTransaction.aggregate({ where: { type: 'GENERATION_DEDUCTION', createdAt: { gte: weekStart } }, _sum: { amount: true } }),
      prisma.creditTransaction.aggregate({ where: { type: 'TENANT_RECHARGE' }, _sum: { amount: true } }),
      prisma.tenant.findMany({ orderBy: { credits: 'desc' }, take: 5, select: { id: true, name: true, credits: true } }),
      prisma.creditTransaction.findMany({ where: { type: { in: ['TENANT_RECHARGE', 'GENERATION_DEDUCTION'] } }, orderBy: { createdAt: 'desc' }, take: 10, select: { amount: true, type: true, description: true, createdAt: true, tenant: { select: { name: true } } } }),
      prisma.$queryRaw<{ day: string; consumed: number }[]>`
        SELECT DATE(ct."createdAt") as day, COALESCE(SUM(ABS(ct.amount)), 0)::int as consumed
        FROM "CreditTransaction" ct
        WHERE ct.type = 'GENERATION_DEDUCTION'
          AND ct."createdAt" >= ${weekStart}
        GROUP BY DATE(ct."createdAt")
        ORDER BY day ASC
      `,
    ])

    res.json({
      tenantTotal,
      tenantActive,
      totalRecharge: recharge._sum.amount || 0,
      weekConsume: -(consume._sum.amount || 0),
      topTenants,
      recentFlows: recentFlows.map(f => ({
        amount: f.amount,
        type: f.type,
        description: f.description,
        tenantName: (f as any).tenant?.name || '-',
        createdAt: (f as any).createdAt,
      })),
      dailyConsume,
    })
  } catch {
    res.status(500).json({ error: '获取看板数据失败' })
  }
})

export default router
