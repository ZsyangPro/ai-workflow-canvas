// ============================================================
// ZLHub 素材审核 Provider
// 涉及真人/仿真人的参考图片必须先通过审核获取 Asset:// 链接
// 本地图片URL需通过 PUBLIC_BASE_URL 暴露为公网URL
// ============================================================

import type { AssetReviewProvider, AssetReviewRequest, AssetReviewResponse } from '../video-types'

const ASSET_BASE = 'https://asset.zlhub.cn'
const ACCESS_TOKEN = '7c2HVSOLbY40IctvPUpilhdC+a1zgw=='

function traceId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export class ZlHubAssetProvider implements AssetReviewProvider {
  private accessToken: string

  constructor(accessToken?: string) {
    this.accessToken = accessToken || ACCESS_TOKEN
  }

  /** 同步提交素材审核（202时自动轮询等待） */
  async review(request: AssetReviewRequest): Promise<AssetReviewResponse> {
    // 先用同步接口（15秒超时）
    let res = await fetch(`${ASSET_BASE}/api/asset/upload/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': this.accessToken,
        'X-Track-Id': traceId(),
      },
      body: JSON.stringify({ images: request.imageUrls, asset_type: request.assetType }),
      signal: AbortSignal.timeout(15000),
    })

    const json = await res.json() as Record<string, unknown>

    if (res.status === 200 && json.code === 200) {
      return json as unknown as AssetReviewResponse
    }

    // 202 降级 → 轮询等待（最多6次=18秒）
    const taskId = json.task_id as string
    if ((res.status === 202 || json.code === 202) && taskId) {
      console.log('[zlhub-asset] 审核异步，轮询中... task:', taskId)
      for (let i = 0; i < 6; i++) {
        await sleep(3000)
        res = await fetch(`${ASSET_BASE}/api/task/${taskId}`, {
          headers: { 'X-Access-Token': this.accessToken, 'X-Track-Id': traceId() },
          signal: AbortSignal.timeout(10000),
        })
        const pollJson = await res.json() as Record<string, unknown>
        if (pollJson.status === 'completed') {
          return pollJson as unknown as AssetReviewResponse
        }
        if (pollJson.status === 'failed') {
          throw new Error(`素材审核失败: ${pollJson.error_message || '未知'}`)
        }
      }
      throw new Error(`素材审核超时: task ${taskId}`)
    }

    throw new Error(`素材审核失败 [${res.status}]: ${json.message || '未知错误'}`)
  }

  /** 批量审核多张图片，返回 sourceUrl→assetUrl 映射 */
  async reviewImages(imageUrls: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (imageUrls.length === 0) return result

    const response = await this.review({ imageUrls, assetType: 'Image' })

    for (const item of response.result?.items || []) {
      if (item.submitReviewStatus === 1 && item.assetUrl) {
        result.set(item.sourceUrl, item.assetUrl)
      }
    }

    return result
  }

  /** 将图片URL转换为生成API可用的链接。人脸图走Asset审核，其他直接传HTTP URL */
  async ensureAssetUrl(imageUrl: string): Promise<string> {
    // 已经审核过的 Asset:// 格式，直接返回
    if (imageUrl.startsWith('Asset://') || imageUrl.startsWith('asset://')) {
      return imageUrl
    }

    // 转换为完整公网URL
    const publicUrl = await this.resolvePublicUrl(imageUrl)

    // 尝试素材审核（人脸备案），失败则直接传HTTP URL
    try {
      const map = await this.reviewImages([publicUrl])
      const assetUrl = map.get(publicUrl)
      if (assetUrl) {
        console.log('[zlhub-asset] 审核通过 →', assetUrl)
        return assetUrl
      }
    } catch (e: any) {
      console.warn('[zlhub-asset] 审核未通过，使用原始URL:', e.message?.substring(0, 80))
    }

    // 审核失败或图中没有人脸 → 直接传HTTP URL
    console.log('[zlhub-asset] 跳过审核，直接传URL:', publicUrl.substring(0, 80))
    return publicUrl
  }

  /** 将本地路径转为完整公网URL */
  private async resolvePublicUrl(imageUrl: string): Promise<string> {
    // 已是完整公网URL
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl
    }

    // base64 data URI → 存本地文件再暴露
    if (imageUrl.startsWith('data:')) {
      const localPath = await this.saveDataUriToFile(imageUrl)
      return this.buildPublicUrl(localPath)
    }

    // 本地路径 /api/assets/xxx → 拼 PUBLIC_BASE_URL
    return this.buildPublicUrl(imageUrl)
  }

  /** 拼 PUBLIC_BASE_URL + path */
  private buildPublicUrl(localPath: string): string {
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
    const cleanBase = baseUrl.replace(/\/+$/, '')
    const cleanPath = localPath.startsWith('/') ? localPath : `/${localPath}`
    const publicUrl = `${cleanBase}${cleanPath}`
    console.log('[zlhub-asset] resolve:', localPath.substring(0, 50), '→', publicUrl.substring(0, 80))
    return publicUrl
  }

  /** base64 data URI → 写入 data/assets/ → 返回 /api/assets/xxx 路径 */
  private async saveDataUriToFile(dataUri: string): Promise<string> {
    const fs = await import('fs/promises')
    const path = await import('path')
    const crypto = await import('crypto')

    // 解析 data:image/png;base64,xxxx
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error(`无法解析 data URI: ${dataUri.substring(0, 60)}`)

    const mimeType = match[1]
    const base64Data = match[2]
    let buffer = Buffer.from(base64Data, 'base64')

    // 大图压缩（>1MB → 减少传输时间的同时保留画质）
    if (buffer.length > 1 * 1024 * 1024) {
      try {
        const sharp = require('sharp')
        const compressed = await sharp(buffer)
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 92 })
          .toBuffer()
        console.log(`[zlhub-asset] 图片压缩: ${(buffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressed.length / 1024 / 1024).toFixed(1)}MB`)
        buffer = compressed
      } catch (e) {
        console.warn('[zlhub-asset] sharp压缩失败，使用原图:', e)
      }
    }

    const filename = `${crypto.randomUUID()}.jpg`
    const assetsDir = path.join(process.cwd(), 'data/assets')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.writeFile(path.join(assetsDir, filename), buffer)

    const localPath = `/api/assets/${filename}`
    console.log('[zlhub-asset] dataURI → file:', dataUri.substring(0, 40), '→', localPath, `(${(buffer.length / 1024).toFixed(0)}KB)`)
    return localPath
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
