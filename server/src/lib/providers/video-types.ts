// ============================================================
// 视频生成类型定义
// ============================================================

// --- 视频生成请求 ---

export interface VideoGenerateRequest {
  prompt: string
  duration?: number // 秒，默认5
  aspectRatio?: string // '16:9' | '9:16' | '1:1'
  resolution?: string // '720p' | '1080p'
  firstFrameUrl?: string // 首帧图片URL（HTTP 或 Asset://协议）
  lastFrameUrl?: string // 尾帧图片URL
  referenceImageUrls?: string[] // 参考图片URL数组
  referenceVideoUrl?: string // 参考视频URL
  referenceAudioUrl?: string // 参考音频URL
  generateAudio?: boolean // 是否生成音频（仅ZLHub）
  watermark?: boolean
}

// --- 素材审核 ---

export type AssetType = 'Image' | 'Video' | 'Audio'

export interface AssetReviewRequest {
  imageUrls: string[] // 公网可访问的HTTP(S) URL
  assetType: AssetType
}

export interface AssetReviewResult {
  assetId: string // local-xxx
  sourceUrl: string
  assetUrl: string // "Asset://Asset-xxx"
  downstreamAssetId: string // "Asset-xxx"
  downstreamFinalUrl: string // 火山引擎签名URL（12小时有效）
  downstreamUrlExpireAt: string
  submitReviewStatus: 0 | 1 // 1=通过, 0=失败
  assetType: AssetType
  errorCode: string
  errorMessage: string
}

export interface AssetReviewResponse {
  taskId: string
  status: 'processing' | 'completed'
  totalCount: number
  doneCount: number
  result: {
    reviewBatchId: string
    items: AssetReviewResult[]
  } | null
}

// --- 异步任务状态 ---

export type VideoTaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface VideoTask {
  taskId: string
  status: VideoTaskStatus
  progress?: number // 0-100
  videoUrl?: string // 完成后有值
  lastFrameUrl?: string
  duration?: number
  resolution?: string
  error?: string
  cost?: {
    currency: string
    inputCost: number
    outputCost: number
    totalCost: number
  }
}

// --- 流式事件（SSE） ---

export type VideoStreamEvent =
  | { type: 'queued'; taskId: string }
  | { type: 'progress'; progress: number }
  | { type: 'succeeded'; videoUrl: string; lastFrameUrl?: string }
  | { type: 'failed'; error: string }

// --- Provider配置 ---

export interface AiModelConfig {
  baseUrl: string
  apiKey: string
  modelName: string
}

// --- Provider接口 ---

export interface VideoProvider {
  /** 提交视频生成任务，返回任务ID */
  submitTask(model: AiModelConfig, req: VideoGenerateRequest): Promise<{ taskId: string }>
  /** 查询任务状态 */
  queryTask(model: AiModelConfig, taskId: string): Promise<VideoTask>
  /** 流式等待结果（轮询 + SSE） */
  waitForResult?(model: AiModelConfig, taskId: string): AsyncIterable<VideoStreamEvent>
}

export interface AssetReviewProvider {
  /** 同步提交素材审核，返回审核结果 */
  review(request: AssetReviewRequest): Promise<AssetReviewResponse>
}
