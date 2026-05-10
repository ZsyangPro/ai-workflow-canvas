import path from 'path'
import fs from 'fs/promises'
import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult } from './types'
import { compressImageIfNeeded } from '../image-utils'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; data: string }
}

const SAFETY_MAX_BASE64 = 12 * 1024 * 1024 // 12MB safety net, compression should keep well under this

async function resolveImageBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
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
  const base64 = compressed.buffer.toString('base64')

  if (base64.length > SAFETY_MAX_BASE64) {
    const sizeMB = (base64.length / (1024 * 1024)).toFixed(1)
    throw new Error(`参考图过大（${sizeMB} MB），请压缩后重试`)
  }

  return { base64, mimeType: compressed.mimeType }
}

export class SophnetGeminiProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const url = `${model.baseUrl}/imagegenerator/google/v1beta/models/${model.modelName}:generateContent`

    let prompt = req.prompt
    if (req.size) {
      const [w, h] = req.size.split('x').map(Number)
      if (w && h) {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
        const d = gcd(w, h)
        if (w > h) prompt = `Generate a wide landscape image (${w / d}:${h / d} aspect ratio): ${req.prompt}`
        else if (h > w) prompt = `Generate a tall portrait image (${w / d}:${h / d} aspect ratio): ${req.prompt}`
        else prompt = `Generate a square image: ${req.prompt}`
      }
    }

    const parts: GeminiPart[] = [{ text: prompt }]

    if (req.images && req.images.length > 0) {
      for (const imgUrl of req.images) {
        const { base64, mimeType } = await resolveImageBase64(imgUrl)
        parts.push({ inlineData: { mimeType, data: base64 } })
      }
    }

    const body = {
      contents: [{ parts }],
    }

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
      const msg = (errData as Record<string, unknown>).error as string | undefined
      throw new Error(msg || `Gemini API 返回错误 ${res.status}`)
    }

    const data = (await res.json()) as Record<string, unknown>
    const candidates = data.candidates as Array<{ content?: { parts?: GeminiPart[] } }> | undefined
    if (!candidates?.length) {
      throw new Error('Gemini 响应不含 candidates')
    }

    const respParts = candidates[0].content?.parts
    if (!respParts?.length) {
      throw new Error('Gemini 响应不含 parts')
    }

    const images = respParts
      .filter((p) => p.inlineData?.data)
      .map((p) => {
        const mimeType = p.inlineData!.mimeType || 'image/png'
        const b64_json = p.inlineData!.data
        return { b64_json, url: `data:${mimeType};base64,${b64_json}` }
      })

    if (!images.length) {
      throw new Error('Gemini 未返回图片数据')
    }

    return { images }
  }
}
