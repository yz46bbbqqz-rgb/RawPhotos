<script setup>
import { ref, computed, onMounted } from 'vue'
import { store, addResults, clearResults, isConfigured, activeProvider, setActiveProvider } from '../store'
import { toast } from '../composables/useToast'
import MediaCard from './MediaCard.vue'
import Lightbox from './Lightbox.vue'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'

const emit = defineEmits(['go-settings'])

const mode = ref('image')
const prompt = ref('')
const count = ref(store.settings.defaultCount || 1)
const model = ref('')
const modelsList = ref([])
const manualModel = ref(false)
const vSize = ref('')
const vSeconds = ref('')
const queue = ref([])
const running = computed(() => queue.value.some((t) => t.status === 'running'))
let processing = false
const optimizing = ref(false)
const zoom = ref({ src: '', kind: 'image' })
const refImage = ref(null)
const fileInput = ref(null)

const countOptions = [1, 2, 3, 4]
const configured = computed(() => isConfigured())
const provider = computed(() => activeProvider())
const providers = computed(() => store.settings.providers || [])
const providerOptions = computed(() =>
  providers.value.map((p) => ({ value: p.id, label: p.name || '未命名接口' }))
)

const activeId = computed({
  get: () => store.settings.activeProviderId,
  set: async (id) => {
    await setActiveProvider(id)
    await loadGenModels()
    autoPickModel()
  }
})

const videoReady = computed(() => Boolean(provider.value && provider.value.videoModel))
const modelPlaceholder = computed(() =>
  mode.value === 'video'
    ? provider.value?.videoModel || '当前接口未设视频模型'
    : provider.value?.imageModel || 'grok-imagine-image'
)

const IMG_RE = /imagine-image|image|flux|dall|sd|stable|diffusion|imagen|seedream|recraft|kolors|playground|kontext|hunyuan|wanx|qwen-image|gpt-image/i
const VID_RE = /imagine-video|video|sora|kling|veo|wan|hailuo|runway|pika|cog|seedance|minimax/i
const modelOptions = computed(() => {
  const re = mode.value === 'video' ? VID_RE : IMG_RE
  let list = modelsList.value.filter((m) => re.test(m))
  const def = mode.value === 'video' ? provider.value?.videoModel : provider.value?.imageModel
  for (const x of [model.value, def]) if (x && !list.includes(x)) list.unshift(x)
  if (!list.length) list = modelsList.value.slice()
  return list.map((m) => ({ value: m, label: m }))
})

async function loadGenModels() {
  const p = provider.value
  if (!p || !p.baseUrl) {
    modelsList.value = []
    return
  }
  try {
    const res = await window.api.listModels({ baseUrl: p.baseUrl, apiKey: p.apiKey })
    modelsList.value = res.models || []
  } catch {
    modelsList.value = []
  }
}
function autoPickModel() {
  const def = mode.value === 'video' ? provider.value?.videoModel : provider.value?.imageModel
  if (def) {
    model.value = def
    return
  }
  const re = mode.value === 'video' ? VID_RE : IMG_RE
  model.value = modelsList.value.find((x) => re.test(x)) || ''
}
onMounted(async () => {
  await loadGenModels()
  autoPickModel()
})

let seed = 0
const nextId = () => `${Date.now()}-${seed++}`

const SAMPLES = {
  image: [
    '赛博朋克雨夜城市街道，霓虹倒影，电影级光效，超高细节',
    '一只穿宇航服的柴犬漂浮在太空，背景是地球，超写实质感',
    '中国水墨山水，云雾缭绕，大量留白，意境悠远',
    '极简主义产品摄影，香水瓶置于大理石台面，柔和侧光'
  ],
  video: [
    '一条穿唐装的中国龙在长城上飞翔，云海翻腾，电影运镜',
    '海浪缓缓拍打金色沙滩，夕阳余晖，慢动作特写',
    '霓虹都市夜景延时，车流如光带穿梭，鸟瞰视角',
    '樱花花瓣随风飘落，阳光穿过花枝，柔焦唯美'
  ]
}
const samplePrompts = computed(() => SAMPLES[mode.value])

