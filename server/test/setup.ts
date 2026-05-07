import dotenv from 'dotenv'
dotenv.config()

import app from '../src/app'
import prisma from '../src/lib/prisma'

export { app, prisma }

const ts = Date.now()

export function uid(group: string, name: string) {
  return `test_${group}_${name}_${ts}`
}

export function tid(name: string) {
  return `test_tenant_${name}_${ts}`
}

export async function cleanup(prefix: string) {
  const pattern = `test_${prefix}_`
  const tPattern = `test_tenant_${prefix}_`

  // 清理租户相关数据
  await prisma.tenantModelPricing.deleteMany({ where: { tenant: { code: { startsWith: tPattern } } } })
  await prisma.tenantFileCategory.deleteMany({ where: { tenant: { code: { startsWith: tPattern } } } })

  // 清理用户端数据
  await prisma.generatedAsset.deleteMany({ where: { canvas: { user: { username: { startsWith: pattern } } } } })
  await prisma.creditTransaction.deleteMany({
    where: {
      OR: [
        { user: { username: { startsWith: pattern } } },
        { tenant: { code: { startsWith: tPattern } } },
      ],
    },
  })
  await prisma.canvas.deleteMany({
    where: {
      OR: [
        { user: { username: { startsWith: pattern } } },
        { tenant: { code: { startsWith: tPattern } } },
      ],
    },
  })

  // 清理主体和用户
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { startsWith: pattern } },
        { tenant: { code: { startsWith: tPattern } } },
      ],
    },
  })
  await prisma.subject.deleteMany({ where: { tenant: { code: { startsWith: tPattern } } } })
  await prisma.tenant.deleteMany({ where: { code: { startsWith: tPattern } } })
}
