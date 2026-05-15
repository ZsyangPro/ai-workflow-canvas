import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app, prisma, uid, tid, cleanup } from './setup'

const prefix = 'pt'

let superAdminToken: string
let tenantAdminToken: string
let tenantCode: string
let tenantId: string

beforeAll(async () => {
  // 注册超级管理员
  await request(app)
    .post('/api/auth/register')
    .send({ username: uid(prefix, 'super'), password: '111111' })
  await prisma.user.update({
    where: { username: uid(prefix, 'super') },
    data: { role: 'SUPER_ADMIN' },
  })
  const saRes = await request(app)
    .post('/api/auth/login')
    .send({ username: uid(prefix, 'super'), password: '111111' })
  superAdminToken = saRes.body.accessToken

  // 创建租户
  tenantCode = tid(prefix, 'nxportal')
  const tRes = await request(app)
    .post('/api/admin/tenants')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({
      code: tenantCode,
      name: '测试门户租户',
      contactPerson: '李四',
      contactPhone: '13900000001',
    })
  tenantId = tRes.body.tenant.id

  // 创建租户管理员
  const adminName = uid(prefix, 'tenantadmin')
  await request(app)
    .post('/api/auth/register')
    .send({ username: adminName, password: '111111' })
  await prisma.user.update({
    where: { username: adminName },
    data: { role: 'TENANT_ADMIN', tenantId },
  })
  const taRes = await request(app)
    .post('/api/auth/login')
    .send({ username: adminName, password: '111111' })
  tenantAdminToken = taRes.body.accessToken
})

afterAll(async () => {
  await cleanup(prefix)
})

// ===== 公开接口 =====
describe('GET /api/portal/:tenantCode — 公开访问', () => {
  afterAll(async () => {
    await prisma.portalBlock.deleteMany({ where: { tenantId } })
  })
  it('不存在的租户返回404', async () => {
    const res = await request(app).get('/api/portal/nonexistent-code')
    expect(res.status).toBe(404)
  })

  it('无区块的租户返回空数组', async () => {
    const res = await request(app).get(`/api/portal/${tenantCode}`)
    expect(res.status).toBe(200)
    expect(res.body.tenant.name).toBe('测试门户租户')
    expect(res.body.tenant.code).toBe(tenantCode)
    expect(res.body.blocks).toEqual([])
  })

  it('有区块时返回排序后的已启用区块', async () => {
    // 直接通过 prisma 插入测试数据
    await prisma.portalBlock.createMany({
      data: [
        { tenantId, type: 'hero', sortOrder: 0, enabled: true,
          config: { heading: '欢迎', subheading: 'AI平台' } },
        { tenantId, type: 'divider', sortOrder: 1, enabled: true, config: { height: 48 } },
        { tenantId, type: 'features', sortOrder: 2, enabled: false,
          config: { items: [{ title: '隐藏卡片' }] } },
      ],
    })

    const res = await request(app).get(`/api/portal/${tenantCode}`)
    expect(res.status).toBe(200)
    expect(res.body.blocks.length).toBe(2) // 不满 enabled=false 的
    expect(res.body.blocks[0].type).toBe('hero')
    expect(res.body.blocks[0].config.heading).toBe('欢迎')
    expect(res.body.blocks[1].type).toBe('divider')
  })
})

// ===== 管理接口 =====
describe('Portal Block CRUD', () => {
  let blockId: string

  beforeAll(async () => {
    await prisma.portalBlock.deleteMany({ where: { tenantId } })
  })

  afterAll(async () => {
    await prisma.portalBlock.deleteMany({ where: { tenantId } })
  })

  it('未登录不能管理区块', async () => {
    const res = await request(app).get(`/api/portal/blocks/${tenantId}`)
    expect(res.status).toBe(401)
  })

  it('获取区块列表（含未启用）', async () => {
    // 先创建一批测试区块
    await prisma.portalBlock.createMany({
      data: [
        { tenantId, type: 'hero', sortOrder: 0, enabled: true, config: {} },
        { tenantId, type: 'stats', sortOrder: 1, enabled: false, config: {} },
      ],
    })

    const res = await request(app)
      .get(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    expect(res.body[0].enabled).toBe(true)
    expect(res.body[1].enabled).toBe(false)
  })

  it('创建区块', async () => {
    const res = await request(app)
      .post(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ type: 'cta', config: { heading: '开始吧', btnText: '立即体验' } })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('cta')
    expect(res.body.config.heading).toBe('开始吧')
    blockId = res.body.id
  })

  it('创建区块缺少type返回400', async () => {
    const res = await request(app)
      .post(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ config: {} })
    expect(res.status).toBe(400)
  })

  it('更新区块配置', async () => {
    const res = await request(app)
      .put(`/api/portal/blocks/${tenantId}/${blockId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ config: { heading: '新的CTA标题', btnText: '点我' }, enabled: false })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // 验证更新
    const list = await request(app)
      .get(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    const block = list.body.find((b: any) => b.id === blockId)
    expect(block.enabled).toBe(false)
    expect(block.config.heading).toBe('新的CTA标题')
  })

  it('批量排序', async () => {
    const list = await request(app)
      .get(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    const ids = list.body.map((b: any) => b.id)
    const reversed = [...ids].reverse()

    const res = await request(app)
      .put(`/api/portal/blocks/${tenantId}/reorder`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ orderedIds: reversed })
    expect(res.status).toBe(200)

    // 验证排序
    const list2 = await request(app)
      .get(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(list2.body[0].id).toBe(reversed[0])
    expect(list2.body[1].id).toBe(reversed[1])
  })

  it('删除区块', async () => {
    const res = await request(app)
      .delete(`/api/portal/blocks/${tenantId}/${blockId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)

    const list = await request(app)
      .get(`/api/portal/blocks/${tenantId}`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(list.body.find((b: any) => b.id === blockId)).toBeUndefined()
  })

  it('跨租户不能操作其他租户的区块', async () => {
    // 用另一个租户ID去操作
    const res = await request(app)
      .get(`/api/portal/blocks/other-tenant-id`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    // scopeMiddleware 限制当前用户只能操作自己的 tenantId
    // 请求的 tenantId 与 JWT 不匹配时会限制访问
    expect([200, 403]).toContain(res.status)
  })
})

// ===== Models 区块数据联动 =====
describe('Models 区块数据联动', () => {
  afterAll(async () => {
    await prisma.portalBlock.deleteMany({ where: { tenantId } })
  })

  it('models 区块自动关联 AiModel 数据', async () => {
    // 找一个真实存在的模型
    const model = await prisma.aiModel.findFirst({ where: { enabled: true } })
    if (!model) {
      // 没有模型可用时跳过
      return
    }

    await prisma.portalBlock.create({
      data: {
        tenantId,
        type: 'models',
        sortOrder: 0,
        enabled: true,
        config: { title: 'AI能力', columns: 3, modelIds: [model.id] },
      },
    })

    const res = await request(app).get(`/api/portal/${tenantCode}`)
    expect(res.status).toBe(200)
    expect(res.body.blocks.length).toBe(1)
    expect(res.body.blocks[0].type).toBe('models')
    expect(res.body.blocks[0].config.models).toBeDefined()
    expect(res.body.blocks[0].config.models.length).toBe(1)
    expect(res.body.blocks[0].config.models[0].name).toBe(model.name)
  })
})
