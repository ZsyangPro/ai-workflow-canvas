// ============================================================
// ZLHub Seedance 2.0 视频生成 Provider
// 异步任务：提交 → 轮询 → 获取mp4 URL
// 含素材审核：真人脸参考图自动送审获取 Asset:// 链接
// ============================================================

import type { AiModelConfig, VideoGenerateRequest, VideoProvider, VideoTask, VideoStreamEvent } from '../video-types'
import { ZlHubAssetProvider } from './zlhub-asset'

const API_BASE = 'https://api.zlhub.cn'

function traceId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

function apiKey(model: AiModelConfig): string {
  return model.apiKey || process.env.ZLHUB_API_KEY || ''
}

export class ZlHubVideoProvider implements VideoProvider {
  private assetProvider: ZlHubAssetProvider

  constructor(assetAccessToken?: string) {
    this.assetProvider = new ZlHubAssetProvider(assetAccessToken)
  }

  // --- 公共接口 ---

  async submitTask(model: AiModelConfig, req: VideoGenerateRequest): Promise<{ taskId: string }> {
    const content = await this.buildContent(model, req)
    const body: Record<string, unknown> = {
      model: model.modelName || 'doubao-seedance-2.0',
      content,
    }
    if (req.duration) body.duration = req.duration
    if (req.aspectRatio) body.ratio = req.aspectRatio
    if (req.resolution) body.resolution = req.resolution
    if (req.generateAudio !== undefined) body.generate_audio = req.generateAudio
    if (req.watermark !== undefined) body.watermark = req.watermark

    const res = await fetch(`${API_BASE}/v1/task/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey(model)}`,
        'X-Trace-ID': traceId(),
      },
      body: JSON.stringify(body),
    })

    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok || !json.id) {
      throw new Error(`ZLHub任务创建失败 [${res.status}]: ${JSON.stringify(json)}`)
    }
    return { taskId: json.id as string }
  }

  async queryTask(model: AiModelConfig, taskId: string): Promise<VideoTask> {
    const res = await fetch(`${API_BASE}/v1/task/get/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey(model)}`,
        'X-Trace-ID': traceId(),
      },
    })

    const json = (await res.json()) as Record<string, unknown>
    const data = (json.data || {}) as Record<string, unknown>
    const status = this.mapStatus((data.status as string) || 'queued')

    const task: VideoTask = {
      taskId: (data.id as string) || taskId,
      status,
      duration: data.duration as number | undefined,
      resolution: data.resolution as string | undefined,
    }

    if (status === 'succeeded') {
      const content = (data.content || {}) as Record<string, unknown>
      task.videoUrl = content.video_url as string
      task.lastFrameUrl = content.last_frame_url as string
      if (data.cost) {
        const cost = data.cost as Record<string, string>
        task.cost = {
          currency: cost.currency || 'CNY',
          inputCost: parseFloat(cost.input_cost || '0'),
          outputCost: parseFloat(cost.output_cost || '0'),
          totalCost: parseFloat(cost.total_cost || '0'),
        }
      }
    }

    if (status === 'failed') {
      const err = (data.error || {}) as Record<string, string>
      task.error = err.message || '视频生成失败'
    }

    return task
  }

  async *waitForResult(model: AiModelConfig, taskId: string): AsyncIterable<VideoStreamEvent> {
    yield { type: 'queued', taskId }

    for (let i = 0; i < 100; i++) {
      await sleep(3000)
      const task = await this.queryTask(model, taskId)

      if (task.status === 'succeeded') {
        yield { type: 'succeeded', videoUrl: task.videoUrl!, lastFrameUrl: task.lastFrameUrl }
        return
      }
      if (task.status === 'failed' || task.status === 'cancelled' || task.status === 'expired') {
        yield { type: 'failed', error: task.error || '视频生成失败' }
        return
      }
      // running/queued → 发送进度
      const progress = Math.min(i * 2, 90)
      yield { type: 'progress', progress }
    }

    yield { type: 'failed', error: '视频生成超时（5分钟）' }
  }

  // --- 内部方法 ---

  /** 构建 content 数组，含自动素材审核 */
  private async buildContent(model: AiModelConfig, req: VideoGenerateRequest): Promise<unknown[]> {
    const content: unknown[] = []

    // 文本
    content.push({ type: 'text', text: req.prompt })

    // 首帧（需审核）
    if (req.firstFrameUrl) {
      const url = await this.assetProvider.ensureAssetUrl(req.firstFrameUrl)
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'first_frame',
      })
    }

    // 尾帧（需审核）
    if (req.lastFrameUrl) {
      const url = await this.assetProvider.ensureAssetUrl(req.lastFrameUrl)
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'last_frame',
      })
    }

    // 参考图（需审核）
    if (req.referenceImageUrls?.length) {
      for (const imgUrl of req.referenceImageUrls) {
        const url = await this.assetProvider.ensureAssetUrl(imgUrl)
        content.push({
          type: 'image_url',
          image_url: { url },
          role: 'reference_image',
        })
      }
    }

    // 参考视频（视频审核较慢，暂不做自动审核，传原始URL）
    if (req.referenceVideoUrl) {
      content.push({
        type: 'video_url',
        video_url: { url: req.referenceVideoUrl },
        role: 'reference_video',
      })
    }

    // 参考音频
    if (req.referenceAudioUrl) {
      content.push({
        type: 'audio_url',
        audio_url: { url: req.referenceAudioUrl },
        role: 'reference_audio',
      })
    }

    return content
  }

  private mapStatus(s: string): VideoTask['status'] {
    switch (s) {
      case 'queued': return 'queued'
      case 'running': return 'running'
      case 'succeeded': return 'succeeded'
      case 'failed': return 'failed'
      case 'cancelled': return 'cancelled'
      case 'expired': return 'expired'
      default: return 'queued'
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
