import path from 'path'
import fs from 'fs/promises'
import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult } from './types'
import { compressImageIfNeeded } from '../image-utils'

async function resolveImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  let buffer: Buffer
  let mimeType: string

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    mimeType = match?.[1] || 'image/png'
    const b64 = match?.[2] || imageUrl.split(',')[1]
    buffer = Buffer.from(b64, 'base64')
  } else if (imageUrl.startsWith('/api/assets/')) {
    const filename = imageUrl.replace('/api/assets/', '')
    const filePath = path.join(__dirname, '../../../data/assets', filename)
    buffer = await fs.readFile(filePath)
    const ext = path.extname(filename).toLowerCase()
    mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
  } else {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`下载参考图失败: ${res.status}`)
    mimeType = res.headers.get('content-type') || 'image/png'
    buffer = Buffer.from(await res.arrayBuffer())
  }

  const compressed = await compressImageIfNeeded(buffer, mimeType)
  const ext = compressed.mimeType.split('/')[1] || 'jpg'
  return { buffer: compressed.buffer, mimeType: compressed.mimeType, filename: `image.${ext}` }
}

export class GptImageProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    if (req.images && req.images.length > 0) {
      return this.generateEdit(model, req)
    }

    const url = `${model.baseUrl}/images/generations`

    const body: Record<string, unknown> = {
      model: model.modelName,
      prompt: req.prompt,
      size: req.size || '1024x1024',
      quality: req.quality || 'low',
      n: req.max_images || 1,
    }
    if (req.output_format) body.output_format = req.output_format

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const msg = (errData as Record<string, unknown>).message as string
        || (errData as Record<string, unknown>).error as string
        || `GPT-Image 返回错误 ${res.status}`
      throw new Error(String(msg))
    }

    const data = (await res.json()) as Record<string, unknown>
    const items = data.data as Array<{ b64_json?: string; url?: string }> | undefined
    if (!items?.length) {
      throw new Error('GPT-Image 未返回图片')
    }

    const images = items.map((item) => {
      const b64_json = item.b64_json
      const imgUrl = item.url
      if (b64_json) return { b64_json }
      if (imgUrl) return { url: imgUrl }
      return {}
    }).filter((img) => img.b64_json || img.url)

    if (!images.length) {
      throw new Error('GPT-Image 未返回图片数据')
    }

    return { images }
  }

  private async generateEdit(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const { buffer, mimeType, filename } = await resolveImageBuffer(req.images![0])

    const formData = new FormData()
    formData.append('image', new Blob([buffer], { type: mimeType }), filename)
    formData.append('prompt', req.prompt)
    formData.append('model', model.modelName)
    formData.append('size', req.size || '1024x1024')
    formData.append('quality', req.quality || 'low')
    formData.append('n', String(req.max_images || 1))
    formData.append('input_fidelity', 'high')

    if (req.output_format) formData.append('output_format', req.output_format)

    const url = `${model.baseUrl}/images/edits`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const msg = (errData as Record<string, unknown>).message as string
        || (errData as Record<string, unknown>).error as string
        || `GPT-Image 编辑返回错误 ${res.status}`
      throw new Error(String(msg))
    }

    const data = (await res.json()) as Record<string, unknown>
    const items = data.data as Array<{ b64_json?: string; url?: string }> | undefined
    if (!items?.length) {
      throw new Error('GPT-Image 未返回图片')
    }

    const images = items.map((item) => {
      const b64_json = item.b64_json
      const imgUrl = item.url
      if (b64_json) return { b64_json }
      if (imgUrl) return { url: imgUrl }
      return {}
    }).filter((img) => img.b64_json || img.url)

    if (!images.length) {
      throw new Error('GPT-Image 未返回图片数据')
    }

    return { images }
  }
}
