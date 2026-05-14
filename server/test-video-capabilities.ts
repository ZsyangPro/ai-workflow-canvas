/**
 * 视频生成接口能力测试脚本
 * 用法: cd server && npx tsx test-video-capabilities.ts
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import 'dotenv/config'

const BASE_URL = 'http://localhost:3000'
const TEST_USER = `test_video_${Date.now()}`
const TEST_PASS = 'test123456'
const CREDITS = 500
const POLL_INTERVAL = 3000
const MAX_POLL_SEC = 600 // 10 minutes max

// ---- helpers ----

function p(...parts: string[]) { return path.join(__dirname, ...parts) }

async function apiFetch(url: string, init?: RequestInit): Promise<{ res: Response; json: any }> {
  const mergedHeaders = { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  const res = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: mergedHeaders,
  })
  let json: any = {}
  try { json = await res.json() } catch {}
  return { res, json }
}

let token = ''

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

// ---- setup ----

async function setup(): Promise<{ canvasId: number }> {
  console.log('=== Setup: register, create canvas, top up credits ===')

  const r1 = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS, role: 'user' }),
  })
  if (!r1.res.ok) throw new Error(`Register failed: ${JSON.stringify(r1.json)}`)
  token = r1.json.accessToken
  console.log(`  Registered user: ${TEST_USER}`)

  const r2 = await apiFetch('/api/canvas', {
    method: 'POST',
    headers: authHeader(),
  })
  if (!r2.res.ok) throw new Error(`Create canvas failed: ${JSON.stringify(r2.json)}`)
  const canvasId = r2.json.canvas.id
  console.log(`  Created canvas: ${canvasId}`)

  // Top up credits via direct Prisma update
  const { PrismaClient } = await import('./src/lib/prisma') as any
  const prisma = (await import('./src/lib/prisma')).default
  await prisma.user.update({ where: { username: TEST_USER }, data: { credits: CREDITS } })
  console.log(`  Credits set to: ${CREDITS}`)
  await prisma.$disconnect()

  return { canvasId }
}

// ---- image preparation ----

const ASSETS_DIR = path.join(process.cwd(), 'data/assets')
const RESOURCES_DIR = path.join(process.cwd(), '..', 'test-resources')
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

function publicUrl(localPath: string): string {
  return localPath.startsWith('http') ? localPath : `${PUBLIC_BASE.replace(/\/+$/, '')}${localPath}`
}

function copyImageToAssets(filename: string): string {
  const src = path.join(RESOURCES_DIR, 'images', filename)
  const uuid = crypto.randomUUID()
  const ext = path.extname(filename)
  const dest = path.join(ASSETS_DIR, `${uuid}${ext}`)
  fs.copyFileSync(src, dest)
  console.log(`  Copied ${filename} → /api/assets/${uuid}${ext}`)
  return `/api/assets/${uuid}${ext}`
}

function copyVideoToAssets(filename: string): string {
  const src = path.join(RESOURCES_DIR, 'videos', filename)
  const uuid = crypto.randomUUID()
  const ext = path.extname(filename)
  const dest = path.join(ASSETS_DIR, `${uuid}${ext}`)
  fs.copyFileSync(src, dest)
  console.log(`  Copied ${filename} → /api/assets/${uuid}${ext}`)
  return `/api/assets/${uuid}${ext}`
}

function readPrompt(filename: string): string {
  return fs.readFileSync(path.join(RESOURCES_DIR, 'prompts', filename), 'utf-8').trim()
}

// ---- test runner ----

interface TestCase {
  name: string
  modelId: number
  body: Record<string, unknown>
  expectedFeatures: string[] // for report
  refImages?: string[] // local paths to reference images for comparison
}

interface TestResult {
  name: string
  modelId: number
  status: 'success' | 'failed' | 'timeout' | 'error'
  taskId?: string
  videoUrl?: string
  lastFrameUrl?: string
  localVideoPath?: string
  duration_sec: number
  error?: string
  resolution?: string
  credits_used?: number
  expectedFeatures: string[]
  refImages?: string[]
}

async function submitTask(modelId: number, body: Record<string, unknown>): Promise<{ taskId: string; credits: number } | { error: string }> {
  const { res, json } = await apiFetch('/api/generate-video', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    return { error: `${res.status}: ${json.error || 'unknown'}` }
  }
  return { taskId: json.taskId, credits: json.credits }
}

async function pollTask(taskId: string): Promise<{ status: string; videoUrl?: string; lastFrameUrl?: string; error?: string }> {
  const { res, json } = await apiFetch(`/api/generate-video/${taskId}`, {
    headers: authHeader(),
  })
  return json
}

async function runTest(tc: TestCase, canvasId: number): Promise<TestResult> {
  const startTime = Date.now()
  console.log(`\n  [${tc.name}] Submitting...`)

  const submitResult = await submitTask(tc.modelId, { ...tc.body, canvasId, nodeId: `test-${tc.name}` })
  if ('error' in submitResult) {
    return {
      name: tc.name,
      modelId: tc.modelId,
      status: 'error',
      error: submitResult.error,
      duration_sec: (Date.now() - startTime) / 1000,
      expectedFeatures: tc.expectedFeatures,
      refImages: tc.refImages,
    }
  }

  const { taskId, credits } = submitResult
  console.log(`  [${tc.name}] taskId=${taskId}, polling...`)

  const deadline = Date.now() + MAX_POLL_SEC * 1000
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL)
    const result = await pollTask(taskId)

    if (result.status === 'succeeded') {
      const duration_sec = (Date.now() - startTime) / 1000
      console.log(`  [${tc.name}] ✅ SUCCESS (${duration_sec.toFixed(0)}s) videoUrl=${result.videoUrl}`)

      // Download video
      let localVideoPath = ''
      if (result.videoUrl) {
        const videoUrl = result.videoUrl.startsWith('http') ? result.videoUrl : `${BASE_URL}${result.videoUrl}`
        try {
          const vRes = await fetch(videoUrl, { headers: authHeader() })
          if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`)
          const ab = await vRes.arrayBuffer()
          const buffer = Buffer.from(new Uint8Array(ab))
          const outDir = path.join(process.cwd(), '..', 'test-results/videos')
          fs.mkdirSync(outDir, { recursive: true })
          const filename = `${tc.name.replace(/[^a-zA-Z0-9一-龥]/g, '_')}.mp4`
          fs.writeFileSync(path.join(outDir, filename), buffer)
          localVideoPath = `test-results/videos/${filename}`
          console.log(`    Downloaded: ${localVideoPath} (${(buffer.length/1024).toFixed(0)}KB)`)
        } catch (e: any) {
          console.log(`    Download failed: ${e?.message || e}`)
        }
      }

      return {
        name: tc.name,
        modelId: tc.modelId,
        status: 'success',
        taskId,
        videoUrl: result.videoUrl,
        lastFrameUrl: result.lastFrameUrl,
        localVideoPath,
        duration_sec,
        credits_used: credits,
        expectedFeatures: tc.expectedFeatures,
        refImages: tc.refImages,
      }
    }

    if (result.status === 'failed') {
      const duration_sec = (Date.now() - startTime) / 1000
      console.log(`  [${tc.name}] ❌ FAILED: ${result.error}`)
      return {
        name: tc.name,
        modelId: tc.modelId,
        status: 'failed',
        taskId,
        error: result.error,
        duration_sec,
        expectedFeatures: tc.expectedFeatures,
        refImages: tc.refImages,
      }
    }

    // Still running
    process.stdout.write('.')
  }

  console.log(`  [${tc.name}] ⏰ TIMEOUT`)
  return {
    name: tc.name,
    modelId: tc.modelId,
    status: 'timeout',
    taskId,
    error: 'Polling timeout',
    duration_sec: (Date.now() - startTime) / 1000,
    expectedFeatures: tc.expectedFeatures,
    refImages: tc.refImages,
  }
}

// ---- report generation ----

function generateReport(results: TestResult[], modelNames: Map<number, string>): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const reportPath = path.join(process.cwd(), '..', 'test-results', `report-${now}.md`)

  let md = `# 视频生成接口能力测试报告\n\n`
  md += `**测试时间**: ${new Date().toISOString()}\n`
  md += `**测试用户**: ${TEST_USER}\n`
  md += `**总场景数**: ${results.length}\n\n`

  // Summary
  const successCount = results.filter(r => r.status === 'success').length
  const failCount = results.filter(r => r.status === 'failed').length
  const errorCount = results.filter(r => r.status === 'error').length
  const timeoutCount = results.filter(r => r.status === 'timeout').length
  md += `## 汇总\n\n`
  md += `| 状态 | 数量 |\n|------|------|\n`
  md += `| ✅ 成功 | ${successCount} |\n`
  md += `| ❌ 失败 | ${failCount} |\n`
  md += `| ⚠️ 错误 | ${errorCount} |\n`
  md += `| ⏰ 超时 | ${timeoutCount} |\n\n`

  // Detail table
  md += `## 详细结果\n\n`
  md += `| # | 模型 | 场景 | 状态 | 耗时 | 期望能力 | 备注 |\n`
  md += `|---|------|------|------|------|---------|------|\n`
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const modelName = modelNames.get(r.modelId) || `id=${r.modelId}`
    const statusEmoji = r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : r.status === 'error' ? '⚠️' : '⏰'
    const features = r.expectedFeatures.join('、')
    let note = ''
    if (r.status === 'success') {
      note = r.localVideoPath ? `[视频](${r.localVideoPath})` : r.videoUrl || ''
      if (r.lastFrameUrl) note += ` [尾帧](${r.lastFrameUrl})`
    } else {
      note = r.error || ''
    }
    md += `| ${i + 1} | ${modelName} | ${r.name} | ${statusEmoji} | ${r.duration_sec.toFixed(0)}s | ${features} | ${note} |\n`
  }

  // Per-feature analysis
  md += `\n## 能力验证分析\n\n`

  // Collect all features
  const allFeatures = new Map<string, { total: number; success: number; results: TestResult[] }>()
  for (const r of results) {
    for (const f of r.expectedFeatures) {
      if (!allFeatures.has(f)) allFeatures.set(f, { total: 0, success: 0, results: [] })
      const entry = allFeatures.get(f)!
      entry.total++
      if (r.status === 'success') entry.success++
      entry.results.push(r)
    }
  }

  for (const [feature, stats] of allFeatures) {
    const statusIcon = stats.success === stats.total ? '✅' : stats.success > 0 ? '⚠️' : '❌'
    md += `### ${statusIcon} ${feature} (${stats.success}/${stats.total})\n\n`
    for (const r of stats.results) {
      const sIcon = r.status === 'success' ? '✅' : '❌'
      md += `- ${sIcon} ${r.name}: ${r.status === 'success' ? (r.localVideoPath || '成功') : (r.error || '失败')}\n`
    }
    md += '\n'
  }

  // Reference image comparison section
  const refTests = results.filter(r => r.status === 'success' && r.refImages && r.refImages.length > 0 && r.localVideoPath)
  if (refTests.length > 0) {
    md += `## 参考图对比\n\n`
    md += `请打开视频链接，对比参考图判断参考效果：\n\n`
    for (const r of refTests) {
      md += `### ${r.name}\n\n`
      md += `**生成的视频**: [${r.localVideoPath}](${r.localVideoPath})\n\n`
      md += `**参考图片**:\n`
      for (const img of r.refImages || []) {
        md += `- ${img}\n`
      }
      md += '\n'
    }
  }

  // Failed tests detail
  const failedTests = results.filter(r => r.status !== 'success')
  if (failedTests.length > 0) {
    md += `## 失败/错误详情\n\n`
    for (const r of failedTests) {
      md += `### ${r.name}\n\n`
      md += `- **状态**: ${r.status}\n`
      md += `- **错误**: ${r.error || '无'}\n`
      md += `- **耗时**: ${r.duration_sec.toFixed(0)}s\n\n`
    }
  }

  fs.mkdirSync(path.join(process.cwd(), '..', 'test-results'), { recursive: true })
  fs.writeFileSync(reportPath, md)
  console.log(`\n📄 Report written to: ${reportPath}`)
  return reportPath
}

// ---- cleanup ----
async function cleanup() {
  try {
    const { default: prisma } = await import('./src/lib/prisma')
    await prisma.videoTask.deleteMany({ where: { userId: (await prisma.user.findUnique({ where: { username: TEST_USER } }))?.id || 0 } })
    await prisma.canvas.deleteMany({ where: { userId: (await prisma.user.findUnique({ where: { username: TEST_USER } }))?.id || 0 } })
    await prisma.creditTransaction.deleteMany({ where: { userId: (await prisma.user.findUnique({ where: { username: TEST_USER } }))?.id || 0 } })
    await prisma.user.deleteMany({ where: { username: TEST_USER } })
    await prisma.$disconnect()
    console.log('  Cleanup done')
  } catch { /* best effort */ }
}

