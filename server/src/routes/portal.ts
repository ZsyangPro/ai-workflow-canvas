import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'
import prisma from '../lib/prisma'
import { authMiddleware, scopeMiddleware } from '../middleware/auth'
import { saveBase64 } from '../lib/storage'

const router = Router()

// ==================== 通用接口 ====================

router.post('/upload', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { image } = req.body
    if (!image) { res.status(400).json({ error: '请选择文件' }); return }

    const saved = await saveBase64(image)
    let filename = saved.filename
    let url = `/api/assets/${filename}`

    // 自动压缩：长边 ≤ 2560px，转 WebP 质量 85%
    try {
      const sharp = require('sharp')
      const assetsDir = path.join(__dirname, '../../data/assets')
      const inputPath = path.join(assetsDir, filename)
      const webpFilename = filename.replace(/\.[^.]+$/, '.webp')
      const outputPath = path.join(assetsDir, webpFilename)

      await sharp(inputPath)
        .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(outputPath)

      await fs.unlink(inputPath)
      filename = webpFilename
      url = `/api/assets/${webpFilename}`
    } catch (sharpErr) {
      console.warn('[portal] sharp compress skipped:', String(sharpErr))
    }

    res.json({ url, filename })
  } catch (e) {
    console.error('[portal] upload error:', e)
    res.status(500).json({ error: '上传失败' })
  }
})

// ==================== 管理接口 ====================

function tid(req: Request): string { return req.params.tenantId as string }
function bid(req: Request): string { return req.params.id as string }

router.get('/blocks/:tenantId', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const blocks = await prisma.portalBlock.findMany({
      where: { tenantId: tid(req) },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(blocks)
  } catch (e) {
    console.error('[portal] GET blocks error:', e)
    res.status(500).json({ error: '获取区块列表失败' })
  }
})

router.post('/blocks/:tenantId', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, config } = req.body
    if (!type) { res.status(400).json({ error: '缺少区块类型' }); return }
    const tenantId = tid(req)
    const maxBlock = await prisma.portalBlock.findFirst({
      where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    })
    const sortOrder = (maxBlock?.sortOrder ?? -1) + 1
    const block = await prisma.portalBlock.create({
      data: { tenantId, type, sortOrder, config: config || {} },
    })
    res.status(201).json(block)
  } catch (e) {
    console.error('[portal] POST block error:', e)
    res.status(500).json({ error: '创建区块失败' })
  }
})

router.put('/blocks/:tenantId/reorder', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] }
    if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds 必须是数组' }); return }
    const tenantId = tid(req)
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.portalBlock.updateMany({ where: { id, tenantId }, data: { sortOrder: index } }),
      ),
    )
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] PUT reorder error:', e)
    res.status(500).json({ error: '排序失败' })
  }
})

router.put('/blocks/:tenantId/:id', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    const { config, enabled, type } = req.body
    const data: any = {}
    if (config !== undefined) data.config = config
    if (enabled !== undefined) data.enabled = enabled
    if (type !== undefined) data.type = type

    const result = await prisma.portalBlock.updateMany({
      where: { id: bid(req), tenantId: tid(req) }, data,
    })
    if (result.count === 0) { res.status(404).json({ error: '区块不存在' }); return }
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] PUT block error:', e)
    res.status(500).json({ error: '更新区块失败' })
  }
})

router.delete('/blocks/:tenantId/:id', authMiddleware, scopeMiddleware, async (req: Request, res: Response) => {
  try {
    await prisma.portalBlock.deleteMany({ where: { id: bid(req), tenantId: tid(req) } })
    res.json({ ok: true })
  } catch (e) {
    console.error('[portal] DELETE block error:', e)
    res.status(500).json({ error: '删除区块失败' })
  }
})

// ==================== 公开接口 ====================

router.get('/:tenantCode', async (req: Request, res: Response) => {
  try {
    const code = req.params.tenantCode as string
    const tenant = await prisma.tenant.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, logo: true, contactPhone: true },
    })
    if (!tenant) { res.status(404).json({ error: '租户不存在' }); return }

    const blocks = await prisma.portalBlock.findMany({
      where: { tenantId: tenant.id, enabled: true },
      orderBy: { sortOrder: 'asc' },
    })

    const enriched = await Promise.all(blocks.map(async (block) => {
      if (block.type === 'models') {
        const config = block.config as any
        const mids: number[] = (config.modelIds || []) as number[]
        if (mids.length > 0) {
          const models = await prisma.aiModel.findMany({
            where: { id: { in: mids }, enabled: true },
            select: { id: true, name: true, category: true, description: true },
          })
          const modelMap = new Map(models.map((m) => [m.id, m]))
          const ordered = mids.map((id: number) => modelMap.get(id)).filter(Boolean)
          return { id: block.id, type: block.type, sortOrder: block.sortOrder, config: { ...config, models: ordered } }
        }
      }
      return { id: block.id, type: block.type, sortOrder: block.sortOrder, config: block.config }
    }))

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