function switchMode(m) {
  if (mode.value === m) return
  mode.value = m
  autoPickModel()
}

function useSample(s) {
  prompt.value = s
}

function onPickRef(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result || '')
    refImage.value = { dataUrl, b64: dataUrl.split(',')[1] || '', name: file.name }
  }
  reader.onerror = () => toast.error('读取图片失败')
  reader.readAsDataURL(file)
}

async function optimize() {
  if (!configured.value) {
    toast.error('请先在设置中配置接口地址')
    emit('go-settings')
    return
  }
  const text = prompt.value.trim()
  if (!text) {
    toast.error('请先输入要优化的提示词')
    return
  }
  optimizing.value = true
  try {
    const res = await window.api.optimizePrompt({ prompt: text, mode: mode.value })
    prompt.value = res.prompt
    toast.success('提示词已优化（可按 Ctrl+Z 撤销）')
  } catch (err) {
    toast.error(cleanError(err.message))
  } finally {
    optimizing.value = false
  }
}

function cleanError(msg) {
  return String(msg || '生成失败').replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
}

function enqueue() {
  if (!configured.value) {
    toast.error('请先在设置中配置接口地址')
    emit('go-settings')
    return
  }
  const text = prompt.value.trim()
  if (!text) {
    toast.error('请输入提示词')
    return
  }
  queue.value.push({
    id: nextId(),
    mode: mode.value,
    prompt: text,
    n: count.value,
    model: model.value || undefined,
    size: mode.value === 'video' ? vSize.value || undefined : undefined,
    seconds: mode.value === 'video' ? vSeconds.value || undefined : undefined,
    refImage:
      mode.value === 'image' && refImage.value
        ? { b64: refImage.value.b64, name: refImage.value.name }
        : null,
    status: 'pending'
  })
  prompt.value = ''
  if (mode.value === 'image') refImage.value = null
  runQueue()
}

async function runTask(task) {
  if (task.mode === 'video') {
    const res = await window.api.generateVideo({
      prompt: task.prompt,
      model: task.model,
      size: task.size,
      seconds: task.seconds
    })
    addResults(
      res.videos.map((v) => ({
        id: nextId(),
        kind: 'video',
        b64: v.b64,
        url: v.url,
        prompt: task.prompt,
        model: res.model,
        time: Date.now(),
        saved: false
      }))
    )
    toast.success(`视频生成成功，共 ${res.videos.length} 个`)
  } else {
    const res = task.refImage
      ? await window.api.editImage({
          prompt: task.prompt,
          n: task.n,
          model: task.model,
          imageB64: task.refImage.b64,
          imageName: task.refImage.name
        })
      : await window.api.generateImage({ prompt: task.prompt, n: task.n, model: task.model })
    addResults(
      res.images.map((im) => ({
        id: nextId(),
        kind: 'image',
        b64: im.b64,
        url: im.url,
        revisedPrompt: im.revisedPrompt,
        prompt: task.prompt,
        model: res.model,
        time: Date.now(),
        saved: false
      }))
    )
    toast.success(`${task.refImage ? '图生图' : '生成'}成功，共 ${res.images.length} 张`)
  }
}

async function runQueue() {
  if (processing) return
  processing = true
  try {
    while (true) {
      const task = queue.value.find((t) => t.status === 'pending')
      if (!task) break
      task.status = 'running'
      try {
        await runTask(task)
        const i = queue.value.findIndex((t) => t.id === task.id)
        if (i >= 0) queue.value.splice(i, 1)
      } catch (err) {
        task.status = 'error'
        task.error = cleanError(err.message)
        toast.error(task.error)
      }
    }
  } finally {
    processing = false
  }
}

