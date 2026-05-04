import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import prisma from '../lib/prisma'
import { authMiddleware, adminMiddleware } from '../middleware/auth'

const router = Router()

router.use(authMiddleware, adminMiddleware)

const userSelect = { id: true, username: true, role: true, credits: true, createdAt: true, updatedAt: true }

const createUserSchema = z.object({
  username: z.string().min(2, '用户名至少需要2个字符'),
  password: z.string().min(6, '密码至少需要6个字符'),
  role: z.enum(['USER', 'ADMIN']).optional(),
})

const updateUserSchema = z.object({
  username: z.string().min(2, '用户名至少需要2个字符').optional(),
  password: z.string().min(6, '密码至少需要6个字符').optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
})

const creditSchema = z.object({
  amount: z.number().min(-100000).max(100000),
})

// GET — list all users (with optional pagination)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = parseInt(req.query.offset as string, 10) || 0
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200)

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count(),
    ])
    res.json({ users, total })
  } catch {
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

// POST — create user
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { username, password, role } = parsed.data

  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) {
    res.status(409).json({ error: '用户名已被使用' })
    return
  }

  try {
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, password: hashed, role: role || 'USER' },
      select: userSelect,
    })
    res.status(201).json({ user })
  } catch {
    res.status(500).json({ error: '创建用户失败' })
  }
})

// PATCH — update user
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '用户 ID 无效' })
    return
  }

  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const data: Record<string, unknown> = { ...parsed.data }
  if (data.password) {
    data.password = await bcrypt.hash(data.password as string, 10)
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    })
    res.json({ user })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '用户不存在' })
    } else {
      res.status(500).json({ error: '更新用户失败' })
    }
  }
})

// PATCH /:id/credits — adjust user credits
router.patch('/:id/credits', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '用户 ID 无效' })
    return
  }

  const parsed = creditSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { credits: { increment: parsed.data.amount } },
        select: userSelect,
      }),
      prisma.creditTransaction.create({
        data: {
          userId: id,
          amount: parsed.data.amount,
          type: parsed.data.amount >= 0 ? 'ADMIN_GRANT' : 'ADMIN_REVOKE',
          description: `管理员调整算力 ${parsed.data.amount >= 0 ? '+' : ''}${parsed.data.amount}`,
        },
      }),
    ])
    res.json({ user })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '用户不存在' })
    } else {
      res.status(500).json({ error: '调整积分失败' })
    }
  }
})

// DELETE — remove user
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: '用户 ID 无效' })
    return
  }

  if (req.user?.userId === id) {
    res.status(400).json({ error: '不能删除自己的账号' })
    return
  }

  try {
    // 清理用户所有画布中的资源文件
    const assets = await prisma.generatedAsset.findMany({
      where: { canvas: { userId: id } },
      select: { filename: true },
    })
    const ASSETS_DIR = path.join(__dirname, '../../data/assets')
    for (const asset of assets) {
      try { await fs.unlink(path.join(ASSETS_DIR, asset.filename)) } catch { /* skip */ }
    }

    await prisma.user.delete({ where: { id } })
    res.json({ success: true })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '用户不存在' })
    } else {
      res.status(500).json({ error: '删除用户失败' })
    }
  }
})

export default router
