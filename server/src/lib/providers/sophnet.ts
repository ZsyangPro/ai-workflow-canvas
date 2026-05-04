import type { ImageProvider, AiModelConfig, GenerateRequest, GenerateResult } from './types'

function getField(data: Record<string, unknown>, key: string): unknown {
  if (data[key] !== undefined) return data[key]
  const output = data.output as Record<string, unknown> | undefined
  if (output && output[key] !== undefined) return output[key]
  return undefined
}

async function downloadAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'image/png'
    return `data:${ct};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

export class SophnetProvider implements ImageProvider {
  async generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const createBody: Record<string, unknown> = {
      model: model.modelName,
      input: { prompt: req.prompt },
      parameters: { size: req.size || '1024*1024' },
    }
    if (req.negative_prompt) {
      ;(createBody.input as Record<string, string>).negative_prompt = req.negative_prompt
    }

    const createRes = await fetch(`${model.baseUrl}/imagegenerator/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(createBody),
    })

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}))
      throw new Error((errData as Record<string, string>).message || '创建生成任务失败')
    }

    const createData = (await createRes.json()) as Record<string, unknown>
    const taskId = getField(createData, 'taskId') as string | undefined
    if (!taskId) {
      throw new Error(`未获取到任务 ID，响应: ${JSON.stringify(createData).slice(0, 200)}`)
    }

    // 轮询任务结果
    const maxAttempts = 30
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000))

      const pollRes = await fetch(`${model.baseUrl}/imagegenerator/task/${taskId}`, {
        headers: { Authorization: `Bearer ${model.apiKey}` },
      })

      if (!pollRes.ok) continue

      const pollData = (await pollRes.json()) as Record<string, unknown>
      const status = getField(pollData, 'taskStatus') as string | undefined
      const results = getField(pollData, 'results') as Array<{ url?: string }> | undefined
      const message = getField(pollData, 'message') as string | undefined

      if (status === 'SUCCEEDED') {
        const ossUrl = results?.[0]?.url
        if (!ossUrl) {
          throw new Error('生成成功但未返回图片')
        }

        const base64 = await downloadAsBase64(ossUrl as string)
        if (base64) {
          return { images: [{ url: base64 }] }
        }
        return { images: [{ url: ossUrl }] }
      }

      if (status === 'FAILED') {
        throw new Error(message || '生成失败')
      }
    }

    throw new Error('生成超时，请稍后重试')
  }
}
