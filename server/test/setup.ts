import dotenv from 'dotenv'
dotenv.config()

import app from '../src/app'
import prisma from '../src/lib/prisma'

export { app, prisma }

const ts = Date.now()

export function uid(group: string, name: string) {
  return `test_${group}_${name}_${ts}`
}

export async function cleanup(prefix: string) {
  const pattern = `test_${prefix}_`
  await prisma.generatedAsset.deleteMany({ where: { canvas: { user: { username: { startsWith: pattern } } } } })
  await prisma.creditTransaction.deleteMany({ where: { user: { username: { startsWith: pattern } } } })
  await prisma.canvas.deleteMany({ where: { user: { username: { startsWith: pattern } } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: pattern } } })
}
