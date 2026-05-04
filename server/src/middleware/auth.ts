import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
if (!ACCESS_SECRET) throw new Error('缺少环境变量 JWT_ACCESS_SECRET')

// 内存缓存 tokenVersion，减少每次请求的 DB 查询
const tvCache = new Map<number, { version: number; ts: number }>()
const TV_CACHE_TTL = 30_000

export function clearTvCache(userId: number) {
  tvCache.delete(userId)
}

export interface AuthPayload {
  userId: number
  username: string
  role: string
  tokenVersion: number
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, ACCESS_SECRET!) as unknown as AuthPayload

    // 检查 tokenVersion 缓存
    const cached = tvCache.get(payload.userId)
    if (cached && cached.version === payload.tokenVersion && Date.now() - cached.ts < TV_CACHE_TTL) {
      req.user = payload
      return next()
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      tvCache.delete(payload.userId)
      res.status(401).json({ error: 'token 已失效，请重新登录' })
      return
    }
    tvCache.set(payload.userId, { version: user.tokenVersion, ts: Date.now() })
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'token 无效或已过期' })
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }
  next()
}
