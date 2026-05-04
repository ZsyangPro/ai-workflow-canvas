import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, uid, cleanup } from './setup'

const PFX = 'auth'
const testPass = 'test123456'

describe('POST /api/auth/register', () => {
  afterAll(() => cleanup(PFX))

  it('注册新用户返回 token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: uid(PFX, 'reg'), password: testPass })

    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
  })

  it('重复用户名返回 409', async () => {
    const name = uid(PFX, 'dup')
    await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    const res = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    expect(res.status).toBe(409)
  })

  it('缺少字段返回 400', async () => {
    const res = await request(app).post('/api/auth/register').send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  const name = uid(PFX, 'login')
  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({ username: name, password: testPass })
  })
  afterAll(() => cleanup(PFX))

  it('正确密码返回 token', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: name, password: testPass })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it('错误密码返回 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: name, password: 'wrong' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  const name = uid(PFX, 'me')
  let token = ''
  beforeAll(async () => {
    const r = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    token = r.body.accessToken
  })
  afterAll(() => cleanup(PFX))

  it('有效 token 返回用户信息', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe(name)
    expect(res.body.user.credits).toBeDefined()
  })

  it('无 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('无效 token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalidtoken123')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  const name = uid(PFX, 'logout')
  let token = ''
  beforeAll(async () => {
    const r = await request(app).post('/api/auth/register').send({ username: name, password: testPass })
    token = r.body.accessToken
  })
  afterAll(() => cleanup(PFX))

  it('登出后旧 token 失效', async () => {
    const r = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(401)
  })
})
