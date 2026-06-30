import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, Tray, Menu, Notification } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'

let mainWindow = null
let tray = null

// 单条接口配置（一个供应商 / 一个代理实例）。图片与视频模型分开，
// 因为同一代理常常用不同的模型名出图与出片。
function makeProvider(patch = {}) {
  return {
    id: patch.id || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: patch.name || '新接口',
    baseUrl: patch.baseUrl || '',
    apiKey: patch.apiKey || '',
    imageModel: patch.imageModel || '',
    videoModel: patch.videoModel || '',
    optimizeModel: patch.optimizeModel || '',
    imageSize: patch.imageSize || '',
    videoSize: patch.videoSize || '',
    videoSeconds: patch.videoSeconds || '',
    // 高级：各端点路径可按平台实际情况改（多数 OpenAI 兼容代理无需改）
    editPath: patch.editPath || '/images/edits',
    videoPath: patch.videoPath || '/videos/generations',
    videoPollPath: patch.videoPollPath || ''
  }
}

const DEFAULT_SETTINGS = {
  providers: [],
  activeProviderId: '',
  defaultCount: 1,
  saveDir: '',
  theme: 'sky',
  customColor: '#10b981',
  closeAction: 'ask',
  chatModel: '',
  chatProviderId: '',
  alertEnabled: false,
  alertThreshold: 5
}

function settingsFile() {
  return join(app.getPath('userData'), 'settings.json')
}

function defaultSaveDir() {
  return join(app.getPath('pictures'), 'RawPhotos')
}

// 把旧版「单接口扁平配置」迁移成「多接口」结构，老用户升级不丢配置。
function migrate(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) }
  if (!Array.isArray(s.providers) || s.providers.length === 0) {
    const seeded = []
    // 用的是中转/聚合代理，不是本机服务，所以命名与默认都按「中转接口」处理
    if (raw && (raw.baseUrl || raw.model || raw.apiKey)) {
      seeded.push(
        makeProvider({
          name: '中转接口',
          baseUrl: raw.baseUrl || '',
          apiKey: raw.apiKey || '',
          imageModel: raw.model || 'grok-imagine-image',
          imageSize: raw.size || ''
        })
      )
    }
    // 用户给过 apimf 的 flux 中转接口，作为开箱预设方便填 Key 即用
    seeded.push(
      makeProvider({
        name: 'apimf 中转（flux）',
        baseUrl: 'https://kiro.apimf.top/v1',
        imageModel: 'flux',
        imageSize: '1024x1024'
      })
    )
    s.providers = seeded
  }
  // 字段补全 + 历史值纠正
  s.providers = s.providers.map((p) => {
    const fixed = makeProvider(p)
    // 历史自动命名「本地 CLIProxyAPI」纠正为「中转接口」（实为中转代理）
    if (fixed.name === '本地 CLIProxyAPI') fixed.name = '中转接口'
    // 旧默认 grok-2-image 在中转普遍不支持，纠正为 Grok Imagine 图片模型（已确认可用）
    if (fixed.imageModel === 'grok-2-image') fixed.imageModel = 'grok-imagine-image'
    // 没填视频模型时给个同系默认，方便直接出片（不对可在设置里改）
    if (!fixed.videoModel) fixed.videoModel = 'grok-imagine-video'
    return fixed
  })
  if (!s.activeProviderId || !s.providers.some((p) => p.id === s.activeProviderId)) {
    s.activeProviderId = s.providers[0].id
  }
  if (!['green', 'sky', 'dark', 'custom'].includes(s.theme)) s.theme = 'sky'
  delete s.baseUrl
  delete s.apiKey
  delete s.model
  delete s.size
  return s
}

async function readSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf-8'))
    return migrate(raw)
  } catch {
    return migrate(null)
  }
}

async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...(patch || {}) }
  const clean = migrate(next)
  await fs.writeFile(settingsFile(), JSON.stringify(clean, null, 2), 'utf-8')
  return clean
}

function activeProvider(settings) {
  return (
    settings.providers.find((p) => p.id === settings.activeProviderId) ||
    settings.providers[0] ||
    makeProvider()
  )
}

function normalizeBaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 统一的 JSON 请求：超时、鉴权、错误信息清洗都在这里收口。
async function requestJson(url, { method = 'GET', apiKey = '', body = null, timeoutMs = 60000, signal = null } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）。可降低数量/时长或稍后再试。`)
    }
    throw new Error(`请求失败：${err.message}（请确认接口地址可达、服务已启动）`)
  }
  clearTimeout(timer)

  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try {
      msg = JSON.parse(text)?.error?.message || msg
    } catch {
      // 保留原始文本
    }
    const err = new Error(`接口返回 HTTP ${res.status}：${String(msg).slice(0, 800)}`)
    err.status = res.status
    err.responseText = String(text).slice(0, 2000)
    throw err
  }
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    throw new Error(`接口返回非 JSON 内容：${text.slice(0, 300)}`)
  }
}

// 图生图走 multipart（/images/edits），与 JSON 的 requestJson 分开。错误同样挂 status/responseText。
async function requestMultipart(url, { apiKey = '', form, timeoutMs = 180000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: form,
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）。`)
    throw new Error(`请求失败：${err.message}（请确认接口地址可达）`)
  }
  clearTimeout(timer)
  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try {
      msg = JSON.parse(text)?.error?.message || msg
    } catch {
      // 保留原始文本
    }
    const err = new Error(`接口返回 HTTP ${res.status}：${String(msg).slice(0, 800)}`)
    err.status = res.status
    err.responseText = String(text).slice(0, 2000)
    throw err
  }
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    throw new Error(`接口返回非 JSON 内容：${text.slice(0, 300)}`)
  }
}

// 从五花八门的返回结构里抽取媒体（图片/视频）地址或 base64。
// 兼容 OpenAI data[] 结构与若干代理常见的扁平/嵌套结构。
function pickMediaItems(json) {
  const out = []
  const push = (b64, url, extra = {}) => {
    if (b64 || url) out.push({ b64: b64 || null, url: url || null, ...extra })
  }
  const data = Array.isArray(json?.data) ? json.data : []
  for (const d of data) {
    push(d.b64_json || d.b64 || null, d.url || d.video_url || null, {
      revisedPrompt: d.revised_prompt || null
    })
  }
  if (!out.length) {
    if (typeof json?.url === 'string') push(null, json.url)
    if (typeof json?.video_url === 'string') push(null, json.video_url)
    if (json?.video && typeof json.video.url === 'string') push(null, json.video.url)
    if (json?.data && typeof json.data.url === 'string') push(null, json.data.url)
    if (json?.result && typeof json.result.url === 'string') push(null, json.result.url)
    if (typeof json?.output === 'string') push(null, json.output)
    if (Array.isArray(json?.output)) {
      json.output.forEach((u) => typeof u === 'string' && push(null, u))
    }
  }
  return out
}

const TERMINAL_OK = ['succeeded', 'success', 'completed', 'complete', 'finished', 'done', 'ok']
const TERMINAL_BAD = ['failed', 'error', 'errored', 'canceled', 'cancelled', 'rejected']

// 异步出片：部分代理先返回任务ID，需轮询直到拿到地址。状态/字段名各家不一，
// 这里尽量宽松：拿到媒体即返回，命中失败态即报错，超时兜底。
async function pollVideoJob(baseUrl, provider, jobId) {
  const tmpl = provider.videoPollPath
    ? provider.videoPollPath
    : `${normalizeBaseUrl(provider.videoPath) || '/videos/generations'}/{id}`
  const pollPath = tmpl.includes('{id}') ? tmpl.replace('{id}', encodeURIComponent(jobId)) : `${tmpl.replace(/\/+$/, '')}/${encodeURIComponent(jobId)}`
  const pollUrl = pollPath.startsWith('http') ? pollPath : `${baseUrl}${pollPath.startsWith('/') ? '' : '/'}${pollPath}`

  const deadline = Date.now() + 600000
  let delay = 3000
  while (Date.now() < deadline) {
    await sleep(delay)
    let json
    try {
      ({ json } = await requestJson(pollUrl, { apiKey: provider.apiKey, timeoutMs: 30000 }))
    } catch (err) {
      // 轮询途中的瞬时错误不立刻放弃，继续重试到截止
      delay = Math.min(delay + 1500, 9000)
      continue
    }
    const items = pickMediaItems(json)
    if (items.length) return items
    const status = String(json.status || json?.data?.status || json?.result?.status || '').toLowerCase()
    if (TERMINAL_BAD.includes(status)) {
      const reason = json?.error?.message || json?.message || status
      throw new Error(`视频任务失败：${String(reason).slice(0, 300)}`)
    }
    delay = Math.min(delay + 1000, 9000)
  }
  throw new Error('视频生成超时（10 分钟未完成）。可稍后到画廊查看，或缩短时长重试。')
}

