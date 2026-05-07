import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app, prisma, uid, tid, cleanup } from './setup'

const prefix = 'mt'

let superAdminToken: string
let tenantAdminToken: string
let tenantId: string
let subjectId: string

beforeAll(async () => {
  // 注册超级管理员
  await request(app)
    .post('/api/auth/register')
    .send({ username: uid(prefix, 'super'), password: '111111' })
  // 提升为 SUPER_ADMIN
  await prisma.user.update({
    where: { username: uid(prefix, 'super') },
    data: { role: 'SUPER_ADMIN' },
  })
  const saRes = await request(app)
    .post('/api/auth/login')
    .send({ username: uid(prefix, 'super'), password: '111111' })
  superAdminToken = saRes.body.accessToken
})

afterAll(async () => {
  await cleanup(prefix)
})

// ===== 租户 CRUD =====
describe('Admin 租户管理', () => {
  it('创建租户', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        code: tid('nx'),
        name: '宁夏广电',
        contactPerson: '张三',
        contactPhone: '13800000001',
        seatNum: 100,
        subjectNum: 10,
      })
    expect(res.status).toBe(201)
    expect(res.body.tenant.code).toBe(tid('nx'))
    expect(res.body.tenant.credits).toBe(0)
    tenantId = res.body.tenant.id
  })

  it('租户编码重复返回409', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: tid('nx'), name: '重复', contactPerson: 'x', contactPhone: '13800000002' })
    expect(res.status).toBe(409)
  })

  it('普通用户无法创建租户', async () => {
    await request(app).post('/api/auth/register').send({ username: uid(prefix, 'user'), password: '111111' })
    const uRes = await request(app).post('/api/auth/login').send({ username: uid(prefix, 'user'), password: '111111' })
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${uRes.body.accessToken}`)
      .send({ code: 'x', name: 'x', contactPerson: 'x', contactPhone: '13800000003' })
    expect(res.status).toBe(403)
  })

  it('租户列表', async () => {
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.tenants.length).toBeGreaterThan(0)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('租户详情', async () => {
    const res = await request(app)
      .get(`/api/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.tenant.name).toBe('宁夏广电')
  })

  it('编辑租户', async () => {
    const res = await request(app)
      .patch(`/api/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: '宁夏广电（更新）', status: 'ACTIVE' })
    expect(res.status).toBe(200)
    expect(res.body.tenant.name).toBe('宁夏广电（更新）')
  })

  it('软删除租户', async () => {
    await request(app).post('/api/admin/tenants').set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: tid('del'), name: '待删除', contactPerson: 'x', contactPhone: '13800000009' })
    const list = await request(app).get('/api/admin/tenants').set('Authorization', `Bearer ${superAdminToken}`)
    const delId = list.body.tenants.find((t: any) => t.code === tid('del')).id

    const res = await request(app)
      .delete(`/api/admin/tenants/${delId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
    expect(res.status).toBe(200)
  })
})

