import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, uid, cleanup, prisma } from './setup'

const PFX = 'mdl'
const testPass = 'test123456'

describe('GET /api/models', () => {
  let token = ''
  const name = uid(PFX, 'user')

  beforeAll(async () => {
    const r = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    token = r.body.accessToken

    // Ensure at least one model exists in CI's empty database
    const count = await prisma.aiModel.count()
    if (count === 0) {
      await prisma.aiModel.create({
        data: {
          name: '__test_model__', provider: 'seedream', baseUrl: 'http://test',
          apiKey: 'sk-test-masking', modelName: 'test-model', category: 'image',
          enabled: true, costCredits: 1,
        },
      })
    }
  })

  afterAll(() => cleanup(PFX))

  it('返回模型列表', async () => {
    const res = await request(app).get('/api/models').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.models)).toBe(true)
  })

  it('API key 已脱敏', async () => {
    const res = await request(app).get('/api/models').set('Authorization', `Bearer ${token}`)
    const models = res.body.models as Array<Record<string, unknown>>
    expect(models.length).toBeGreaterThan(0)

    for (const m of models) {
      const key = m.apiKey as string
      expect(key).not.toMatch(/^ark-/)
      expect(key).not.toMatch(/^sk-/)
      // 脱敏后应包含 '...' 或为 '***'
      expect(key.includes('...') || key === '***').toBe(true)
    }
  })

  it('未登录返回 401', async () => {
    const res = await request(app).get('/api/models')
    expect(res.status).toBe(401)
  })
})
