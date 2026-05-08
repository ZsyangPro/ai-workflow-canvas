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
  tenantId: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
      tenantId?: string
      scope?: { tenantId?: string }
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
  } catch (e) {
    console.error("[auth-middleware]", e)
    res.status(401).json({ error: 'token 无效或已过期' })
  }
}

// 角色守卫：仅允许指定角色
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: '未登录' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: '无此操作权限' })
      return
    }
    next()
  }
}

// 超级管理员守卫
export const requireSuperAdmin = requireRole('SUPER_ADMIN')

// 租户管理员或超级管理员（可管理租户内资源）
export const requireTenantScope = requireRole('SUPER_ADMIN', 'TENANT_ADMIN')

// 租户作用域中间件：注入 req.scope
// SUPER_ADMIN: 通过 X-Tenant-Id header 指定，无则空 scope（所有租户）
// TENANT_ADMIN: scope 固定在 JWT 中的 tenantId
export function scopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: '未登录' })
    return
  }

  if (req.user.role === 'SUPER_ADMIN') {
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    req.scope = headerTenantId ? { tenantId: headerTenantId } : {}
  } else if (req.user.role === 'TENANT_ADMIN') {
    if (!req.user.tenantId) {
      res.status(400).json({ error: '租户管理员必须绑定租户' })
      return
    }
    req.scope = { tenantId: req.user.tenantId }
  }

  next()
}

// 租户身份识别中间件（用于用户端 API 识别租户上下文）
// 优先级：X-Tenant-Id header > 域名匹配 > 用户 JWT 中的 tenantId
export function tenantResolver(req: Request, _res: Response, next: NextFunction): void {
  // X-Tenant-Id header
  const headerTenantId = req.headers['x-tenant-id'] as string | undefined
  if (headerTenantId) {
    req.tenantId = headerTenantId
    return next()
  }

  // 已登录用户的归属租户
  if (req.user?.tenantId) {
    req.tenantId = req.user.tenantId
    return next()
  }

  next()
}
