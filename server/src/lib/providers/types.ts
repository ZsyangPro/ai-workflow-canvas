export interface GenerateRequest {
  prompt: string
  negative_prompt?: string
  size?: string
  quality?: 'low' | 'medium' | 'high'
  images?: string[]
  max_images?: number
  output_format?: 'png' | 'jpeg'
  watermark?: boolean
  optimize_mode?: 'standard' | 'fast'
  enable_web_search?: boolean
}

export interface GeneratedImage {
  url?: string
  b64_json?: string
  size?: string
}

export interface GenerateResult {
  images: GeneratedImage[]
}

export type GenerateStreamEvent =
  | { type: 'partial_succeeded'; image: GeneratedImage }
  | { type: 'partial_failed'; error: string }
  | { type: 'completed'; usage?: unknown }

export interface AiModelConfig {
  baseUrl: string
  apiKey: string
  modelName: string
}

export interface ImageProvider {
  generate(model: AiModelConfig, req: GenerateRequest): Promise<GenerateResult>
  generateStream?(model: AiModelConfig, req: GenerateRequest): AsyncIterable<GenerateStreamEvent>
}
