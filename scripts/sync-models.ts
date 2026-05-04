/**
 * 从本地数据库读取 AiModel，生成 UPSERT SQL，在宁夏执行。
 * 新增/修改/禁用模型后，deploy.sh 自动调用本脚本同步。
 * 本脚本只做「读本地 → 推宁夏」这个动作，不存数据。
 */
import { PrismaClient } from '../server/node_modules/@prisma/client'

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.LOCAL_DB_URL } },
  })

  const models = await prisma.aiModel.findMany()

  for (const m of models) {
    const esc = (s: string) => `'${s.replace(/'/g, "''")}'`
    const d = m.description ? esc(m.description) : 'NULL'

    console.log(
      `INSERT INTO "AiModel"` +
      ` ("id","name","provider","baseUrl","apiKey","modelName","category","enabled","costCredits","description","createdAt","updatedAt")` +
      ` VALUES (${m.id},${esc(m.name)},${esc(m.provider)},${esc(m.baseUrl)},${esc(m.apiKey)},${esc(m.modelName)},${esc(m.category)},${m.enabled},${m.costCredits},${d},NOW(),NOW())` +
      ` ON CONFLICT (id) DO UPDATE SET` +
      ` name=EXCLUDED.name,provider=EXCLUDED.provider,"baseUrl"=EXCLUDED."baseUrl",` +
      ` "apiKey"=EXCLUDED."apiKey","modelName"=EXCLUDED."modelName",` +
      ` category=EXCLUDED.category,enabled=EXCLUDED.enabled,` +
      ` "costCredits"=EXCLUDED."costCredits",description=EXCLUDED.description,` +
      ` "updatedAt"=NOW();`
    )
  }

  await prisma.$disconnect()
}

main()