// ===== 租户充值 =====
describe('Admin 租户充值', () => {
  it('给租户充值算力', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${tenantId}/recharge`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ amount: 1000 })
    expect(res.status).toBe(200)
    expect(res.body.tenant.credits).toBe(1000)
  })

  it('充值产生流水记录', async () => {
    const flows = await prisma.creditTransaction.findMany({
      where: { tenantId, type: 'TENANT_RECHARGE' },
    })
    expect(flows.length).toBeGreaterThan(0)
    expect(flows[0].amount).toBe(1000)
  })
})

// ===== 租户管理员 =====
describe('租户管理员', () => {
  it('创建租户管理员', async () => {
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        username: uid(prefix, 'tadmin'),
        password: '111111',
        role: 'TENANT_ADMIN',
        tenantId,
      })
  })

  it('租户管理员登录', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: uid(prefix, 'tadmin'), password: '111111' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('TENANT_ADMIN')
    expect(res.body.user.tenantId).toBe(tenantId)
    tenantAdminToken = res.body.accessToken
  })

  it('/me 返回租户信息', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.user.tenantId).toBe(tenantId)
    expect(res.body.user.role).toBe('TENANT_ADMIN')
  })

  it('TENANT_ADMIN 无法访问 admin 路由', async () => {
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(403)
  })
})

// ===== 主体管理（租户范围） =====
describe('Tenant 主体管理', () => {
  it('创建主体', async () => {
    const res = await request(app)
      .post('/api/tenant/subjects')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ name: '湟中融媒', contactPerson: '李四' })
    expect(res.status).toBe(201)
    expect(res.body.subject.name).toBe('湟中融媒')
    expect(res.body.subject.credits).toBe(0)
    subjectId = res.body.subject.id
  })

  it('SUPER_ADMIN 可通过 X-Tenant-Id 创建主体', async () => {
    const res = await request(app)
      .post('/api/tenant/subjects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ name: '海北融媒' })
    expect(res.status).toBe(201)
  })

  it('超出主体配额创建失败', async () => {
    // 先设置 subjectNum=2（已有2个主体）
    await prisma.tenant.update({ where: { id: tenantId }, data: { subjectNum: 2 } })
    const res = await request(app)
      .post('/api/tenant/subjects')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ name: '超额主体' })
    expect(res.status).toBe(400)
    // 恢复
    await prisma.tenant.update({ where: { id: tenantId }, data: { subjectNum: 10 } })
  })

  it('主体列表（租户隔离）', async () => {
    const res = await request(app)
      .get('/api/tenant/subjects')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.subjects.length).toBeGreaterThanOrEqual(2)
  })
})

// ===== 算力流转 =====
describe('算力流转', () => {
  it('租户给主体分配算力', async () => {
    const res = await request(app)
      .post(`/api/tenant/subjects/${subjectId}/allocate`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ amount: 300 })
    expect(res.status).toBe(200)
    expect(res.body.tenant.credits).toBe(700)

    // 验证主体余额
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } })
    expect(subject?.credits).toBe(300)
  })

  it('分配算力产生流水', async () => {
    const flows = await prisma.creditTransaction.findMany({
      where: { tenantId, subjectId, type: 'SUBJECT_ALLOCATE' },
    })
    expect(flows.length).toBeGreaterThan(0)
  })

  it('租户算力不足时分配失败', async () => {
    const res = await request(app)
      .post(`/api/tenant/subjects/${subjectId}/allocate`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ amount: 999999 })
    expect(res.status).toBe(400)
  })

  it('给用户分配算力', async () => {
    // 先注册一个普通用户并绑定到该租户
    const userName = uid(prefix, 'enduser')
    await request(app).post('/api/auth/register').send({ username: userName, password: '111111' })
    const userId = (await prisma.user.findUnique({ where: { username: userName } }))!.id
    await prisma.user.update({ where: { id: userId }, data: { tenantId } })

    const res = await request(app)
      .post(`/api/tenant/users/${userId}/allocate`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ amount: 100 })
    expect(res.status).toBe(200)
    expect(res.body.tenant.credits).toBe(600)

    // 验证用户余额
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(user?.credits).toBe(100)
  })

  it('跨租户用户拒绝分配', async () => {
    // 创建另一个租户和用户
    await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: tid('other'), name: '其他租户', contactPerson: 'x', contactPhone: '13800000010' })
    const otherTenant = await prisma.tenant.findUnique({ where: { code: tid('other') } })
    const otherUser = await prisma.user.findFirst({ where: { username: uid(prefix, 'enduser') } })
    await prisma.user.update({ where: { id: otherUser!.id }, data: { tenantId: otherTenant!.id } })

    const res = await request(app)
      .post(`/api/tenant/users/${otherUser!.id}/allocate`)
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ amount: 50 })
    expect(res.status).toBe(404)
  })
})

// ===== 钱包流水查询 =====
describe('钱包流水', () => {
  it('查看租户流水', async () => {
    const res = await request(app)
      .get('/api/tenant/wallet/flows')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.flows.length).toBeGreaterThan(0)
  })

  it('SUPER_ADMIN 通过 header 查看指定租户流水', async () => {
    const res = await request(app)
      .get('/api/tenant/wallet/flows')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Tenant-Id', tenantId)
    expect(res.status).toBe(200)
    expect(res.body.flows.length).toBeGreaterThan(0)
  })
})

// ===== 模型定价 =====
describe('租户模型定价', () => {
  it('设置租户模型定价', async () => {
    // 确保有个模型
    const model = await prisma.aiModel.findFirst({ where: { enabled: true } })
    expect(model).toBeTruthy()

    const res = await request(app)
      .post('/api/tenant/model-pricing')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ modelId: model!.id, computing: 10 })
    expect(res.status).toBe(200)
    expect(res.body.pricing.computing).toBe(10)
  })

  it('租户定价不能低于平台定价', async () => {
    const model = await prisma.aiModel.findFirst({ where: { enabled: true } })
    const res = await request(app)
      .post('/api/tenant/model-pricing')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ modelId: model!.id, computing: 0 })
    expect(res.status).toBe(400)
  })

  it('查看租户定价列表', async () => {
    const res = await request(app)
      .get('/api/tenant/model-pricing')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.pricings.length).toBeGreaterThan(0)
  })
})

// ===== 文件分类 =====
describe('租户文件管理', () => {
  it('创建文件分类', async () => {
    const res = await request(app)
      .post('/api/tenant/files/categories')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
      .send({ name: 'AI生成的图片' })
    expect(res.status).toBe(201)
    expect(res.body.category.name).toBe('AI生成的图片')
  })

  it('文件分类列表', async () => {
    const res = await request(app)
      .get('/api/tenant/files/categories')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
  })

  it('文件列表（空）', async () => {
    const res = await request(app)
      .get('/api/tenant/files')
      .set('Authorization', `Bearer ${tenantAdminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.files).toBeDefined()
  })
})
