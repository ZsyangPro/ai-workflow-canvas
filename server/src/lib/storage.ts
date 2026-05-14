import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

const ASSETS_DIR = path.join(__dirname, '../../data/assets')

// MIME 到扩展名映射
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

/**
 * 从 URL 下载图片并保存到本地 assets 目录。
 * 返回 { filename, mimeType }。
 */
export async function downloadAndSave(imageUrl: string): Promise<{ filename: string; mimeType: string }> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  const ext = MIME_TO_EXT[contentType] || '.png'
  const filename = `${randomUUID()}${ext}`

  await fs.mkdir(ASSETS_DIR, { recursive: true })
  await fs.writeFile(path.join(ASSETS_DIR, filename), buffer)

  return { filename, mimeType: contentType }
}

/**
 * 从 base64 数据保存图片到本地 assets 目录。
 */
export async function saveBase64(base64: string): Promise<{ filename: string; mimeType: string }> {
  const match = base64.match(/^data:(image\/\w+);base64,(.+)$/)
  const mimeType = match?.[1] || 'image/png'
  const data = match?.[2] || base64

  const ext = MIME_TO_EXT[mimeType] || '.png'
  const filename = `${randomUUID()}${ext}`
  const buffer = Buffer.from(data, 'base64')

  await fs.mkdir(ASSETS_DIR, { recursive: true })
  await fs.writeFile(path.join(ASSETS_DIR, filename), buffer)

  return { filename, mimeType }
}

/**
 * 从 URL 下载图片并转为 base64 data URI，不落盘。
 */
export async function fetchToBase64(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

/**
 * 删除本地资产文件。
 */
export async function deleteFile(filename: string): Promise<void> {
  try {
    await fs.unlink(path.join(ASSETS_DIR, filename))
  } catch { /* 文件不存在则忽略 */ }
}
