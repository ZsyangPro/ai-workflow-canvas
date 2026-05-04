import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult, GeneratedImage, GenerateStreamEvent } from './types'

const VALID_SIZES: Record<string, string[]> = {
  'doubao-seedream-5-0-260128': ['2K', '3K', '4K'],
  'doubao-seedream-5-0-lite-260128': ['2K', '3K', '4K'],
  'doubao-seedream-4-5-251128': ['2K', '4K'],
  'doubao-seedream-4-0-250828': ['1K', '2K', '4K'],
}

function resolveSize(modelName: string, size?: string): string {
  if (!size) return '2048x2048'
  const validList = VALID_SIZES[modelName]
  if (validList && validList.includes(size)) return size
  if (/^\d+x\d+$/i.test(size)) return size
  return '2048x2048'
}

export class SeedreamProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: model.modelName,
      prompt: req.prompt,
      size: resolveSize(model.modelName, req.size),
      sequential_image_generation: (req.max_images && req.max_images > 1) ? 'auto' : 'disabled',
      response_format: 'url',
      watermark: req.watermark ?? false,
    }

    if (req.max_images && req.max_images > 1) {
      body.sequential_image_generation_options = { max_images: req.max_images }
    }

    if (req.negative_prompt) {
      body.negative_prompt = req.negative_prompt
    }

    if (req.output_format) {
      body.output_format = req.output_format
    }

    if (req.enable_web_search) {
      body.tools = [{ type: 'web_search' }]
    }

    if (req.optimize_mode) {
      body.optimize_prompt_options = { mode: req.optimize_mode }
    }

    // image parameter: single URL or array of URLs
    if (req.images && req.images.length > 0) {
      body.image = req.images.length === 1 ? req.images[0] : req.images
    }

    const res = await fetch(`${model.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = (await res.json()) as Record<string, unknown>

    if (!res.ok || data.error) {
      const err = data.error as Record<string, string> | undefined
      throw new Error(err?.message || err?.code || `生成失败 (HTTP ${res.status})`)
    }

    const results = data.data as Array<{ url?: string; b64_json?: string; size?: string }> | undefined
    if (!results || results.length === 0) {
      throw new Error('生成成功但未返回图片')
    }

    const images: GeneratedImage[] = results.map((img) => ({
      url: img.url,
      b64_json: img.b64_json,
      size: img.size,
    }))

    return { images }
  }

  async *generateStream(model: AiModelConfig, req: GenerateRequest): AsyncIterable<GenerateStreamEvent> {
    const body: Record<string, unknown> = {
      model: model.modelName,
      prompt: req.prompt,
      size: resolveSize(model.modelName, req.size),
      sequential_image_generation: (req.max_images && req.max_images > 1) ? 'auto' : 'disabled',
      response_format: 'b64_json',
      stream: true,
      watermark: req.watermark ?? false,
    }

    if (req.max_images && req.max_images > 1) {
      body.sequential_image_generation_options = { max_images: req.max_images }
    }

    if (req.negative_prompt) {
      body.negative_prompt = req.negative_prompt
    }

    if (req.output_format) {
      body.output_format = req.output_format
    }

    if (req.enable_web_search) {
      body.tools = [{ type: 'web_search' }]
    }

    if (req.optimize_mode) {
      body.optimize_prompt_options = { mode: req.optimize_mode }
    }

    if (req.images && req.images.length > 0) {
      body.image = req.images.length === 1 ? req.images[0] : req.images
    }

    const res = await fetch(`${model.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const err = (errData as Record<string, unknown>).error as Record<string, string> | undefined
      throw new Error(err?.message || err?.code || `流式生成失败 (HTTP ${res.status})`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法读取流式响应')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue

          try {
            const event = JSON.parse(raw) as Record<string, unknown>

            if (event.type === 'image_generation.partial_succeeded') {
              const img: GeneratedImage = {}
              if (event.url) img.url = event.url as string
              if (event.b64_json) img.b64_json = event.b64_json as string
              if (event.size) img.size = event.size as string
              yield { type: 'partial_succeeded', image: img }
            } else if (event.type === 'image_generation.partial_failed') {
              const err = event.error as Record<string, string> | undefined
              yield { type: 'partial_failed', error: err?.message || '生成失败' }
            } else if (event.type === 'image_generation.completed') {
              yield { type: 'completed', usage: event.usage }
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