function removeTask(id) {
  const i = queue.value.findIndex((t) => t.id === id)
  if (i >= 0 && queue.value[i].status !== 'running') queue.value.splice(i, 1)
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') enqueue()
}
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>{{ mode === 'video' ? '文生视频' : '文生图' }}</h1>
        <p class="sub">{{ mode === 'video' ? '输入提示词，让 AI 生成动态视频' : '输入提示词，让 AI 为你绘制图像' }}</p>
      </div>
      <div class="head-right">
        <div class="provider-pick" v-if="providers.length">
          <Icon name="plug" :size="13" />
          <Dropdown v-model="activeId" :options="providerOptions" size="sm" placeholder="选择接口" class="provider-dd" />
        </div>
        <span class="badge"><Icon name="image" :size="13" /> 本次 {{ store.results.length }} 项</span>
      </div>
    </header>

    <div class="scroll">
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'image' }" @click="switchMode('image')">
          <Icon name="image" :size="15" /><span>图片</span>
        </button>
        <button class="mode-tab" :class="{ active: mode === 'video' }" @click="switchMode('video')">
          <Icon name="film" :size="15" /><span>视频</span>
        </button>
      </div>

      <div class="composer card">
        <div class="prompt-wrap">
          <textarea
            v-model="prompt"
            class="textarea prompt-input"
            rows="4"
            :disabled="optimizing"
            :placeholder="mode === 'video'
              ? '描述你想要的视频画面与运镜，例如：一条龙在长城上飞翔，云海翻腾，电影级运镜…'
              : '描述你想要的画面，越具体越好。例如：黄昏海边的灯塔，暖色调，35mm 胶片质感，柔和逆光…'"
            @keydown="onKeydown"
          ></textarea>
          <div v-if="optimizing" class="opt-overlay">
            <span class="spin"></span>
            <span>AI 正在优化提示词，请稍候…</span>
          </div>
        </div>

        <div v-if="mode === 'image'" class="ref-row">
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onPickRef" />
          <template v-if="refImage">
            <div class="ref-thumb">
              <img :src="refImage.dataUrl" alt="参考图" />
              <button class="ref-x" title="移除参考图" @click="refImage = null">
                <Icon name="win-close" :size="11" />
              </button>
            </div>
            <div class="ref-meta">
              <span class="ref-tag">图生图</span>
              <span class="ref-name" :title="refImage.name">{{ refImage.name }}</span>
            </div>
          </template>
          <button v-else class="ref-add" @click="fileInput && fileInput.click()">
            <Icon name="image" :size="15" /><span>＋ 参考图（图生图，可选）</span>
          </button>
        </div>

        <div class="prompt-tools">
          <div class="samples">
            <button v-for="s in samplePrompts" :key="s" class="chip" @click="useSample(s)">
              {{ s.slice(0, 12) }}…
            </button>
          </div>
          <button class="opt-btn" :disabled="optimizing || !prompt.trim()" @click="optimize">
            <span v-if="optimizing" class="spin spin-sm"></span>
            <Icon v-else name="sparkle" :size="14" />
            <span>{{ optimizing ? '优化中…' : 'AI 优化' }}</span>
          </button>
        </div>

        <div class="composer-bar">
          <div v-if="mode === 'image'" class="ctl-group">
            <span class="ctl-label">数量</span>
            <div class="count-group">
              <button
                v-for="c in countOptions"
                :key="c"
                class="count-btn"
                :class="{ active: count === c }"
                @click="count = c"
              >
                {{ c }}
              </button>
            </div>
          </div>

          <template v-else>
            <div class="ctl-group">
              <span class="ctl-label">尺寸</span>
              <input
                v-model="vSize"
                class="input mini-input"
                :placeholder="provider?.videoSize || '1280x720'"
                spellcheck="false"
              />
            </div>
            <div class="ctl-group">
              <span class="ctl-label">时长</span>
              <input
                v-model="vSeconds"
                class="input secs-input"
                :placeholder="provider?.videoSeconds || '秒'"
                spellcheck="false"
              />
            </div>
          </template>

          <div class="ctl-group model-group">
            <span class="ctl-label">模型</span>
            <input
              v-if="manualModel"
              v-model="model"
              class="input model-input"
              :placeholder="modelPlaceholder"
            />
            <div v-else class="model-dd-wrap">
              <Dropdown v-model="model" :options="modelOptions" size="sm" placeholder="选择模型" />
            </div>
            <button type="button" class="mini-toggle" @click="manualModel = !manualModel">
              {{ manualModel ? '列表' : '手动' }}
            </button>
          </div>

          <div class="bar-right">
            <span class="kbd">Ctrl ↵</span>
            <button class="btn btn-primary generate-btn" :disabled="optimizing || !prompt.trim()" @click="enqueue">
              <Icon :name="mode === 'video' ? 'film' : 'sparkle'" :size="16" />
              <span>{{ running || queue.length ? '加入队列' : mode === 'video' ? '生成视频' : '生成图像' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!configured" class="notice">
        <Icon name="alert" :size="16" />
        <span>还没有配置接口。请先到设置页添加接口地址与 API Key。</span>
        <button class="btn btn-sm" @click="emit('go-settings')">去设置</button>
      </div>
      <div v-else-if="mode === 'video' && !videoReady" class="notice">
        <Icon name="alert" :size="16" />
        <span>当前接口「{{ provider?.name }}」还没填视频模型，出片会失败。可在设置里补上，或临时在上方「模型」框填入。</span>
        <button class="btn btn-sm" @click="emit('go-settings')">去设置</button>
      </div>

      <div v-if="queue.length" class="queue">
        <div class="queue-head"><Icon name="logs" :size="14" /> 队列 · {{ queue.length }}</div>
        <div class="queue-items">
          <div v-for="t in queue" :key="t.id" class="q-item" :class="t.status">
            <span class="q-ic">
              <span v-if="t.status === 'running'" class="spin spin-sm"></span>
              <Icon v-else-if="t.status === 'error'" name="alert" :size="14" />
              <Icon v-else :name="t.mode === 'video' ? 'film' : 'image'" :size="14" />
            </span>
            <span class="q-prompt" :title="t.prompt">{{ t.prompt }}</span>
            <span class="q-tag">{{ t.status === 'running' ? '生成中' : t.status === 'error' ? '失败' : '排队中' }}</span>
            <button v-if="t.status !== 'running'" class="q-x" title="移除" @click="removeTask(t.id)">
              <Icon name="win-close" :size="11" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="running" class="skeleton-grid">
        <div v-for="n in (mode === 'video' ? 1 : count)" :key="n" class="skeleton"></div>
      </div>

      <div v-if="store.results.length" class="results">
        <div class="results-head">
          <h2>生成结果 <span class="rc">{{ store.results.length }}</span></h2>
          <button class="btn btn-sm btn-ghost" @click="clearResults">
            <Icon name="trash" :size="14" /><span>清空</span>
          </button>
        </div>
        <div class="grid">
          <MediaCard v-for="item in store.results" :key="item.id" :item="item" @zoom="zoom = $event" />
        </div>
      </div>

      <div v-else-if="!running" class="empty">
        <div class="empty-art"><Icon :name="mode === 'video' ? 'film' : 'image'" :size="34" /></div>
        <p class="empty-title">还没有作品</p>
        <p class="empty-sub">在上方输入提示词，点击「{{ mode === 'video' ? '生成视频' : '生成图像' }}」开始创作</p>
      </div>
    </div>

    <Lightbox :src="zoom.src" :kind="zoom.kind" @close="zoom = { src: '', kind: 'image' }" />
  </div>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.view-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 30px 18px;
  border-bottom: 1px solid var(--border);
}
.head-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.provider-pick {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-3);
}
.provider-dd {
  width: 190px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px 30px 40px;
}
.mode-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
}
.mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 16px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.14s ease, color 0.14s ease;
}
.mode-tab:hover {
  color: var(--text);
}
.mode-tab.active {
  background: var(--accent);
  color: #fff;
}