// ---- main ----

async function main() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║  视频生成接口能力测试                ║')
  console.log('╚══════════════════════════════════════╝\n')

  // Create output dirs
  fs.mkdirSync(path.join(process.cwd(), '..', 'test-results/videos'), { recursive: true })
  fs.mkdirSync(ASSETS_DIR, { recursive: true })

  // Setup
  const { canvasId } = await setup()

  // Prepare assets
  console.log('\n=== Copy test assets ===')
  const imgFirstFrame = copyImageToAssets('first-frame.jpg')
  const imgLastFrame = copyImageToAssets('last-frame.jpg')
  const imgRef1 = copyImageToAssets('reference-1.jpg')
  const imgRef2 = copyImageToAssets('reference-2.jpg')
  const imgRef3 = copyImageToAssets('reference-3.jpg')
  const imgFace = copyImageToAssets('face-photo.jpg')
  const vidRef = copyVideoToAssets('reference-video.mp4')

  // Read prompts
  console.log('\n=== Read prompts ===')
  const promptText = readPrompt('text-only.txt')
  const promptImages = readPrompt('with-images.txt')
  const promptFace = readPrompt('with-face.txt')
  const promptVideo = readPrompt('with-video.txt')
  const promptFirstLast = readPrompt('first-last-frame.txt')

  // Model name map
  const modelNames = new Map<number, string>()

  // Fetch models to get names
  const modelRes = await apiFetch('/api/models')
  if (modelRes.res.ok && modelRes.json.models) {
    for (const m of modelRes.json.models) {
      if (m.category === 'video') {
        modelNames.set(m.id as number, m.name as string)
      }
    }
  }
  console.log('Models:', [...modelNames.entries()].map(([id, name]) => `${name}(#${id})`).join(', '))

  // Public China-accessible images for reliable testing
  // Volcengine TOS (from ZLHub docs) — fast, China-accessible, proven working
  // Jump host HTTP server is too slow — ZLHub times out downloading images
  const puFirstFrame = 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg'
  const puLastFrame = 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg'
  const puRef1 = puFirstFrame
  const puRef2 = puLastFrame
  const puRef3 = puFirstFrame
  // Face/video ref: cannot test locally — images need Chinese cloud storage or Ningxia deploy
  // Skipping Seedance 真人参考审核 and Seedance 参考视频 tests for now

  // Define test cases
  const testCases: TestCase[] = [
    // ===== Seedance 2.0 (id=17) =====
    {
      name: 'Seedance 纯文生视频',
      modelId: 17,
      body: { modelId: 17, prompt: promptText, duration: 5, aspectRatio: '16:9', resolution: '720p' },
      expectedFeatures: ['文生视频', '16:9', '720p'],
    },
    {
      name: 'Seedance 首尾帧+音频+竖屏',
      modelId: 17,
      body: {
        modelId: 17, prompt: promptFirstLast, duration: 8, aspectRatio: '9:16', resolution: '1080p',
        firstFrameUrl: puFirstFrame, lastFrameUrl: puLastFrame,
        generateAudio: true,
      },
      expectedFeatures: ['首帧', '尾帧', '音频生成', '9:16竖屏', '1080p'],
      refImages: [puFirstFrame, puLastFrame],
    },
    {
      name: 'Seedance 多参考图',
      modelId: 17,
      body: {
        modelId: 17, prompt: promptImages, duration: 5, aspectRatio: '16:9', resolution: '720p',
        referenceUrls: [puRef1, puRef2, puRef3],
      },
      expectedFeatures: ['多参考图(3张)', '16:9'],
      refImages: [puRef1, puRef2, puRef3],
    },
    // Seedance 真人参考审核 — SKIPPED: image needs Chinese cloud storage (jump host HTTP too slow for ZLHub)
    // Seedance 参考视频 — SKIPPED: video needs Chinese cloud storage

    // ===== Vidu (id=19 text2video, id=20 img2video, id=23 reference2video, id=24 start-end2video) =====
    {
      name: 'Vidu 文生视频',
      modelId: 19,
      body: { modelId: 19, prompt: promptText, duration: 5 },
      expectedFeatures: ['Vidu文生'],
    },
    {
      name: 'Vidu 图生视频',
      modelId: 20,
      body: { modelId: 20, prompt: promptImages, duration: 5, firstFrameUrl: puFirstFrame },
      expectedFeatures: ['Vidu图生', '首帧'],
      refImages: [puFirstFrame],
    },
    {
      name: 'Vidu 参考图生视频',
      modelId: 23,
      body: { modelId: 23, prompt: promptImages, duration: 5, referenceUrls: [puRef1, puRef2] },
      expectedFeatures: ['Vidu多参考图'],
      refImages: [puRef1, puRef2],
    },
    {
      name: 'Vidu 首尾帧生视频',
      modelId: 24,
      body: { modelId: 24, prompt: promptFirstLast, duration: 5, firstFrameUrl: puFirstFrame, lastFrameUrl: puLastFrame },
      expectedFeatures: ['Vidu首尾帧'],
      refImages: [puFirstFrame, puLastFrame],
    },

    // ===== Kling (id=21 text2video, id=22 image2video, id=25 omni-video, id=26 motion-control) =====
    {
      name: 'Kling 文生视频',
      modelId: 21,
      body: { modelId: 21, prompt: promptText, duration: 5 },
      expectedFeatures: ['Kling文生'],
    },
    {
      name: 'Kling 图生视频',
      modelId: 22,
      body: { modelId: 22, prompt: promptImages, duration: 5, firstFrameUrl: puFirstFrame },
      expectedFeatures: ['Kling图生', '首帧'],
      refImages: [puFirstFrame],
    },
    {
      name: 'Kling Omni视频',
      modelId: 25,
      body: { modelId: 25, prompt: promptText, duration: 5 },
      expectedFeatures: ['KlingOmni'],
    },
    {
      name: 'Kling 运动控制',
      modelId: 26,
      body: { modelId: 26, prompt: promptImages, duration: 5, firstFrameUrl: puFirstFrame },
      expectedFeatures: ['Kling运动控制', '首帧'],
      refImages: [puFirstFrame],
    },
  ]

  // Run all tests in parallel (submit all, then poll all)
  console.log(`\n=== Running ${testCases.length} tests ===\n`)

  const results: TestResult[] = []

  // Phase 1: Submit all
  type Pending = { tc: TestCase; taskId: string; credits: number; startTime: number }
  const pending: Pending[] = []
  for (const tc of testCases) {
    const startTime = Date.now()
    const result = await submitTask(tc.modelId, { ...tc.body, canvasId, nodeId: `test-${tc.name}` })
    if ('error' in result) {
      results.push({
        name: tc.name, modelId: tc.modelId, status: 'error', error: result.error,
        duration_sec: (Date.now() - startTime) / 1000,
        expectedFeatures: tc.expectedFeatures, refImages: tc.refImages,
      })
      console.log(`  [${tc.name}] ❌ SUBMIT ERROR: ${result.error}`)
    } else {
      pending.push({ tc, taskId: result.taskId, credits: result.credits, startTime })
      console.log(`  [${tc.name}] 📤 taskId=${result.taskId}`)
    }
    await sleep(500) // small delay between submissions
  }

  // Phase 2: Poll all
  console.log(`\n=== Polling ${pending.length} tasks ===\n`)

  const deadline = Date.now() + MAX_POLL_SEC * 1000
  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(POLL_INTERVAL)

    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]
      const pollResult = await pollTask(p.taskId)

      if (pollResult.status === 'succeeded') {
        const duration_sec = (Date.now() - p.startTime) / 1000
        console.log(`\n  [${p.tc.name}] ✅ SUCCESS (${duration_sec.toFixed(0)}s)`)

        // Download video
        let localVideoPath = ''
        if (pollResult.videoUrl) {
          const videoUrl = pollResult.videoUrl.startsWith('http') ? pollResult.videoUrl : `${BASE_URL}${pollResult.videoUrl}`
          try {
            const vRes = await fetch(videoUrl, { headers: authHeader() })
            if (vRes.ok) {
              const ab = await vRes.arrayBuffer()
              const buffer = Buffer.from(new Uint8Array(ab))
              const outDir = path.join(process.cwd(), '..', 'test-results/videos')
              const filename = `${pending[i].tc.name.replace(/[^a-zA-Z0-9一-龥]/g, '_')}.mp4`
              fs.writeFileSync(path.join(outDir, filename), buffer)
              localVideoPath = `test-results/videos/${filename}`
              console.log(`    Downloaded: ${localVideoPath} (${(buffer.length/1024).toFixed(0)}KB)`)
            }
          } catch (e: any) {
            console.log(`    Download failed: ${e?.message || e}`)
          }
        }

        results.push({
          name: p.tc.name, modelId: p.tc.modelId, status: 'success', taskId: p.taskId,
          videoUrl: pollResult.videoUrl, lastFrameUrl: pollResult.lastFrameUrl,
          localVideoPath, duration_sec,
          expectedFeatures: p.tc.expectedFeatures, refImages: p.tc.refImages,
        })
        pending.splice(i, 1)

      } else if (pollResult.status === 'failed') {
        const duration_sec = (Date.now() - p.startTime) / 1000
        console.log(`\n  [${p.tc.name}] ❌ FAILED: ${pollResult.error}`)
        results.push({
          name: p.tc.name, modelId: p.tc.modelId, status: 'failed', taskId: p.taskId,
          error: pollResult.error, duration_sec,
          expectedFeatures: p.tc.expectedFeatures, refImages: p.tc.refImages,
        })
        pending.splice(i, 1)

      } else {
        process.stdout.write('.')
      }
    }
  }

  // Timeouts for remaining
  for (const p of pending) {
    console.log(`\n  [${p.tc.name}] ⏰ TIMEOUT`)
    results.push({
      name: p.tc.name, modelId: p.tc.modelId, status: 'timeout', taskId: p.taskId,
      error: 'Polling timeout', duration_sec: (Date.now() - p.startTime) / 1000,
      expectedFeatures: p.tc.expectedFeatures, refImages: p.tc.refImages,
    })
  }

  // Generate report
  console.log('\n=== Generating Report ===')
  const reportPath = generateReport(results, modelNames)

  // Print summary
  const successCount = results.filter(r => r.status === 'success').length
  const failCount = results.filter(r => r.status !== 'success').length
  console.log(`\n╔══════════════════════════════════════╗`)
  console.log(`║  Results: ${successCount} ✅ / ${failCount} ❌              ║`)
  console.log(`║  Report: ${reportPath}  ║`)
  console.log(`╚══════════════════════════════════════╝`)

  // Cleanup
  console.log('\n=== Cleanup ===')
  await cleanup()
  console.log('Done.')
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
