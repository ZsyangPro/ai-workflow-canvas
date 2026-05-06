import { Router, Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { authMiddleware } from '../middleware/auth'
import { getProvider } from '../lib/providers'
import { downloadAndSave, saveBase64, fetchToBase64 } from '../lib/storage'

const GENERATE_TIMEOUT_MS = 60_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

const router = Router()

router.use(authMiddleware)

const generateSchema = z.object({
  modelId: z.number(),
  canvasId: z.number(),
  prompt: z.string().min(1, '提示词不能为空'),
  negative_prompt: z.string().optional(),
  size: z.string().optional(),
  ratio: z.string().optional(),
  images: z.array(z.string()).optional(),
  max_images: z.number().min(1).max(15).optional(),
  output_format: z.enum(['png', 'jpeg']).optional(),
  watermark: z.boolean().optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  optimize_mode: z.enum(['standard', 'fast']).optional(),
  enable_web_search: z.boolean().optional(),
  stream: z.boolean().optional(),
  save: z.boolean().optional().default(true),
  nodeId: z.string().optional(),
})

// POST /api/generate — 图片生成
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { modelId, canvasId, prompt, negative_prompt, size, quality, ratio, images, max_images, output_format, watermark, optimize_mode, enable_web_search, stream, save, nodeId } = parsed.data

  const aiModel = await prisma.aiModel.findUnique({ where: { id: modelId } })
  if (!aiModel || !aiModel.enabled) {
    res.status(400).json({ error: '模型不可用' })
    return
  }

  // 校验画布所有权
  const canvas = await prisma.canvas.findUnique({ where: { id: canvasId } })
  if (!canvas || canvas.userId !== req.user!.userId) {
    res.status(404).json({ error: '画布不存在' })
    return
  }

  // 检查算力（max_images 控制出图数量，消耗相应倍率算力）
  const totalCost = aiModel.costCredits * (max_images || 1)
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user || user.credits < totalCost) {
    res.status(402).json({ error: `算力不足，需要 ${totalCost} 算力，当前 ${user?.credits || 0} 算力` })
    return
  }

  const provider = getProvider(aiModel.provider)
  if (!provider) {
    res.status(400).json({ error: `不支持的供应商: ${aiModel.provider}` })
    return
  }

  const genReq = {
    prompt,
    negative_prompt,
    size,
    quality,
    images,
    max_images,
    output_format,
    watermark,
    optimize_mode,
    enable_web_search,
  }

  // Streaming mode
  if (stream && provider.generateStream) {
    // 乐观扣减：先扣算力再生成
    let deducted = false
    try {
      const updated = await prisma.user.update({
        where: { id: req.user!.userId, credits: { gte: totalCost } },
        data: { credits: { decrement: totalCost } },
      })
      deducted = true
      await prisma.creditTransaction.create({
        data: {
          userId: req.user!.userId,
          amount: -totalCost,
          type: 'GENERATION_DEDUCTION',
          relatedModelId: aiModel.id,
          description: `调用模型 ${aiModel.name} 生成图片`,
        },
      })

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      res.write(`data: ${JSON.stringify({ type: 'credits_updated', credits: updated.credits })}\n\n`)

      for await (const event of provider.generateStream(
        { baseUrl: aiModel.baseUrl, apiKey: aiModel.apiKey, modelName: aiModel.modelName },
        genReq,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    } catch (e: unknown) {
      // 退款
      if (deducted) {
        try {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: req.user!.userId },
              data: { credits: { increment: totalCost } },
            }),
            prisma.creditTransaction.create({
              data: {
                userId: req.user!.userId,
                amount: totalCost,
                type: 'GENERATION_REFUND',
                relatedModelId: aiModel.id,
                description: `流式生成失败退款 — ${aiModel.name}`,
              },
            }),
          ])
        } catch { /* best-effort refund */ }
      }
      const message = e instanceof Error ? e.message : '流式生成失败'
      // If headers already sent, write error event; otherwise set status
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
      } else {
        const status = (e as { code?: string }).code === 'P2025' ? 402 : 502
        res.status(status).json({ error: message })
      }
    }

    if (!res.writableEnded) res.end()
    return
  }

  // Non-streaming mode — 乐观扣减：先扣算力再生成，失败退款
  let deducted = false
  try {
    // 原子检查并扣减
    let updated
    try {
      updated = await prisma.user.update({
        where: { id: req.user!.userId, credits: { gte: totalCost } },
        data: { credits: { decrement: totalCost } },
      })
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2025') {
        res.status(402).json({ error: `算力不足，需要 ${totalCost} 算力` })
        return
      }
      throw e
    }
    deducted = true
    await prisma.creditTransaction.create({
      data: {
        userId: req.user!.userId,
        amount: -totalCost,
        type: 'GENERATION_DEDUCTION',
        relatedModelId: aiModel.id,
        description: `调用模型 ${aiModel.name} 生成图片`,
      },
    })

    const result = await withTimeout(provider.generate(
      { baseUrl: aiModel.baseUrl, apiKey: aiModel.apiKey, modelName: aiModel.modelName },
      genReq,
    ), GENERATE_TIMEOUT_MS * (max_images || 1), '生成请求')

    // 处理生成的图片
    const savedImages: Array<{ url?: string; b64_json?: string; id: number }> = []

    for (const img of result.images) {
      try {
        if (save) {
          // 自动保存到磁盘 + 数据库（兼容现有行为）
          let filename: string
          let mimeType: string

          if (img.b64_json) {
            const saved = await saveBase64(img.b64_json)
            filename = saved.filename
            mimeType = saved.mimeType
          } else if (img.url) {
            const saved = await downloadAndSave(img.url)
            filename = saved.filename
            mimeType = saved.mimeType
          } else {
            continue
          }

          const asset = await prisma.generatedAsset.create({
            data: {
              canvasId: canvas.id,
              nodeId: nodeId || null,
              filename,
              mimeType,
              prompt,
              modelName: aiModel.modelName,
            },
          })
          savedImages.push({ url: `/api/assets/${filename}`, id: asset.id })
        } else {
          // 不落盘，返回 base64 给前端
          let b64: string
          if (img.b64_json) {
            b64 = img.b64_json
          } else if (img.url) {
            b64 = await fetchToBase64(img.url)
          } else {
            continue
          }
          // 确保 base64 有 data URI 前缀，前端 <img src> 直接使用
          savedImages.push({ b64_json: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`, id: 0 })
        }
      } catch {
        // 单张下载失败
        if (img.url) {
          savedImages.push({ url: img.url, id: 0 })
        }
      }
    }

    res.json({ images: savedImages, credits: updated.credits })
  } catch (e: unknown) {
    // 生成或下载失败 — 退款
    if (deducted) {
      try {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: req.user!.userId },
            data: { credits: { increment: totalCost } },
          }),
          prisma.creditTransaction.create({
            data: {
              userId: req.user!.userId,
              amount: totalCost,
              type: 'GENERATION_REFUND',
              relatedModelId: aiModel.id,
              description: `生成失败退款 — ${aiModel.name}`,
            },
          }),
        ])
      } catch { /* best-effort refund */ }
    }
    // Don't re-throw P2025 — it was handled above as 402
    if ((e as { code?: string }).code === 'P2025') return
    const message = e instanceof Error ? e.message : '生成请求失败'
    const status = message.includes('超时') ? 504 : 502
    res.status(status).json({ error: message })
  }
})

export default router
