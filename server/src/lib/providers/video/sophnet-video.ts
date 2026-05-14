// ============================================================
// Sophnet 视频生成 Provider（Vidu + Kling 聚合）
// Base: https://www.sophnet.com/api/open-apis/projects/easyllms
// 异步任务模型：POST 提交 → GET 轮询 → 下载mp4
// ============================================================

import type { AiModelConfig, VideoGenerateRequest, VideoProvider, VideoTask, VideoStreamEvent } from '../video-types'

// modelName 编码格式: "{platform}-{action}"，如 "vidu-text2video", "kling-image2video"
// 或直接传具体模型名 "viduq3-turbo"，provider 自动判断平台

function parseModel(modelName: string): { platform: 'vidu' | 'kling'; action: string; realModel: string } {
  // 格式: realModel:action，如 "viduq3-turbo:img2video"
  const colonIdx = modelName.lastIndexOf(':')
  if (colonIdx > 0) {
    const realModel = modelName.substring(0, colonIdx)
    const action = modelName.substring(colonIdx + 1)
    if (/^vidu/i.test(realModel)) return { platform: 'vidu', action, realModel }
    if (/^kling/i.test(realModel)) return { platform: 'kling', action, realModel }
  }
  // 旧格式: "vidu-img2video" 或 "kling-text2video" (前缀编码action)
  if (modelName.startsWith('vidu-')) {
    return { platform: 'vidu', action: modelName.slice(5), realModel: modelName }
  }
  if (modelName.startsWith('kling-')) {
    return { platform: 'kling', action: modelName.slice(6), realModel: modelName }
  }
  // 直接传模型名：根据前缀判断
  if (/^vidu/i.test(modelName)) {
    return { platform: 'vidu', action: 'text2video', realModel: modelName }
  }
  if (/^kling/i.test(modelName)) {
    return { platform: 'kling', action: 'text2video', realModel: modelName }
  }
  // 默认 Vidu text2video
  return { platform: 'vidu', action: 'text2video', realModel: modelName }
}

function viduPath(action: string): string {
  const map: Record<string, string> = {
    text2video: '/videogenerator/vidu/ent/v2/text2video',
    img2video: '/videogenerator/vidu/ent/v2/img2video',
    reference2video: '/videogenerator/vidu/ent/v2/reference2video',
    'start-end2video': '/videogenerator/vidu/ent/v2/start-end2video',
  }
  return map[action] || map.text2video
}

function klingPath(action: string): string {
  const map: Record<string, string> = {
    text2video: '/videogenerator/kling/v1/videos/text2video',
    image2video: '/videogenerator/kling/v1/videos/image2video',
    'omni-video': '/videogenerator/kling/v1/videos/omni-video',
    'motion-control': '/videogenerator/kling/v1/videos/motion-control',
  }
  return map[action] || map.text2video
}

/** Sophnet 统一响应格式 */
interface SophnetResp {
  taskId?: string
  id?: string
  status?: string
  result?: {
    video_url?: string
    videos?: Array<{ url?: string; video_url?: string }>
  }
  error?: { message?: string }
  message?: string
}

export class SophnetVideoProvider implements VideoProvider {
  async submitTask(model: AiModelConfig, req: VideoGenerateRequest): Promise<{ taskId: string }> {
    const parsed = parseModel(model.modelName)
    const baseUrl = model.baseUrl || 'https://www.sophnet.com/api/open-apis/projects/easyllms'
    const path = parsed.platform === 'vidu' ? viduPath(parsed.action) : klingPath(parsed.action)
    const url = `${baseUrl}${path}`

    const body = this.buildBody(req, parsed)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const json = (await res.json()) as Record<string, unknown>

    if (!res.ok) {
      throw new Error(
        `Sophnet ${parsed.platform} 任务创建失败 [${res.status}]: ${json.message || JSON.stringify(json)}`
      )
    }

    // taskId 可能在多个位置（不同API返回字段名不同）
    const taskId = (json.taskId || json.task_id || json.id || (json.data as any)?.task_id) as string | undefined
    if (taskId) {
      return { taskId }
    }

    // 检查是否同步返回了结果
    const result = json.result as Record<string, unknown> | undefined
    const videoUrl = result?.video_url || (result?.videos as Array<Record<string, string>>)?.[0]?.video_url || (result?.videos as Array<Record<string, string>>)?.[0]?.url
    if (videoUrl && typeof videoUrl === 'string') {
      return { taskId: `sync-${encodeURIComponent(videoUrl)}` }
    }

    throw new Error(`Sophnet ${parsed.platform} 响应无taskId: ${JSON.stringify(json).substring(0, 300)}`)
  }

