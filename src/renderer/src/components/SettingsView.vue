<script setup>
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { store, persistSettings, setTheme, setCustomColor, applyTheme, THEMES } from '../store'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'

const countOptions = [
  { value: 1, label: '1 张' },
  { value: 2, label: '2 张' },
  { value: 3, label: '3 张' },
  { value: 4, label: '4 张' }
]

const sizeOptions = [
  { value: '', label: '（默认 / 不指定）' },
  { value: '1024x1024', label: '1024 × 1024（方）' },
  { value: '1024x1792', label: '1024 × 1792（竖）' },
  { value: '1792x1024', label: '1792 × 1024（横）' },
  { value: '768x768', label: '768 × 768' },
  { value: '512x512', label: '512 × 512' },
  { value: '1280x720', label: '1280 × 720' },
  { value: '720x1280', label: '720 × 1280' }
]

const PRESET_COLORS = ['#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6']

function previewColor(e) {
  store.settings.customColor = e.target.value
  applyTheme('custom')
}
function commitColor() {
  setCustomColor(store.settings.customColor)
}
function pickPreset(c) {
  store.settings.customColor = c
  setCustomColor(c)
}

const currentTheme = computed(() => store.settings.theme || 'dark')
const providerModels = ref([])
const modelsLoading = ref(false)
const manual = reactive({ imageModel: false, videoModel: false, optimizeModel: false })

function blankProvider() {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '新接口',
    baseUrl: '',
    apiKey: '',
    imageModel: '',
    videoModel: '',
    optimizeModel: '',
    imageSize: '',
    videoSize: '',
    videoSeconds: '',
    editPath: '/images/edits',
    videoPath: '/videos/generations',
    videoPollPath: ''
  }
}

const form = reactive({
  providers: [],
  activeProviderId: '',
  defaultCount: 1,
  saveDir: '',
  alertEnabled: false,
  alertThreshold: 5
})
const selectedId = ref('')
const showKey = ref(false)
const showAdvanced = ref(false)
const testing = ref(false)
const saving = ref(false)
const testResult = ref(null)

const selected = computed(() => form.providers.find((p) => p.id === selectedId.value) || null)

// 把当前已选值并入下拉选项（即使它不在 /models 列表里，如手动填的 flux 也能保留显示）
function optionsFor(current) {
  const list = providerModels.value
  if (current && !list.includes(current)) return [current, ...list]
  return list
}

const imageOptions = computed(() => [
  { value: '', label: '（未选择）' },
  ...optionsFor(selected.value?.imageModel)
])
const videoOptions = computed(() => [
  { value: '', label: '（不支持出片 / 未选择）' },
  ...optionsFor(selected.value?.videoModel)
])
const optimizeOptions = computed(() => [
  { value: '', label: '（未选择，留空则不可用）' },
  ...optionsFor(selected.value?.optimizeModel)
])

