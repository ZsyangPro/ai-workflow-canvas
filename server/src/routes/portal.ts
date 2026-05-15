import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma'
import { authMiddleware, scopeMiddleware } from '../middleware/auth'

const ASSETS_DIR = path.join(__dirname, '../../data/assets')
const upload = multer({
  storage: multer.diskStorage({
    destination: ASSETS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png'
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('仅支持图片文件'))
  },
})

const router = Router()

// ==================== 通用接口 ====================

// POST /upload — 上传图片（登录即可），自动压缩为 WebP 长边 2560px
// 注意：multer 处理 multipart，express.json 遇到 multipart 会跳过（通过 content-type 判断）
router.post('/upload', authMiddleware, (req: Request, res: Response, next) => {
  upload.single('file')(req, res, next)
}, async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: '请选择文件' }); return }

    let filename = req.file.filename
    let url = `/api/assets/${filename}`

    // 自动压缩：长边 ≤ 2560px，转 WebP 质量 85%
    try {
      const sharp = require('sharp')
      const fs = await import('fs/promises')
      const inputPath = req.file.path
      const webpFilename = filename.replace(/\.[^.]+$/, '.webp')
      const outputPath = inputPath.replace(filename, webpFilename)

      await sharp(inputPath)
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(outputPath)

      // 删掉原始文件，指向压缩后的 WebP
      await fs.unlink(inputPath)
      filename = webpFilename
      url = `/api/assets/${webpFilename}`
    } catch (sharpErr) {
      // sharp 不可用时保留原始文件，不影响上传
      console.warn('[portal] sharp compress skipped:', String(sharpErr))
    }

    res.json({ url, filename })
  } catch (e) {
    console.error('[portal] upload error:', e)
    res.status(500).json({ error: '上传失败' })
  }
})

// ==================== 管理接口（必须在 /:tenantCode 之前注册） ====================

// GET /api/portal/blocks/:tenantId
router.get('/blocks/:tenantId', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const blocks = await prisma.portalBlock.findMany({
      where: { tenantId: req.params.tenantId },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(blocks)
  } catch (e) {
    console.error('[portal] GET blocks error:', e)
    res.status(500).json({ error: '获取区块列表失败' })
  }
})

// POST /api/portal/blocks/:tenantId
router.post('/blocks/:tenantId', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, config } = req.body
    if (!type) {
      res.status(400).json({ error: '缺少区块类型' })
      return
    }
    const maxBlock = await prisma.portalBlock.findFirst({
      where: { tenantId: req.params.tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const sortOrder = (maxBlock?.sortOrder ?? -1) + 1

    const block = await prisma.portalBlock.create({
      data: { tenantId: req.params.tenantId, type, sortOrder, config: config || {} },
    })
    res.status(201).json(block)
  } catch (e) {
    console.error('[portal] POST block error:', e)
    res.status(500).json({ error: '创建区块失败' })
  }
})

// PUT /api/portal/blocks/:tenantId/reorder（必须在 /:id 之前）
router.put('/blocks/:tenantId/reorder', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] }
    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ error: 'orderedIds 必须是数组' })
      return
    }
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.portalBlock.updateMany({ where: { id, tenantId: req.params.tenantId }, data: { sortOrder: index } }),
      ),
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] PUT reorder error:', e)
    res.status(500).json({ error: '排序失败' })
  }
})

// PUT /api/portal/blocks/:tenantId/:id
router.put('/blocks/:tenantId/:id', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { config, enabled, type } = req.body
    const data: any = {}
    if (config !== undefined) data.config = config
    if (enabled !== undefined) data.enabled = enabled
    if (type !== undefined) data.type = type

    console.log('[portal] PUT block id:', req.params.id, 'config:', JSON.stringify(config))
    const result = await prisma.portalBlock.updateMany({
      where: { id: req.params.id, tenantId: req.params.tenantId },
      data,
    })
    if (result.count === 0) {
      res.status(404).json({ error: '区块不存在' })
      return
    }
    const updated = await prisma.portalBlock.findUnique({ where: { id: req.params.id } })
    console.log('[portal] PUT block after save config:', JSON.stringify(updated?.config))
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] PUT block error:', e)
    res.status(500).json({ error: '更新区块失败' })
  }
})

// DELETE /api/portal/blocks/:tenantId/:id
router.delete('/blocks/:tenantId/:id', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    await prisma.portalBlock.deleteMany({ where: { id: req.params.id, tenantId: req.params.tenantId } })
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] DELETE block error:', e)
    res.status(500).json({ error: '删除区块失败' })
  }
})

// ==================== 公开接口 ====================

// GET /api/portal/:tenantCode（必须在所有 /blocks/* 之后注册）
router.get('/:tenantCode', async (req: Request, res: Response) => {
  try {
    const code = req.params.tenantCode
    const tenant = await prisma.tenant.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, logo: true, contactPhone: true },
    })
    if (!tenant) {
      res.status(404).json({ error: '租户不存在' })
      return
    }

    const blocks = await prisma.portalBlock.findMany({
      where: { tenantId: tenant.id, enabled: true },
      orderBy: { sortOrder: 'asc' },
    })

    const enriched = await Promise.all(
      blocks.map(async (block) => {
        if (block.type === 'models') {
          const config = block.config as any
          const modelIds: number[] = config.modelIds || []
          if (modelIds.length > 0) {
            const models = await prisma.aiModel.findMany({
              where: { id: { in: modelIds }, enabled: true },
              select: { id: true, name: true, category: true, description: true },
            })
            const modelMap = new Map(models.map((m) => [m.id, m]))
            const ordered = modelIds.map((id: number) => modelMap.get(id)).filter(Boolean)
            return { id: block.id, type: block.type, sortOrder: block.sortOrder, config: { ...config, models: ordered } }
          }
        }
        return { id: block.id, type: block.type, sortOrder: block.sortOrder, config: block.config }
      }),
    )

    res.json({
      tenant: { code: tenant.code, name: tenant.name, logo: tenant.logo, contactPhone: tenant.contactPhone },
      blocks: enriched,
    })
  } catch (e) {
    console.error('[portal] GET /:tenantCode error:', e)
    res.status(500).json({ error: '获取门户数据失败' })
  }
})

export default router