  async queryTask(model: AiModelConfig, taskId: string): Promise<VideoTask> {
    // 处理同步返回
    if (taskId.startsWith('sync-')) {
      return {
        taskId,
        status: 'succeeded',
        videoUrl: decodeURIComponent(taskId.slice(5)),
      }
    }

    const parsed = parseModel(model.modelName)
    const baseUrl = model.baseUrl || 'https://www.sophnet.com/api/open-apis/projects/easyllms'

    let queryUrl: string
    if (parsed.platform === 'vidu') {
      queryUrl = `${baseUrl}/videogenerator/vidu/ent/v2/tasks/${taskId}/creations`
    } else {
      queryUrl = `${baseUrl}/videogenerator/kling/v1/videos/${parsed.action}/${taskId}`
    }

    const res = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${model.apiKey}` },
    })

    const json = (await res.json()) as Record<string, unknown>

    if (!res.ok) {
      return { taskId, status: 'failed', error: `查询失败 [${res.status}]` }
    }

    return this.parseTask(taskId, json)
  }

  async *waitForResult(model: AiModelConfig, taskId: string): AsyncIterable<VideoStreamEvent> {
    // 同步完成的直接返回
    if (taskId.startsWith('sync-')) {
      yield {
        type: 'succeeded',
        videoUrl: decodeURIComponent(taskId.slice(5)),
      }
      return
    }

    yield { type: 'queued', taskId }

    for (let i = 0; i < 100; i++) {
      await sleep(3000)
      const task = await this.queryTask(model, taskId)

      if (task.status === 'succeeded') {
        yield { type: 'succeeded', videoUrl: task.videoUrl!, lastFrameUrl: task.lastFrameUrl }
        return
      }
      if (task.status === 'failed') {
        yield { type: 'failed', error: task.error || '视频生成失败' }
        return
      }
      yield { type: 'progress', progress: Math.min(i * 2, 90) }
    }
    yield { type: 'failed', error: '视频生成超时（5分钟）' }
  }

  // --- 内部方法 ---

  private buildBody(req: VideoGenerateRequest, p: { platform: string; action: string; realModel: string }): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      duration: req.duration || 5,
    }
    // Vidu 需要显式传 model
    if (p.platform === 'vidu') {
      body.model = p.realModel
    }

    // Vidu 参数
    if (p.action === 'img2video' && req.firstFrameUrl) {
      body.imageUrl = req.firstFrameUrl
    }
    if (p.action === 'reference2video' && req.referenceImageUrls?.length) {
      body.referenceImages = req.referenceImageUrls
    }
    if (p.action === 'start-end2video') {
      if (req.firstFrameUrl) body.startImageUrl = req.firstFrameUrl
      if (req.lastFrameUrl) body.endImageUrl = req.lastFrameUrl
    }

    // Kling 参数
    if (p.action === 'image2video' && req.firstFrameUrl) {
      body.imageUrl = req.firstFrameUrl
    }
    if (p.action === 'motion-control' && req.firstFrameUrl) {
      body.imageUrl = req.firstFrameUrl
    }

    return body
  }

  private parseTask(taskId: string, json: Record<string, unknown>): VideoTask {
    // Vidu: 返回 creations 数组，检查 err_code
    const errCode = json.err_code as string | number | undefined
    const creations = json.creations as Array<Record<string, string>> | undefined
    if (creations && creations.length > 0 && errCode === '') {
      const videoUrl = creations[0]?.video_url || creations[0]?.url || ''
      return { taskId, status: 'succeeded', videoUrl, duration: json.duration as number | undefined }
    }
    if (errCode && String(errCode) !== '' && String(errCode) !== '0') {
      return { taskId, status: 'failed', error: `Vidu错误码: ${errCode}` }
    }

    // Kling: 返回 data.task_status
    const data = json.data as Record<string, unknown> | undefined
    const klingStatus = data?.task_status as string || json.status as string || ''
    if (klingStatus === 'succeed' || klingStatus === 'succeeded' || klingStatus === 'completed') {
      const videos = data?.task_result
        ? ((data.task_result as Record<string, unknown>).videos as Array<Record<string, string>>)
        : (json.result as Record<string, unknown>)?.videos as Array<Record<string, string>> | undefined
      const videoUrl = videos?.[0]?.url || videos?.[0]?.video_url || ''
      return { taskId, status: 'succeeded', videoUrl }
    }
    if (klingStatus === 'failed' || klingStatus === 'fail' || klingStatus === 'error') {
      return { taskId, status: 'failed', error: 'Kling生成失败' }
    }

    // 通用: status 字段
    const status = json.status as string || ''
    if (status === 'succeeded' || status === 'completed') {
      const result = (json.result || {}) as Record<string, unknown>
      const videoUrl = result.video_url as string || ''
      return { taskId, status: 'succeeded', videoUrl }
    }
    if (status === 'failed') {
      return { taskId, status: 'failed', error: '生成失败' }
    }
    if (status === 'cancelled') {
      return { taskId, status: 'cancelled' }
    }

    // 有 creations 但 err_code 非空 → 还在处理中
    if (creations && creations.length > 0) {
      return { taskId, status: 'succeeded', videoUrl: creations[0]?.video_url || creations[0]?.url || '' }
    }

    return { taskId, status: 'running' }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
