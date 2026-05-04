import dotenv from 'dotenv'
dotenv.config()

import app from './app'
import prisma from './lib/prisma'

const PORT = process.env.PORT || 3000

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
