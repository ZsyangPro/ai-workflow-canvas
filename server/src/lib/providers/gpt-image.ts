import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult } from './types'

export class GptImageProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
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
}