async function toBuffer({ b64, url, path }) {
  if (b64) return Buffer.from(b64, 'base64')
  if (path) return fs.readFile(path)
  if (url) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`下载文件失败：HTTP ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  }
  throw new Error('没有可用的媒体数据')
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i
const VIDEO_RE = /\.(mp4|webm|mov|mkv|m4v)$/i

function mimeOf(name) {
  const ext = String(name).split('.').pop().toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

function defaultExt(kind) {
  return kind === 'video' ? 'mp4' : 'png'
}

// 运行日志：内存环形缓冲（给「日志」页看）+ 追加到 userData/rawphotos.log（可分享排错）。
const LOG_MAX = 300
const logs = []
let logSeq = 0

function logFile() {
  return join(app.getPath('userData'), 'rawphotos.log')
}

function pushLog(entry) {
  const e = { id: ++logSeq, time: Date.now(), ...entry }
  logs.unshift(e)
  if (logs.length > LOG_MAX) logs.length = LOG_MAX
  // JSONL：每行一个完整 JSON，重启后能原样读回（含 detail），不只是人读文本
  fs.appendFile(logFile(), JSON.stringify(e) + '\n', 'utf-8').catch(() => {})
  recordUsage(e)
  mainWindow?.webContents?.send('logs:new', e)
  return e
}

// 累计用量统计：独立于 300 条日志环形缓冲，长期累计、持久化到 userData/rawphotos-usage.json
function freshUsage() {
  return { byKind: {}, byModel: {}, byDay: {}, ok: 0, fail: 0, firstAt: null }
}
let usage = freshUsage()
let usageTimer = null

function usageFile() {
  return join(app.getPath('userData'), 'rawphotos-usage.json')
}
function saveUsage() {
  clearTimeout(usageTimer)
  usageTimer = setTimeout(() => {
    fs.writeFile(usageFile(), JSON.stringify(usage), 'utf-8').catch(() => {})
  }, 600)
}
async function loadUsage() {
  try {
    const o = JSON.parse(await fs.readFile(usageFile(), 'utf-8'))
    usage = {
      ...freshUsage(),
      ...o,
      byKind: { ...(o.byKind || {}) },
      byModel: { ...(o.byModel || {}) },
      byDay: { ...(o.byDay || {}) }
    }
  } catch {
    usage = freshUsage()
  }
}
function recordUsage(e) {
  usage.byKind[e.kind] = (usage.byKind[e.kind] || 0) + 1
  if (e.ok) usage.ok += 1
  else usage.fail += 1
  if (e.model) usage.byModel[e.model] = (usage.byModel[e.model] || 0) + 1
  const day = new Date(e.time).toISOString().slice(0, 10)
  usage.byDay[day] = (usage.byDay[day] || 0) + 1
  if (!usage.firstAt) usage.firstAt = e.time
  saveUsage()
}

// 启动时把日志文件最近 LOG_MAX 行读回内存，这样「日志」页重开 app 也不为空；顺手裁剪文件防膨胀。
async function loadLogsFromFile() {
  try {
    const raw = await fs.readFile(logFile(), 'utf-8')
    const lines = raw.split('\n').filter((l) => l.trim()).slice(-LOG_MAX)
    const parsed = []
    for (const ln of lines) {
      try {
        const o = JSON.parse(ln)
        if (o && o.kind) parsed.push(o)
      } catch {
        // 跳过无法解析的历史行（旧文本格式）
      }
    }
    logs.length = 0
    logs.push(...[...parsed].reverse()) // 文件旧→新；内存要新→旧
    logSeq = logs.reduce((m, e) => Math.max(m, e.id || 0), 0)
    // 裁剪文件到这最近的若干行（保持旧→新顺序）
    await fs
      .writeFile(logFile(), parsed.map((e) => JSON.stringify(e)).join('\n') + (parsed.length ? '\n' : ''), 'utf-8')
      .catch(() => {})
  } catch {
    // 文件不存在/读失败：内存日志保持空
  }
}

// 当前进行中的对话请求控制器（用于「停止生成」）
let activeChatAbort = null

// AI 对话历史：持久化到 userData/rawphotos-chats.json（每个会话含完整 messages）
let chats = []
const CHATS_MAX = 80

function chatsFile() {
  return join(app.getPath('userData'), 'rawphotos-chats.json')
}
// 立即落盘（不再 debounce），避免退出/切换太快时丢失会话
async function saveChatsFile() {
  await fs.writeFile(chatsFile(), JSON.stringify(chats), 'utf-8').catch(() => {})
}
async function loadChats() {
  try {
    const o = JSON.parse(await fs.readFile(chatsFile(), 'utf-8'))
    chats = Array.isArray(o) ? o : Array.isArray(o.conversations) ? o.conversations : []
  } catch {
    chats = []
  }
}

function registerIpc() {
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximizeToggle', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  // X 不直接退出，而是收起到系统托盘（任务栏托盘区），app 继续后台运行
  ipcMain.on('window:close', () => mainWindow?.hide())
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('settings:get', async () => readSettings())
  ipcMain.handle('settings:set', async (_e, patch) => writeSettings(patch))

  // 测试连接：直接对传入的接口配置发起，不依赖「先保存」。
  ipcMain.handle('connection:test', async (_e, provider = {}) => {
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const url = `${baseUrl}/models`
    const t0 = Date.now()
    try {
      if (!baseUrl) throw new Error('请先填写 Base URL')
      let res
      try {
        res = await fetch(url, {
          headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}
        })
      } catch (err) {
        throw new Error(`无法连接 ${baseUrl}（${err.message}）。请确认服务已启动且地址正确。`)
      }
      if (res.status === 401 || res.status === 403) {
        const e = new Error(`鉴权失败（HTTP ${res.status}）。请检查 API Key 是否正确。`)
        e.status = res.status
        throw e
      }
      let models = []
      try {
        const json = JSON.parse(await res.text())
        const arr = json.data || json.models || []
        models = arr.map((m) => m.id || m.name).filter(Boolean)
      } catch {
        // 部分代理 /models 返回非标准结构，连通即可视为成功
      }
      pushLog({ kind: 'test', ok: true, provider: provider.name, url, status: res.status, durationMs: Date.now() - t0, message: `连接成功 · 模型 ${models.length} 个` })
      return { ok: true, status: res.status, models }
    } catch (err) {
      pushLog({ kind: 'test', ok: false, provider: provider.name, url, status: err.status, durationMs: Date.now() - t0, message: err.message })
      throw err
    }
  })

  // 静默拉取模型列表（给设置页下拉自动填充用），不写日志、失败返回空，避免噪音。
  ipcMain.handle('models:list', async (_e, provider = {}) => {
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    if (!baseUrl) return { models: [] }
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}
      })
      const json = JSON.parse(await res.text())
      const arr = json.data || json.models || []
      return { models: arr.map((m) => m.id || m.name).filter(Boolean) }
    } catch {
      return { models: [] }
    }
  })

  ipcMain.handle('image:generate', async (_e, payload = {}) => {
    const settings = await readSettings()
    const provider = activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const model = payload.model || provider.imageModel
    const url = `${baseUrl}/images/generations`
    const t0 = Date.now()
    try {
      if (!baseUrl) throw new Error('未配置接口地址，请在设置中选择或填写当前接口')
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) throw new Error('请输入提示词')
      if (!model) throw new Error('请先为当前接口填写图片模型')

      const body = {
        model,
        prompt,
        n: Math.min(Math.max(parseInt(payload.n, 10) || 1, 1), 10),
        response_format: 'b64_json'
      }
      const size = payload.size || provider.imageSize
      if (size) body.size = size

      const { json } = await requestJson(url, {
        method: 'POST',
        apiKey: provider.apiKey,
        body,
        timeoutMs: 180000
      })
      const images = pickMediaItems(json)
      if (!images.length) throw new Error('接口未返回任何图片数据')
      pushLog({ kind: 'image', ok: true, provider: provider.name, model, url, status: 200, durationMs: Date.now() - t0, message: `成功 ${images.length} 张` })
      return { images, model, prompt }
    } catch (err) {
      pushLog({ kind: 'image', ok: false, provider: provider.name, model, url, status: err.status, durationMs: Date.now() - t0, message: err.message, detail: err.responseText })
      throw err
    }
  })

  // 图生图：带参考图 + 提示词走 /images/edits（multipart）
  ipcMain.handle('image:edit', async (_e, payload = {}) => {
    const settings = await readSettings()
    const provider = activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const model = payload.model || provider.imageModel
    const editPath = normalizeBaseUrl(provider.editPath) || '/images/edits'
    const url = `${baseUrl}${editPath.startsWith('/') ? '' : '/'}${editPath}`
    const t0 = Date.now()
    try {
      if (!baseUrl) throw new Error('未配置接口地址，请在设置中选择或填写当前接口')
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) throw new Error('请输入提示词')
      if (!model) throw new Error('请先为当前接口填写图片模型')
      if (!payload.imageB64) throw new Error('请先选择参考图')

      const buffer = Buffer.from(payload.imageB64, 'base64')
      const name = payload.imageName || 'image.png'
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', prompt)
      form.append('n', String(Math.min(Math.max(parseInt(payload.n, 10) || 1, 1), 10)))
      form.append('response_format', 'b64_json')
      const size = payload.size || provider.imageSize
      if (size) form.append('size', size)
      form.append('image', new Blob([buffer], { type: mimeOf(name) }), name)

      const { json } = await requestMultipart(url, {
        apiKey: provider.apiKey,
        form,
        timeoutMs: 180000
      })
      const images = pickMediaItems(json)
      if (!images.length) throw new Error('接口未返回任何图片数据')
      pushLog({ kind: 'image', ok: true, provider: provider.name, model, url, status: 200, durationMs: Date.now() - t0, message: `图生图成功 ${images.length} 张` })
      return { images, model, prompt }
    } catch (err) {
      pushLog({ kind: 'image', ok: false, provider: provider.name, model, url, status: err.status, durationMs: Date.now() - t0, message: err.message, detail: err.responseText })
      throw err
    }
  })

  // 桌面 AI 对话：转发完整 messages（支持 vision 的 content 数组）到 /chat/completions
  ipcMain.handle('chat:send', async (_e, payload = {}) => {
    const settings = await readSettings()
    const provider =
      (payload.providerId && settings.providers.find((p) => p.id === payload.providerId)) ||
      activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const model = payload.model || provider.optimizeModel
    const url = `${baseUrl}/chat/completions`
    const t0 = Date.now()
    const ctrl = new AbortController()
    activeChatAbort = ctrl
    try {
      if (!baseUrl) throw new Error('未配置接口地址，请在设置中选择或填写当前接口')
      if (!model) throw new Error('请先在对话页选择模型')
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      if (!messages.length) throw new Error('没有消息内容')

      const { json } = await requestJson(url, {
        method: 'POST',
        apiKey: provider.apiKey,
        body: { model, messages, temperature: payload.temperature ?? 0.7 },
        timeoutMs: 120000,
        signal: ctrl.signal
      })
      const content = json?.choices?.[0]?.message?.content
      if (content == null) throw new Error('接口未返回内容')
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((c) => c?.text || '').join('')
            : String(content)
      pushLog({ kind: 'chat', ok: true, provider: provider.name, model, url, status: 200, durationMs: Date.now() - t0, message: '对话成功' })
      return { content: text }
    } catch (err) {
      if (ctrl.userAborted) {
        pushLog({ kind: 'chat', ok: false, provider: provider.name, model, url, durationMs: Date.now() - t0, message: '已停止生成' })
        const e = new Error('已停止生成')
        e.aborted = true
        throw e
      }
      pushLog({ kind: 'chat', ok: false, provider: provider.name, model, url, status: err.status, durationMs: Date.now() - t0, message: err.message, detail: err.responseText })
      throw err
    } finally {
      if (activeChatAbort === ctrl) activeChatAbort = null
    }
  })

  ipcMain.handle('chat:abort', async () => {
    if (activeChatAbort) {
      activeChatAbort.userAborted = true
      activeChatAbort.abort()
    }
    return true
  })

  // 用对话模型（gpt / claude / grok 等 OpenAI 兼容）把提示词扩写得更具体。
  ipcMain.handle('prompt:optimize', async (_e, payload = {}) => {
    const settings = await readSettings()
    const provider = activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const model = provider.optimizeModel
    const url = `${baseUrl}/chat/completions`
    const t0 = Date.now()
    try {
      if (!baseUrl) throw new Error('未配置接口地址，请在设置中选择或填写当前接口')
      const text = String(payload.prompt || '').trim()
      if (!text) throw new Error('请先输入提示词')
      if (!model) {
        throw new Error('请先在设置里为当前接口填写「优化模型」（对话模型，如 gpt-4o-mini / claude-3-5-sonnet / grok-2）')
      }

      const forVideo = payload.mode === 'video'
      const system = forVideo
        ? '你是专业的 AI 视频提示词专家。把用户的简单描述扩写成一段更具体的视频生成提示词：补充画面主体、动作、运镜（推拉摇移/航拍等）、光影氛围、节奏与时间演变，但要忠于用户原意、不要偏题。保持与用户输入相同的语言。只输出最终提示词本身，不要任何解释、前后缀或引号。'
        : '你是专业的 AI 绘画提示词专家。把用户的简单描述扩写成一段更具体、更有画面感的绘画提示词：补充主体细节、风格、光影、色调、构图、镜头与质感，但要忠于用户原意、不要偏题。保持与用户输入相同的语言。只输出最终提示词本身，不要任何解释、前后缀或引号。'

      const { json } = await requestJson(url, {
        method: 'POST',
        apiKey: provider.apiKey,
        body: {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: text }
          ],
          temperature: 0.8
        },
        timeoutMs: 60000
      })
      const out = json?.choices?.[0]?.message?.content
      if (!out || !String(out).trim()) throw new Error('优化失败：接口未返回内容')
      pushLog({ kind: 'optimize', ok: true, provider: provider.name, model, url, status: 200, durationMs: Date.now() - t0, message: '提示词优化成功' })
      return { prompt: String(out).trim() }
    } catch (err) {
      pushLog({ kind: 'optimize', ok: false, provider: provider.name, model, url, status: err.status, durationMs: Date.now() - t0, message: err.message, detail: err.responseText })
      throw err
    }
  })

  ipcMain.handle('video:generate', async (_e, payload = {}) => {
    const settings = await readSettings()
    const provider = activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    const model = payload.model || provider.videoModel
    const path = normalizeBaseUrl(provider.videoPath) || '/videos/generations'
    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
    const t0 = Date.now()
    try {
      if (!baseUrl) throw new Error('未配置接口地址，请在设置中选择或填写当前接口')
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) throw new Error('请输入提示词')
      if (!model) throw new Error('请先为当前接口填写视频模型（设置 → 接口配置）')

      const body = { model, prompt }
      const size = payload.size || provider.videoSize
      if (size) body.size = size
      const seconds = payload.seconds || provider.videoSeconds
      if (seconds) {
        const n = parseInt(seconds, 10)
        if (n) {
          body.seconds = n
          body.duration = n // 不同代理字段名不一，两个都带上更稳
        }
      }

      const { json } = await requestJson(url, {
        method: 'POST',
        apiKey: provider.apiKey,
        body,
        timeoutMs: 600000
      })

      let videos = pickMediaItems(json)
      if (!videos.length) {
        const jobId =
          json.id || json.task_id || json.request_id || json?.data?.id || json?.data?.task_id
        if (!jobId) throw new Error('接口未返回视频数据，也没有可轮询的任务ID')
        videos = await pollVideoJob(baseUrl, provider, jobId)
      }
      if (!videos.length) throw new Error('未获取到视频地址')
      pushLog({ kind: 'video', ok: true, provider: provider.name, model, url, status: 200, durationMs: Date.now() - t0, message: `成功 ${videos.length} 个` })
      return { videos, model, prompt }
    } catch (err) {
      pushLog({ kind: 'video', ok: false, provider: provider.name, model, url, status: err.status, durationMs: Date.now() - t0, message: err.message, detail: err.responseText })
      throw err
    }
  })

  ipcMain.handle('media:save', async (_e, payload = {}) => {
    const settings = await readSettings()
    const dir = settings.saveDir || defaultSaveDir()
    await fs.mkdir(dir, { recursive: true })
    const ext = payload.ext || defaultExt(payload.kind)
    const name = payload.filename || `rawphotos-${Date.now()}.${ext}`
    const filePath = join(dir, name)
    await fs.writeFile(filePath, await toBuffer(payload))
    return { path: filePath, dir }
  })

  ipcMain.handle('media:saveAs', async (_e, payload = {}) => {
    const isVideo = payload.kind === 'video'
    const ext = payload.ext || defaultExt(payload.kind)
    const filters = isVideo
      ? [
          { name: 'MP4 视频', extensions: ['mp4'] },
          { name: 'WebM 视频', extensions: ['webm'] }
        ]
      : [
          { name: 'PNG 图片', extensions: ['png'] },
          { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }
        ]
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.defaultName || `rawphotos-${Date.now()}.${ext}`,
      filters
    })
    if (canceled || !filePath) return { canceled: true }
    await fs.writeFile(filePath, await toBuffer(payload))
    return { canceled: false, path: filePath }
  })

  ipcMain.handle('file:saveText', async (_e, payload = {}) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.defaultName || `export-${Date.now()}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '文本', extensions: ['txt'] }
      ]
    })
    if (canceled || !filePath) return { canceled: true }
    await fs.writeFile(filePath, String(payload.content || ''), 'utf-8')
    return { canceled: false, path: filePath }
  })

  ipcMain.handle('gallery:list', async () => {
    const settings = await readSettings()
    const dir = settings.saveDir || defaultSaveDir()
    try {
      const files = await fs.readdir(dir)
      const media = files.filter((f) => IMAGE_RE.test(f) || VIDEO_RE.test(f))
      const stated = await Promise.all(
        media.map(async (f) => {
          const full = join(dir, f)
          const st = await fs.stat(full)
          return {
            name: f,
            path: full,
            mtime: st.mtimeMs,
            size: st.size,
            kind: VIDEO_RE.test(f) ? 'video' : 'image'
          }
        })
      )
      stated.sort((a, b) => b.mtime - a.mtime)
      const top = stated.slice(0, 120)
      // 图片内联为 dataUrl 直接显示；视频体积大，走 rawmedia:// 协议按需流式播放。
      const items = await Promise.all(
        top.map(async (e) => {
          if (e.kind === 'image') {
            const buf = await fs.readFile(e.path)
            return { ...e, dataUrl: `data:${mimeOf(e.name)};base64,${buf.toString('base64')}` }
          }
          return e
        })
      )
      return { dir, items }
    } catch (err) {
      return { dir, items: [], error: err.message }
    }
  })

  ipcMain.handle('app:pickDir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths.length) return null
    return filePaths[0]
  })

  ipcMain.handle('app:openPath', async (_e, target) => {
    const dir = target || (await readSettings()).saveDir || defaultSaveDir()
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    await shell.openPath(dir)
    return dir
  })

  ipcMain.handle('app:defaultSaveDir', async () => defaultSaveDir())
  ipcMain.handle('app:version', async () => app.getVersion())
  ipcMain.handle('app:notify', async (_e, payload = {}) => {
    try {
      if (Notification.isSupported()) {
        new Notification({ title: payload.title || 'RawPhotos', body: payload.body || '', icon }).show()
      }
    } catch {
      // 忽略通知失败
    }
    return true
  })

  ipcMain.handle('app:openExternal', async (_e, url) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) throw new Error('仅支持 http/https 链接')
    await shell.openExternal(u)
    return true
  })

  ipcMain.handle('logs:get', async () => logs)
  ipcMain.handle('logs:clear', async () => {
    logs.length = 0
    await fs.writeFile(logFile(), '', 'utf-8').catch(() => {})
    return true
  })
  ipcMain.handle('logs:openFile', async () => {
    const f = logFile()
    await fs.appendFile(f, '').catch(() => {})
    await shell.openPath(f)
    return f
  })

  // 查询中转额度（one-api / new-api / OpenAI 风格的 /dashboard/billing 接口）
  ipcMain.handle('quota:get', async (_e, override) => {
    const settings = await readSettings()
    const provider = override && override.baseUrl ? override : activeProvider(settings)
    const baseUrl = normalizeBaseUrl(provider.baseUrl)
    if (!baseUrl) return { error: '未配置接口地址' }
    const headers = provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}
    let total = null
    let used = null
    let remaining = null
    let unit = 'USD'

    // 1) 通用 /usage（很多中转的余额接口：remaining / balance / quota.remaining）
    try {
      const r = await fetch(`${baseUrl}/usage`, { headers })
      if (r.ok) {
        const j = JSON.parse(await r.text())
        const rem = j?.remaining ?? j?.quota?.remaining ?? j?.balance
        if (typeof rem === 'number') remaining = rem
        if (typeof j?.total === 'number') total = j.total
        if (typeof j?.used === 'number') used = j.used
        if (j?.unit || j?.quota?.unit) unit = j.unit || j.quota.unit
      }
    } catch {
      // 忽略
    }

    // 2) OpenAI / one-api 的 billing 接口
    if (remaining == null && total == null) {
      try {
        const r = await fetch(`${baseUrl}/dashboard/billing/subscription`, { headers })
        if (r.ok) {
          const j = JSON.parse(await r.text())
          total =
            typeof j.hard_limit_usd === 'number'
              ? j.hard_limit_usd
              : typeof j.system_hard_limit_usd === 'number'
                ? j.system_hard_limit_usd
                : null
        }
      } catch {
        // 忽略
      }
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 99)
        const fmt = (d) => d.toISOString().slice(0, 10)
        const r = await fetch(
          `${baseUrl}/dashboard/billing/usage?start_date=${fmt(start)}&end_date=${fmt(end)}`,
          { headers }
        )
        if (r.ok) {
          const j = JSON.parse(await r.text())
          if (typeof j.total_usage === 'number') used = j.total_usage / 100
        }
      } catch {
        // 忽略
      }
    }

    // 3) credit_grants 兜底
    if (total == null && used == null && remaining == null) {
      try {
        const r = await fetch(`${baseUrl}/dashboard/billing/credit_grants`, { headers })
        if (r.ok) {
          const j = JSON.parse(await r.text())
          if (typeof j.total_available === 'number') remaining = j.total_available
          if (typeof j.total_granted === 'number') total = j.total_granted
          if (typeof j.total_used === 'number') used = j.total_used
        }
      } catch {
        // 忽略
      }
    }

    if (total == null && used == null && remaining == null) {
      return { error: '该接口未提供额度信息（已试 /usage 与 /dashboard/billing）' }
    }
    if (remaining == null && total != null && used != null) remaining = total - used
    const round = (v) => (v == null ? null : Math.round(v * 100) / 100)
    return { total: round(total), used: round(used), remaining: round(remaining), unit }
  })

  ipcMain.handle('chats:list', async () =>
    chats
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, count: (c.messages || []).length }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  )
  ipcMain.handle('chats:get', async (_e, id) => chats.find((c) => c.id === id) || null)
  ipcMain.handle('chats:save', async (_e, conv) => {
    if (!conv || !conv.id) return null
    const now = Date.now()
    const idx = chats.findIndex((c) => c.id === conv.id)
    const rec = {
      id: conv.id,
      title: conv.title || '新对话',
      messages: Array.isArray(conv.messages) ? conv.messages : [],
      createdAt: idx >= 0 ? chats[idx].createdAt : now,
      updatedAt: now
    }
    if (idx >= 0) chats[idx] = rec
    else chats.unshift(rec)
    if (chats.length > CHATS_MAX) {
      chats = chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CHATS_MAX)
    }
    await saveChatsFile()
    return { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt }
  })
  ipcMain.handle('chats:delete', async (_e, id) => {
    chats = chats.filter((c) => c.id !== id)
    await saveChatsFile()
    return true
  })

  ipcMain.handle('usage:get', async () => usage)
  ipcMain.handle('usage:reset', async () => {
    usage = freshUsage()
    await fs.writeFile(usageFile(), JSON.stringify(usage), 'utf-8').catch(() => {})
    return true
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0d',
    title: 'RawPhotos',
    icon,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  const emitState = () =>
    mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() })
  mainWindow.on('maximize', emitState)
  mainWindow.on('unmaximize', emitState)

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[renderer did-fail-load]', code, desc, url)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', JSON.stringify(details))
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error?.message)
  })
  mainWindow.webContents.on('console-message', (...args) => {
    console.log('[renderer console]', ...args.slice(1))
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.RAWPHOTOS_SHOT) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await mainWindow.webContents.capturePage()
          const out = join(app.getPath('temp'), 'rawphotos-shot.png')
          await fs.writeFile(out, img.toPNG())
          console.log('[shot] saved', out)
        } catch (e) {
          console.error('[shot]', e.message)
        }
      }, 2000)
    })
  }
}

// 本地视频文件不便整段 base64 塞进 DOM，注册一个安全的自定义协议按需流式读取，
// 支持 <video> 的 range 拖动。渲染层用 rawmedia://media/?p=<encodeURIComponent(绝对路径)>。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'rawmedia',
    privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true, bypassCSP: true }
  }
])

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// 系统托盘：X 收起后从这里恢复或退出
function createTray() {
  if (tray) return
  tray = new Tray(icon)
  tray.setToolTip('RawPhotos')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 RawPhotos', click: showMainWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
}

app.whenReady().then(async () => {
  protocol.handle('rawmedia', (request) => {
    try {
      const p = new URL(request.url).searchParams.get('p')
      if (!p) return new Response('missing path', { status: 400 })
      return net.fetch(pathToFileURL(p).toString())
    } catch (err) {
      return new Response(String(err?.message || err), { status: 500 })
    }
  })

  await loadLogsFromFile()
  await loadUsage()
  await loadChats()
  registerIpc()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
