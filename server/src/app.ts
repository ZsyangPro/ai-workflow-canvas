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
import adminRoutes from './routes/admin'
import tenantRoutes from './routes/tenant'
import prisma from './lib/prisma'

const app = express()

app.set('trust proxy', 1)

app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))

if (process.env.NODE_ENV !== 'test') {
  app.use(rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试' },
  }))
}

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/models', modelsRoutes)
app.use('/api/generate', generateRoutes)
app.use('/api/canvas', canvasRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/credits', creditsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/tenant', tenantRoutes)

app.use('/api/assets', express.static(path.join(__dirname, '../data/assets')))

// 全局错误处理 — 兜底所有未捕获的异常
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', req.method, req.path, err)
  res.status(500).json({ error: '服务器内部错误' })
})

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

export default app
