import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, uid, cleanup, prisma } from './setup'

const PFX = 'cv'
const testPass = 'test123456'

describe('Canvas API', () => {
  let token = ''
  let canvasId = 0
  const name = uid(PFX, 'user')

  beforeAll(async () => {
    const r = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    token = r.body.accessToken
  })

  afterAll(() => cleanup(PFX))

  it('POST /api/canvas 创建画布', async () => {
    const res = await request(app).post('/api/canvas').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.canvas.id).toBeDefined()
    canvasId = res.body.canvas.id
  })

  it('GET /api/canvas 列出画布', async () => {
    const res = await request(app).get('/api/canvas').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.canvases)).toBe(true)
  })

  it('GET /api/canvas/:id 获取单个画布', async () => {
    const res = await request(app).get(`/api/canvas/${canvasId}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(canvasId)
  })

  it('PUT /api/canvas/:id 保存节点和连线', async () => {
    const nodes = [{ id: '1', type: 'inputNode', position: { x: 0, y: 0 }, data: {} }]
    const edges = [{ id: 'e1', source: '1', target: '2', animated: true }]

    const res = await request(app)
      .put(`/api/canvas/${canvasId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nodes, edges })

    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(true)

    const getRes = await request(app).get(`/api/canvas/${canvasId}`).set('Authorization', `Bearer ${token}`)
    expect(getRes.body.nodes.length).toBe(1)
  })

  it('PUT /api/canvas/:id 他人画布返回 404', async () => {
    const otherName = uid(PFX, 'other')
    const rr = await request(app).post('/api/auth/register').send({ username: otherName, password: testPass })
    const otherToken = rr.body.accessToken

    const res = await request(app)
      .put(`/api/canvas/${canvasId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ nodes: [], edges: [] })

    expect(res.status).toBe(404)
  })

  it('PATCH /api/canvas/:id 重命名', async () => {
    const res = await request(app)
      .patch(`/api/canvas/${canvasId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '新画布名' })

    expect(res.status).toBe(200)
    expect(res.body.canvas.name).toBe('新画布名')
  })

  it('DELETE /api/canvas/:id 删除画布', async () => {
    const cr = await request(app).post('/api/canvas').set('Authorization', `Bearer ${token}`)
    const newId = cr.body.canvas.id

    const res = await request(app).delete(`/api/canvas/${newId}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('未登录返回 401', async () => {
    const res = await request(app).get('/api/canvas')
    expect(res.status).toBe(401)
  })
})