.composer {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.prompt-wrap {
  position: relative;
}
.prompt-input {
  border: none;
  background: transparent;
  padding: 4px 4px 0;
  font-size: 15px;
  resize: none;
  min-height: 88px;
}
.prompt-input:focus {
  box-shadow: none;
  background: transparent;
}
.prompt-input:disabled {
  opacity: 0.5;
}
.opt-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  backdrop-filter: blur(2px);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
.prompt-tools {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.ref-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ref-add {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-2);
  background: var(--bg-1);
  border: 1px dashed var(--border-2);
  transition: color 0.14s ease, border-color 0.14s ease;
}
.ref-add:hover {
  color: var(--accent);
  border-color: var(--accent-line);
}
.ref-thumb {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}
.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.ref-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  border: 1.5px solid var(--surface);
}
.ref-x:hover {
  background: var(--danger);
}
.ref-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ref-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.ref-name {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  flex: 1;
  min-width: 0;
}
.opt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  transition: background 0.14s ease, opacity 0.14s ease;
}
.opt-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}
.opt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spin-sm {
  width: 13px;
  height: 13px;
  border-width: 2px;
}
.composer-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  row-gap: 12px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.ctl-group {
  display: flex;
  align-items: center;
  gap: 9px;
}
.ctl-label {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 550;
  white-space: nowrap;
  flex-shrink: 0;
}
.count-group {
  display: flex;
  gap: 4px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
}
.count-btn {
  width: 32px;
  height: 28px;
  border-radius: 6px;
  color: var(--text-2);
  font-weight: 600;
  font-size: 13px;
  transition: background 0.14s ease, color 0.14s ease;
}
.count-btn.active {
  background: var(--accent);
  color: #fff;
}
.model-group {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}
.model-input {
  height: 34px;
}
.model-dd-wrap {
  flex: 1;
  min-width: 0;
}
.mini-toggle {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 550;
  color: var(--accent);
  padding: 4px 6px;
  border-radius: 6px;
}
.mini-toggle:hover {
  background: var(--accent-soft);
}
.mini-input {
  height: 34px;
  width: 116px;
}
.secs-input {
  height: 34px;
  width: 66px;
}
.bar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.kbd {
  font-size: 11px;
  color: var(--text-3);
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-1);
}
.generate-btn {
  height: 38px;
  min-width: 130px;
  font-size: 13.5px;
}

