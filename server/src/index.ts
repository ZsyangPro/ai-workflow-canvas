import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import modelsRoutes from './routes/models'
import generateRoutes from './routes/generate'
import canvasRoutes from './routes/canvas'
import assetsRoutes from './routes/assets'
import creditsRoutes from './routes/credits'
import prisma from './lib/prisma'

const app = express()
const PORT = process.env.PORT || 3000

// 部署在 Nginx 等反向代理后需要 trust proxy，否则 rate limit 拿不到真实 IP
app.set('trust proxy', 1)

// 校验必要的环境变量
const requiredEnvs = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`缺少必要的环境变量: ${env}`)
    process.exit(1)
  }
}

app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '2mb' }))

// 全局速率限制（login/register 端点有更严格的单独限制）
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
}))

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/models', modelsRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/canvas', canvasRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/credits', creditsRoutes)

// 静态文件服务 — 生成的图片资源（路由之后，仅处理未匹配的文件请求）
app.use('/api/assets', express.static(path.join(__dirname, '../data/assets')))

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})
