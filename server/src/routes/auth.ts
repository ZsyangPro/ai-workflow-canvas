import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import prisma from '../lib/prisma'
import { authMiddleware, AuthPayload, clearTvCache } from '../middleware/auth'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
if (!ACCESS_SECRET) throw new Error('缺少环境变量 JWT_ACCESS_SECRET')
if (!REFRESH_SECRET) throw new Error('缺少环境变量 JWT_REFRESH_SECRET')

const ACCESS_TTL = '15m'
const REFRESH_TTL = '7d'

const router = Router()

// 速率限制
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '登录尝试过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
})

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: '注册过于频繁，请稍后再试' },
  standardHeaders: true,
  skip: () => process.env.NODE_ENV === 'test',
  legacyHeaders: false,
})

const authSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符'),
  password: z.string().min(6, '密码至少6位'),
})

function signTokens(payload: AuthPayload) {
  const accessToken = jwt.sign(payload, ACCESS_SECRET!, { expiresIn: ACCESS_TTL })
  const refreshToken = jwt.sign(payload, REFRESH_SECRET!, { expiresIn: REFRESH_TTL })
  return { accessToken, refreshToken }
}

// POST /api/auth/register
router.post('/register', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = authSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { username, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    res.status(409).json({ error: '用户名已存在' })
    return
  }

  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { username, password: hash },
  })

  const payload: AuthPayload = { userId: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }
  const tokens = signTokens(payload)

  res.status(201).json({
    user: { id: user.id, username: user.username, role: user.role },
    ...tokens,
  })
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = authSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { username, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  const payload: AuthPayload = { userId: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }
  const tokens = signTokens(payload)

  res.json({
    user: { id: user.id, username: user.username, role: user.role },
    ...tokens,
  })
})

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    res.status(400).json({ error: '缺少 refreshToken' })
    return
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET!) as AuthPayload
    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) {
      res.status(401).json({ error: '用户不存在' })
      return
    }

    // 校验 tokenVersion：如果用户退出过，token 失效
    if (user.tokenVersion !== payload.tokenVersion) {
      res.status(401).json({ error: 'token 已失效，请重新登录' })
      return
    }

    const newPayload: AuthPayload = { userId: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }
    const tokens = signTokens(newPayload)
    res.json(tokens)
  } catch {
    res.status(401).json({ error: 'refreshToken 无效或已过期' })
  }
})

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // 递增 tokenVersion 使所有已签发的 token 失效
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { tokenVersion: { increment: 1 } },
    })
    clearTvCache(req.user!.userId)
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: '退出失败' })
  }
})

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  res.json({ user: { ...req.user, credits: user?.credits ?? 0 } })
})

export default router