.notice {
  margin-top: 16px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #f5c264;
  border: 1px solid rgba(245, 166, 35, 0.25);
  background: rgba(245, 166, 35, 0.07);
  border-radius: var(--radius);
}
.notice .btn {
  margin-left: auto;
  flex-shrink: 0;
}

.results {
  margin-top: 26px;
}
.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 14px;
}
.results-head h2 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text-2);
}
.rc {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  margin-left: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
}
.grid,
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}
.queue {
  margin-top: 20px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.queue-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 10px;
}
.queue-items {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.q-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 11px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
}
.q-item.running {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}
.q-item.error {
  border-color: rgba(225, 29, 72, 0.35);
}
.q-ic {
  width: 18px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: var(--accent);
}
.q-item.error .q-ic {
  color: var(--danger);
}
.q-prompt {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.q-tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}
.q-item.running .q-tag {
  color: var(--accent);
}
.q-item.error .q-tag {
  color: var(--danger);
}
.q-x {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--text-3);
}
.q-x:hover {
  background: var(--surface-2);
  color: var(--danger);
}
.skeleton-grid {
  margin-top: 26px;
}
.skeleton {
  aspect-ratio: 1 / 1;
  border-radius: var(--radius);
  background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.empty {
  margin-top: 64px;
  text-align: center;
  color: var(--text-3);
}
.empty-art {
  width: 72px;
  height: 72px;
  margin: 0 auto;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--accent);
}
.empty-title {
  font-size: 15px;
  color: var(--text-2);
  margin: 16px 0 4px;
  font-weight: 600;
}
.empty-sub {
  font-size: 12.5px;
  margin: 0;
}
</style>
