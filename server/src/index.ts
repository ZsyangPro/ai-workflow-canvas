import dotenv from 'dotenv'
dotenv.config()

import app from './app'
import prisma from './lib/prisma'
import { deleteFile } from './lib/storage'

const PORT = process.env.PORT || 3000

// 清理垃圾箱中超过7天的素材
async function cleanupTrash() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const expired = await prisma.generatedAsset.findMany({
      where: { deletedAt: { lte: cutoff } },
      select: { id: true, filename: true },
    })
    if (expired.length > 0) {
      await Promise.all(expired.map((a) => deleteFile(a.filename)))
      await prisma.generatedAsset.deleteMany({
        where: { id: { in: expired.map((a) => a.id) } },
      })
    }
  } catch { /* 静默处理，清理失败不影响主流程 */ }
}

// 启动时清理一次，之后每小时清理
cleanupTrash()
const trashInterval = setInterval(cleanupTrash, 60 * 60 * 1000)

const requiredEnvs = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`缺少必要的环境变量: ${env}`)
    process.exit(1)
  }
}

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
})
