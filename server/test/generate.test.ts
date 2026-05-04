import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock provider before app is imported
vi.mock('../src/lib/providers', () => {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
  return {
    getProvider: () => ({
      generate: vi.fn().mockResolvedValue({
        images: [{ b64_json: b64 }],
        usage: { totalTokens: 100 },
      }),
    }),
  }
})

import request from 'supertest'
import { app, uid, cleanup, prisma } from './setup'

const PFX = 'gen'
const testPass = 'test123456'

describe('POST /api/generate', () => {
  let token = ''
  let canvasId = 0
  let modelId = 0
  const name = uid(PFX, 'user')

  beforeAll(async () => {
    const r = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    token = r.body.accessToken

    const mr = await request(app).get('/api/models').set('Authorization', `Bearer ${token}`)
    const models = mr.body.models
    if (models.length > 0) modelId = models[0].id

    const cr = await request(app).post('/api/canvas').set('Authorization', `Bearer ${token}`)
    canvasId = cr.body.canvas.id

    await prisma.user.update({ where: { username: name }, data: { credits: 100 } })
  })

  afterAll(() => cleanup(PFX))

  it('算力足够时生图成功', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelId, canvasId, prompt: 'a cat' })

    expect(res.status).toBe(200)
    expect(res.body.images).toBeDefined()
    expect(res.body.images.length).toBeGreaterThan(0)
    expect(res.body.credits).toBeDefined()
  })

  it('未登录返回 401', async () => {
    const res = await request(app).post('/api/generate').send({ modelId, canvasId, prompt: 'test' })
    expect(res.status).toBe(401)
  })

  it('无效模型返回 400', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelId: 99999, canvasId, prompt: 'test' })

    expect(res.status).toBe(400)
  })

  it('缺少 canvasId 返回 400', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ modelId, prompt: 'test' })

    expect(res.status).toBe(400)
  })

  it('他人画布返回 404', async () => {
    const otherName = uid(PFX, 'other')
    const rr = await request(app).post('/api/auth/register').send({ username: otherName, password: testPass })
    const otherToken = rr.body.accessToken

    const res = await request(app)
      .post('/api/generate')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ modelId, canvasId, prompt: 'test' })

    expect(res.status).toBe(404)
  })

  it('算力不足返回 402', async () => {
    const poorName = uid(PFX, 'poor')
    const rr = await request(app).post('/api/auth/register').send({ username: poorName, password: testPass })
    const poorToken = rr.body.accessToken

    const cr = await request(app).post('/api/canvas').set('Authorization', `Bearer ${poorToken}`)
    const poorCanvasId = cr.body.canvas.id

    const res = await request(app)
      .post('/api/generate')
      .set('Authorization', `Bearer ${poorToken}`)
      .send({ modelId, canvasId: poorCanvasId, prompt: 'test' })

    expect(res.status).toBe(402)
  })
})
