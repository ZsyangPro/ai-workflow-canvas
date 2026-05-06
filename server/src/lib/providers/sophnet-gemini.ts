import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult } from './types'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; data: string }
}

export class SophnetGeminiProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const url = `${model.baseUrl}/imagegenerator/google/v1beta/models/${model.modelName}:generateContent`

    // 将 size 参数转为比例提示拼入 prompt
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

    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
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

    const parts = candidates[0].content?.parts
    if (!parts?.length) {
      throw new Error('Gemini 响应不含 parts')
    }

    const images = parts
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