// 进入/切换接口时静默拉取该接口的模型列表，填充下拉。失败不打扰（留空 + 可手动输入）。
async function loadModels() {
  const p = selected.value
  providerModels.value = []
  if (!p || !p.baseUrl) return
  modelsLoading.value = true
  try {
    const res = await window.api.listModels({ baseUrl: p.baseUrl, apiKey: p.apiKey })
    providerModels.value = res.models || []
  } catch {
    providerModels.value = []
  } finally {
    modelsLoading.value = false
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

function hydrate() {
  const s = store.settings
  form.providers = clone(s.providers || [])
  form.activeProviderId = s.activeProviderId || form.providers[0]?.id || ''
  form.defaultCount = s.defaultCount || 1
  form.saveDir = s.saveDir || ''
  form.alertEnabled = !!s.alertEnabled
  form.alertThreshold = s.alertThreshold ?? 5
  if (!form.providers.some((p) => p.id === selectedId.value)) {
    selectedId.value = form.activeProviderId || form.providers[0]?.id || ''
  }
}

onMounted(() => {
  hydrate()
  loadModels()
})

watch(selectedId, () => {
  manual.imageModel = false
  manual.videoModel = false
  manual.optimizeModel = false
  loadModels()
})

function cleanError(msg) {
  return String(msg || '操作失败').replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
}

function addProvider() {
  const p = blankProvider()
  form.providers.push(p)
  selectedId.value = p.id
  testResult.value = null
}

function removeProvider(id) {
  if (form.providers.length <= 1) {
    toast.error('至少保留一个接口')
    return
  }
  const idx = form.providers.findIndex((p) => p.id === id)
  if (idx === -1) return
  form.providers.splice(idx, 1)
  if (form.activeProviderId === id) form.activeProviderId = form.providers[0].id
  if (selectedId.value === id) selectedId.value = form.providers[0].id
  testResult.value = null
}

function selectProvider(id) {
  selectedId.value = id
  testResult.value = null
}

async function setActive(id) {
  form.activeProviderId = id
  // 立即持久化（含当前接口列表），不必再点「保存设置」
  saving.value = true
  try {
    await persistSettings({
      providers: clone(form.providers),
      activeProviderId: id,
      defaultCount: form.defaultCount,
      saveDir: form.saveDir
    })
    hydrate()
    toast.success('已设为当前接口')
  } catch (err) {
    toast.error(`设置失败：${err.message}`)
  } finally {
    saving.value = false
  }
}

async function save() {
  for (const p of form.providers) {
    if (!String(p.name || '').trim()) p.name = '未命名接口'
  }
  saving.value = true
  try {
    await persistSettings({
      providers: clone(form.providers),
      activeProviderId: form.activeProviderId,
      defaultCount: form.defaultCount,
      saveDir: form.saveDir,
      alertEnabled: form.alertEnabled,
      alertThreshold: Number(form.alertThreshold) || 0
    })
    hydrate()
    toast.success('设置已保存')
  } catch (err) {
    toast.error(`保存失败：${err.message}`)
  } finally {
    saving.value = false
  }
}

async function test() {
  if (!selected.value) return
  testing.value = true
  testResult.value = null
  try {
    const res = await window.api.testConnection({
      baseUrl: selected.value.baseUrl,
      apiKey: selected.value.apiKey
    })
    testResult.value = { ok: true, models: res.models || [], status: res.status }
    providerModels.value = res.models || []
    toast.success('连接成功')
  } catch (err) {
    testResult.value = { ok: false, message: cleanError(err.message) }
    toast.error('连接失败')
  } finally {
    testing.value = false
  }
}

async function copyModel(m) {
  try {
    await navigator.clipboard.writeText(m)
    toast.success(`已复制：${m}`)
  } catch {
    toast.error('复制失败')
  }
}

async function pickDir() {
  const dir = await window.api.pickDir()
  if (dir) form.saveDir = dir
}

async function openDir() {
  const dir = await window.api.openPath(form.saveDir || '')
  toast.info(`已打开 ${dir}`)
}
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>设置</h1>
        <p class="sub">管理多个接口（OpenAI 兼容），随时切换出图 / 出片</p>
      </div>
      <button class="btn btn-primary save-top" :disabled="saving" @click="save">
        <span v-if="saving" class="spin"></span>
        <Icon v-else name="check" :size="15" />
        <span>保存设置</span>
      </button>
    </header>

    <div class="scroll">
      <section class="card block">
        <div class="block-head">
          <Icon name="plug" :size="16" />
          <h2>接口配置</h2>
          <button class="btn btn-sm add-btn" @click="addProvider">
            <Icon name="plus" :size="15" /><span>新增接口</span>
          </button>
        </div>

        <div class="provider-list">
          <button
            v-for="p in form.providers"
            :key="p.id"
            class="provider-item"
            :class="{ selected: p.id === selectedId }"
            @click="selectProvider(p.id)"
          >
            <span
              class="pick-active"
              :class="{ on: p.id === form.activeProviderId }"
              title="设为当前使用"
              @click.stop="setActive(p.id)"
            >
              <Icon v-if="p.id === form.activeProviderId" name="check" :size="12" />
            </span>
            <span class="p-main">
              <span class="p-name">{{ p.name || '未命名接口' }}</span>
              <span class="p-url">{{ p.baseUrl || '未填写地址' }}</span>
            </span>
            <span class="p-tags">
              <span v-if="p.imageModel" class="p-tag"><Icon name="image" :size="11" />{{ p.imageModel }}</span>
              <span v-if="p.videoModel" class="p-tag"><Icon name="film" :size="11" />{{ p.videoModel }}</span>
              <span v-if="p.id === form.activeProviderId" class="p-tag cur">当前</span>
            </span>
          </button>
        </div>

        <div v-if="selected" class="editor">
          <div class="grid-2">
            <div class="field">
              <label>接口名称</label>
              <input v-model="selected.name" class="input" placeholder="例如：本地代理 / apimf" spellcheck="false" />
            </div>
            <div class="field">
              <label>Base URL（以 /v1 结尾）</label>
              <input v-model="selected.baseUrl" class="input" placeholder="https://kiro.apimf.top/v1" spellcheck="false" />
            </div>
          </div>

          <div class="field">
            <label>API Key</label>
            <div class="key-row">
              <input
                v-model="selected.apiKey"
                :type="showKey ? 'text' : 'password'"
                class="input"
                placeholder="sk-...（未设鉴权可留空）"
                spellcheck="false"
              />
              <button class="btn btn-ghost btn-icon" :title="showKey ? '隐藏' : '显示'" @click="showKey = !showKey">
                <Icon :name="showKey ? 'eye-off' : 'eye'" :size="16" />
              </button>
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label class="label-row">
                <span class="lbl"><Icon name="image" :size="13" /> 图片模型</span>
                <button type="button" class="mini-link" @click="manual.imageModel = !manual.imageModel">
                  {{ manual.imageModel ? '从列表选' : '手动输入' }}
                </button>
              </label>
              <input
                v-if="manual.imageModel"
                v-model="selected.imageModel"
                class="input"
                placeholder="手动输入模型名，如 flux"
                spellcheck="false"
              />
              <Dropdown v-else v-model="selected.imageModel" :options="imageOptions" placeholder="（未选择）" />
            </div>
            <div class="field">
              <label class="label-row">
                <span class="lbl"><Icon name="film" :size="13" /> 视频模型</span>
                <button type="button" class="mini-link" @click="manual.videoModel = !manual.videoModel">
                  {{ manual.videoModel ? '从列表选' : '手动输入' }}
                </button>
              </label>
              <input
                v-if="manual.videoModel"
                v-model="selected.videoModel"
                class="input"
                placeholder="手动输入；留空则不支持出片"
                spellcheck="false"
              />
              <Dropdown v-else v-model="selected.videoModel" :options="videoOptions" placeholder="（不支持出片 / 未选择）" />
            </div>
          </div>

          <div class="field">
            <label class="label-row">
              <span class="lbl"><Icon name="sparkle" :size="13" /> 优化模型（对话模型，用于「AI 优化提示词」）</span>
              <button type="button" class="mini-link" @click="manual.optimizeModel = !manual.optimizeModel">
                {{ manual.optimizeModel ? '从列表选' : '手动输入' }}
              </button>
            </label>
            <input
              v-if="manual.optimizeModel"
              v-model="selected.optimizeModel"
              class="input"
              placeholder="gpt-4o-mini / claude-3-5-sonnet / grok-3-mini 等"
              spellcheck="false"
            />
            <Dropdown v-else v-model="selected.optimizeModel" :options="optimizeOptions" placeholder="（未选择）" />
            <span class="hint">
              <template v-if="modelsLoading">正在加载模型列表…</template>
              <template v-else-if="providerModels.length">已加载 {{ providerModels.length }} 个模型，直接下拉选择（GPT / Claude / Grok 都兼容）。</template>
              <template v-else>未取到模型列表，可点「测试连接」加载，或「手动输入」。</template>
            </span>
          </div>

          <div class="grid-2">
            <div class="field">
              <label>图片尺寸（可选）</label>
              <Dropdown v-model="selected.imageSize" :options="sizeOptions" placeholder="（默认 / 不指定）" />
            </div>
            <div class="field">
              <label>视频尺寸 / 时长（可选）</label>
              <div class="key-row">
                <input v-model="selected.videoSize" class="input" placeholder="1280x720" spellcheck="false" />
                <input v-model="selected.videoSeconds" class="input secs" placeholder="秒" spellcheck="false" />
              </div>
            </div>
          </div>

          <button class="adv-toggle" @click="showAdvanced = !showAdvanced">
            <Icon :name="showAdvanced ? 'eye-off' : 'eye'" :size="13" />
            <span>{{ showAdvanced ? '收起高级' : '高级：自定义接口路径（图生图 / 出片）' }}</span>
          </button>
          <div v-if="showAdvanced" class="grid-2 adv">
            <div class="field">
              <label>图生图接口路径</label>
              <input v-model="selected.editPath" class="input" placeholder="/images/edits" spellcheck="false" />
              <span class="hint">OpenAI / Grok 等多为 <code>/images/edits</code>，按平台改。</span>
            </div>
            <div class="field">
              <label>出片接口路径</label>
              <input v-model="selected.videoPath" class="input" placeholder="/videos/generations" spellcheck="false" />
              <span class="hint">相对 Base URL，多数代理默认即可。</span>
            </div>
            <div class="field">
              <label>异步轮询路径（可选）</label>
              <input v-model="selected.videoPollPath" class="input" placeholder="/videos/generations/{id}" spellcheck="false" />
              <span class="hint">异步出片时用 <code>{id}</code> 占位任务ID；留空自动推导。</span>
            </div>
          </div>

          <div class="editor-actions">
            <button class="btn" :disabled="testing" @click="test">
              <span v-if="testing" class="spin"></span>
              <Icon v-else name="plug" :size="15" />
              <span>测试连接</span>
            </button>
            <button
              class="btn"
              :disabled="selected.id === form.activeProviderId"
              @click="setActive(selected.id)"
            >
              <Icon name="check" :size="15" />
              <span>{{ selected.id === form.activeProviderId ? '当前接口' : '设为当前' }}</span>
            </button>
            <button class="btn btn-danger-ghost" @click="removeProvider(selected.id)">
              <Icon name="trash" :size="15" />
              <span>删除</span>
            </button>
            <Transition name="fade">
              <span v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'bad'">
                <Icon :name="testResult.ok ? 'check' : 'alert'" :size="14" />
                <template v-if="testResult.ok">
                  连接成功（HTTP {{ testResult.status }}）<template v-if="testResult.models.length">
                    · 模型 {{ testResult.models.length }} 个</template>
                </template>
                <template v-else>{{ testResult.message }}</template>
              </span>
            </Transition>
          </div>

          <div v-if="testResult?.ok && testResult.models.length" class="model-list">
            <span class="hint">点击模型名即可复制，再粘贴到上方对应的模型框：</span>
            <div class="model-chips">
              <button
                v-for="m in testResult.models.slice(0, 60)"
                :key="m"
                class="chip"
                title="点击复制模型名"
                @click="copyModel(m)"
              >
                {{ m }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="card block">
        <div class="block-head">
          <Icon name="palette" :size="16" />
          <h2>外观主题</h2>
        </div>
        <div class="theme-grid">
          <button
            v-for="t in THEMES"
            :key="t.id"
            class="theme-card"
            :class="{ active: currentTheme === t.id }"
            @click="setTheme(t.id)"
          >
            <span class="tc-preview" :style="{ background: t.bg }">
              <span class="tc-bar" :style="{ background: t.accent }"></span>
            </span>
            <span class="tc-label">{{ t.label }}</span>
            <Icon v-if="currentTheme === t.id" name="check" :size="14" class="tc-check" />
          </button>

          <button class="theme-card" :class="{ active: currentTheme === 'custom' }" @click="setTheme('custom')">
            <span class="tc-preview" style="background: #f4f5f7">
              <span class="tc-bar" :style="{ background: store.settings.customColor || '#10b981' }"></span>
            </span>
            <span class="tc-label">自定义</span>
            <Icon v-if="currentTheme === 'custom'" name="check" :size="14" class="tc-check" />
          </button>
        </div>

        <div v-if="currentTheme === 'custom'" class="custom-color">
          <div class="cc-row">
            <span class="cc-label">主题色</span>
            <input
              type="color"
              class="color-input"
              :value="store.settings.customColor || '#10b981'"
              @input="previewColor"
              @change="commitColor"
            />
            <span class="cc-hex">{{ store.settings.customColor || '#10b981' }}</span>
          </div>
          <div class="cc-swatches">
            <button
              v-for="c in PRESET_COLORS"
              :key="c"
              class="cc-swatch"
              :style="{ background: c }"
              :title="c"
              @click="pickPreset(c)"
            ></button>
          </div>
        </div>
      </section>

      <section class="card block">
        <div class="block-head">
          <Icon name="settings" :size="16" />
          <h2>通用设置</h2>
        </div>
        <div class="grid-2">
          <div class="field">
            <label>默认出图数量</label>
            <Dropdown v-model="form.defaultCount" :options="countOptions" placeholder="选择数量" />
            <span class="hint">「图片」模式每次生成的张数（视频固定 1 个）。</span>
          </div>
          <div class="field">
            <label>图片 / 视频保存目录</label>
            <div class="key-row">
              <input v-model="form.saveDir" class="input" placeholder="留空则保存到 图片/RawPhotos" spellcheck="false" />
              <button class="btn btn-ghost" @click="pickDir">选择</button>
              <button class="btn btn-ghost btn-icon" title="打开目录" @click="openDir">
                <Icon name="folder-open" :size="16" />
              </button>
            </div>
            <span class="hint">保存与画廊都使用这个目录。</span>
          </div>
        </div>
      </section>

      <section class="card block">
        <div class="block-head">
          <Icon name="alert" :size="16" />
          <h2>额度预警</h2>
        </div>
        <label class="switch-row">
          <input type="checkbox" v-model="form.alertEnabled" />
          <span>开启低额度提醒</span>
        </label>
        <div v-if="form.alertEnabled" class="field">
          <label>当剩余额度低于（{{ '美元' }}）时提醒</label>
          <input v-model.number="form.alertThreshold" type="number" min="0" step="1" class="input thresh" />
          <span class="hint">每 60 秒检查一次当前接口余额，跌破阈值时弹提示 + 系统通知（最小化到托盘也能收到）。需中转支持额度查询。</span>
        </div>
      </section>

    </div>
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
.save-top {
  height: 36px;
  min-width: 116px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 22px 40px 40px;
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
}
.block {
  padding: 18px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--accent);
}
.block-head h2 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
}
.add-btn {
  margin-left: auto;
  color: var(--text);
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.provider-item:hover {
  border-color: var(--border-2);
}
.provider-item.selected {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}
.pick-active {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--border-2);
  display: grid;
  place-items: center;
  color: #fff;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.pick-active.on {
  background: var(--success);
  border-color: var(--success);
}
.p-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.p-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.p-url {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.p-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: 999px;
}
.p-tag.cur {
  color: var(--success);
  border-color: rgba(56, 199, 147, 0.4);
  background: rgba(56, 199, 147, 0.1);
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.field > label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  font-weight: 550;
}
.label-row {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.lbl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mini-link {
  font-size: 11.5px;
  font-weight: 550;
  color: var(--accent);
  padding: 2px 4px;
  border-radius: 5px;
}
.mini-link:hover {
  background: var(--accent-soft);
}
.key-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.key-row .input {
  flex: 1;
}
.secs {
  max-width: 76px;
  flex: 0 0 auto;
}
.adv-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  font-size: 12px;
  color: var(--text-3);
  padding: 4px 0;
}
.adv-toggle:hover {
  color: var(--text);
}
.adv {
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
}
.editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-danger-ghost {
  color: var(--danger);
}
.btn-danger-ghost:hover {
  background: rgba(240, 82, 106, 0.1);
  border-color: rgba(240, 82, 106, 0.4);
}
.test-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 550;
}
.test-result.ok {
  color: var(--success);
}
.test-result.bad {
  color: var(--danger);
}
.model-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
code {
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 12px;
  color: #8ab4ff;
  font-family: 'Cascadia Code', Consolas, monospace;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
  text-align: left;
  transition: border-color 0.14s ease, transform 0.1s ease;
}
.theme-card:hover {
  border-color: var(--border-2);
  transform: translateY(-2px);
}
.theme-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.tc-preview {
  height: 46px;
  border-radius: 7px;
  border: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  padding: 7px;
}
.tc-bar {
  width: 60%;
  height: 8px;
  border-radius: 999px;
}
.tc-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.tc-check {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--accent);
}
.custom-color {
  margin-top: 14px;
  padding: 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cc-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cc-label {
  font-size: 12.5px;
  color: var(--text-2);
  font-weight: 550;
}
.color-input {
  width: 46px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border-2);
  border-radius: 7px;
  background: none;
  cursor: pointer;
}
.color-input::-webkit-color-swatch-wrapper {
  padding: 3px;
}
.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.cc-hex {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12.5px;
  color: var(--text-2);
  text-transform: uppercase;
}
.cc-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cc-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border-2);
  transition: transform 0.12s ease;
}
.cc-swatch:hover {
  transform: scale(1.12);
}
.hint {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.55;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}
.switch-row input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}
.thresh {
  max-width: 160px;
}
/* 底部保存条已移除，统一用右上角「保存设置」 */
</style>
