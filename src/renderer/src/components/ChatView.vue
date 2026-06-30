<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import { store, persistSettings, activeProvider } from '../store'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'
import Dropdown from './Dropdown.vue'

marked.setOptions({ breaks: true, gfm: true })

function sanitizeHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}
function mdToHtml(text) {
  try {
    return sanitizeHtml(marked.parse(text || ''))
  } catch {
    return String(text || '')
  }
}
function onMsgClick(e) {
  const a = e.target.closest('a')
  if (a && a.getAttribute('href')) {
    e.preventDefault()
    window.api.openExternal(a.getAttribute('href'))
  }
}

const messages = ref([]) // { id, role, text, images:[dataUrl], files:[{name}], error? }
const input = ref('')
const attachments = ref([])
const sending = ref(false)
const models = ref([])
const fileInput = ref(null)
const scroller = ref(null)

const currentId = ref(null)
const convList = ref([])
const showList = ref(true)

let seed = 0
const uid = () => `m${Date.now()}-${seed++}`

const CHAT_FILTER = /image|video|imagine|flux|sora|kling|dall|midjourney/i

const providers = computed(() => store.settings.providers || [])
const providerOptions = computed(() =>
  providers.value.map((p) => ({ value: p.id, label: p.name || '未命名接口' }))
)
// 对话可独立选接口/分组（与生成页的「当前接口」分开）
const chatProviderId = computed({
  get: () => store.settings.chatProviderId || store.settings.activeProviderId,
  set: async (id) => {
    await persistSettings({ chatProviderId: id })
    await loadModels()
    ensureChatModel()
  }
})
const provider = computed(
  () => providers.value.find((p) => p.id === chatProviderId.value) || activeProvider()
)
const configured = computed(() => Boolean(provider.value && provider.value.baseUrl))

const chatModel = computed({
  get: () => store.settings.chatModel || provider.value?.optimizeModel || '',
  set: (v) => persistSettings({ chatModel: v })
})
const modelOptions = computed(() => {
  const cur = chatModel.value
  // 对话用：过滤掉明显的图片/视频模型，避免误选导致答非所问
  let list = models.value.filter((m) => !CHAT_FILTER.test(m))
  if (cur && !list.includes(cur)) list = [cur, ...list]
  return list.map((m) => ({ value: m, label: m }))
})

function ensureChatModel() {
  const cur = store.settings.chatModel
  const filtered = models.value.filter((m) => !CHAT_FILTER.test(m))
  if (cur && filtered.includes(cur)) return
  const def = provider.value?.optimizeModel
  const pick = def && filtered.includes(def) ? def : filtered[0]
  if (pick) persistSettings({ chatModel: pick })
}

function cleanError(msg) {
  return String(msg || '出错了').replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
}
function fmtTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  if (d.toDateString() === now.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function loadModels() {
  const p = provider.value
  if (!p || !p.baseUrl) return
  try {
    const res = await window.api.listModels({ baseUrl: p.baseUrl, apiKey: p.apiKey })
    models.value = res.models || []
  } catch {
    models.value = []
  }
}

async function loadConvList() {
  try {
    convList.value = await window.api.chatsList()
  } catch {
    convList.value = []
  }
}

async function autoSave() {
  if (!messages.value.length) return
  if (!currentId.value) currentId.value = `c${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const firstUser = messages.value.find((m) => m.role === 'user')
  const title = ((firstUser && firstUser.text) || '新对话').slice(0, 24) || '新对话'
  try {
    await window.api.chatsSave({ id: currentId.value, title, messages: messages.value })
    loadConvList()
  } catch {
    // 保存失败不打断对话
  }
}

async function openConv(id) {
  if (id === currentId.value) return
  if (messages.value.length) await autoSave() // 切走前先存当前
  try {
    const c = await window.api.chatsGet(id)
    if (!c) return
    messages.value = c.messages || []
    currentId.value = id
    scrollDown()
  } catch {
    toast.error('打开对话失败')
  }
}

async function deleteConv(id) {
  try {
    await window.api.chatsDelete(id)
    if (id === currentId.value) newChat()
    loadConvList()
  } catch {
    toast.error('删除失败')
  }
}

function resetChat() {
  messages.value = []
  input.value = ''
  attachments.value = []
  currentId.value = null
}

async function newChat() {
  if (messages.value.length) await autoSave() // 开新对话前，把当前这段存进历史
  resetChat()
  loadConvList()
}

async function clearCurrent() {
  if (!messages.value.length) return
  if (currentId.value) {
    try {
      await window.api.chatsDelete(currentId.value)
    } catch {
      // 忽略
    }
    loadConvList()
  }
  resetChat()
  toast.success('已清空当前对话')
}

function stop() {
  window.api.chatAbort()
}

function buildMarkdown() {
  const lines = [
    '# 对话记录',
    '',
    `> 模型：${chatModel.value || '-'} · 导出时间：${new Date().toLocaleString()}`,
    ''
  ]
  for (const m of messages.value) {
    lines.push(m.role === 'user' ? '## 🧑 我' : '## 🤖 助手')
    if (m.files && m.files.length) lines.push(...m.files.map((f) => `📎 ${f.name}`))
    if (m.images && m.images.length) lines.push(`（含 ${m.images.length} 张图片）`)
    lines.push('', m.text || '', '')
  }
  return lines.join('\n')
}

async function exportMd() {
  if (!messages.value.length) {
    toast.error('当前没有对话内容')
    return
  }
  const firstUser = messages.value.find((m) => m.role === 'user')
  const base = ((firstUser && firstUser.text) || '对话').slice(0, 16).replace(/[\\/:*?"<>|\n]/g, '_')
  try {
    const res = await window.api.saveTextFile({ content: buildMarkdown(), defaultName: `chat-${base}.md` })
    if (!res.canceled) toast.success(`已导出 ${res.path}`)
  } catch (err) {
    toast.error(`导出失败：${cleanError(err.message)}`)
  }
}

function scrollDown() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  })
}

function onPickFile(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const r = new FileReader()
      r.onload = () => attachments.value.push({ kind: 'image', name: file.name, dataUrl: String(r.result || '') })
      r.readAsDataURL(file)
    } else if (file.size <= 256 * 1024 && /\.(txt|md|json|csv|log|js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|html|css|xml|yml|yaml|ini|sh)$/i.test(file.name)) {
      const r = new FileReader()
      r.onload = () => attachments.value.push({ kind: 'text', name: file.name, text: String(r.result || '').slice(0, 20000) })
      r.readAsText(file)
    } else {
      toast.error(`不支持或过大的文件（文本需 ≤256KB）：${file.name}`)
    }
  }
}

function removeAttachment(i) {
  attachments.value.splice(i, 1)
}

function toApiMessage(m, overrideText) {
  const textPart = overrideText != null ? overrideText : m.text
  if (m.role === 'user' && m.images && m.images.length) {
    const content = []
    if (textPart) content.push({ type: 'text', text: textPart })
    for (const u of m.images) content.push({ type: 'image_url', image_url: { url: u } })
    return { role: 'user', content }
  }
  return { role: m.role, content: textPart }
}

async function send() {
  if (!configured.value) {
    toast.error('请先在设置中配置接口')
    return
  }
  if (!chatModel.value) {
    toast.error('请先选择对话模型')
    return
  }
  const text = input.value.trim()
  if (!text && !attachments.value.length) return

  const imgs = attachments.value.filter((a) => a.kind === 'image').map((a) => a.dataUrl)
  const textFiles = attachments.value.filter((a) => a.kind === 'text')
  const userMsg = {
    id: uid(),
    role: 'user',
    text,
    images: imgs,
    files: textFiles.map((a) => ({ name: a.name }))
  }
  let apiText = text
  for (const a of textFiles) apiText += `\n\n[文件 ${a.name}]\n${a.text}`

  messages.value.push(userMsg)
  input.value = ''
  attachments.value = []
  scrollDown()

  const hist = messages.value.slice(-16)
  const apiMessages = hist.map((m) => toApiMessage(m, m === userMsg ? apiText : null))

  sending.value = true
  try {
    const res = await window.api.chatSend({
      providerId: chatProviderId.value,
      model: chatModel.value,
      messages: apiMessages
    })
    messages.value.push({ id: uid(), role: 'assistant', text: res.content, images: [], files: [] })
  } catch (err) {
    const msg = cleanError(err.message)
    if (!/已停止/.test(msg)) {
      messages.value.push({ id: uid(), role: 'assistant', text: msg, images: [], files: [], error: true })
    }
  } finally {
    sending.value = false
    scrollDown()
    autoSave()
  }
}

async function copyMsg(m) {
  try {
    await navigator.clipboard.writeText(m.text || '')
    toast.success('已复制')
  } catch {
    toast.error('复制失败')
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

onMounted(async () => {
  await loadModels()
  ensureChatModel()
  loadConvList()
})
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-left">
        <button class="ghost-icon" :class="{ on: showList }" title="历史对话" @click="showList = !showList">
          <Icon name="logs" :size="17" />
        </button>
        <div class="head-title">
          <h1>AI 对话</h1>
          <p class="sub">和配置的模型聊天，可上传图片 / 文本文件</p>
        </div>
      </div>
      <div class="head-right">
        <button class="ghost-icon" title="导出为 Markdown" :disabled="!messages.length" @click="exportMd">
          <Icon name="download" :size="16" />
        </button>
        <button class="ghost-icon" title="清空当前对话" @click="clearCurrent">
          <Icon name="eraser" :size="16" />
        </button>
      </div>
    </header>

    <div class="chat-body">
      <aside v-if="showList" class="conv-list">
        <button class="new-conv" @click="newChat">
          <Icon name="plus" :size="15" /><span>新对话</span>
        </button>
        <div class="conv-scroll">
          <button
            v-for="c in convList"
            :key="c.id"
            class="conv-item"
            :class="{ active: c.id === currentId }"
            @click="openConv(c.id)"
          >
            <Icon name="chat" :size="14" class="conv-ic" />
            <span class="conv-main">
              <span class="conv-title">{{ c.title || '新对话' }}</span>
              <span class="conv-meta">{{ fmtTime(c.updatedAt) }} · {{ c.count }} 条</span>
            </span>
            <span class="conv-del" title="删除" @click.stop="deleteConv(c.id)">
              <Icon name="trash" :size="13" />
            </span>
          </button>
          <div v-if="!convList.length" class="conv-empty">
            <Icon name="chat" :size="20" />
            <span>还没有历史对话</span>
            <small>聊过的会自动保存在这里</small>
          </div>
        </div>
      </aside>

      <div class="chat-main">
        <div ref="scroller" class="messages">
          <div v-if="!messages.length" class="empty">
            <div class="empty-art"><Icon name="chat" :size="34" /></div>
            <p class="empty-title">开始对话</p>
            <p class="empty-sub">
              当前模型：<b>{{ chatModel || '未选择（右上角选一个）' }}</b><br />
              可上传文本文件；图片需所选模型支持视觉 · 历史自动保存
            </p>
          </div>

          <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
            <div class="avatar" :class="m.role">
              <Icon :name="m.role === 'user' ? 'group' : 'chat'" :size="15" />
            </div>
            <div class="bubble" :class="{ error: m.error }">
              <div v-if="m.images && m.images.length" class="msg-imgs">
                <img v-for="(im, i) in m.images" :key="i" :src="im" alt="图片" />
              </div>
              <div v-if="m.files && m.files.length" class="msg-files">
                <span v-for="(f, i) in m.files" :key="i" class="file-chip">
                  <Icon name="logs" :size="12" />{{ f.name }}
                </span>
              </div>
              <div
                v-if="m.role === 'assistant' && !m.error && m.text"
                class="md-body"
                v-html="mdToHtml(m.text)"
                @click="onMsgClick"
              ></div>
              <p v-else-if="m.text" class="msg-text">{{ m.text }}</p>
            </div>
            <button
              v-if="m.role === 'assistant' && !m.error && m.text"
              class="copy-out"
              title="复制"
              @click="copyMsg(m)"
            >
              <Icon name="copy" :size="14" />
            </button>
          </div>

          <div v-if="sending" class="msg assistant">
            <div class="avatar assistant"><Icon name="chat" :size="15" /></div>
            <div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>
          </div>
        </div>

        <div class="composer">
          <div class="composer-tools">
            <span class="ct-label">接口</span>
            <div class="ct-prov">
              <Dropdown v-model="chatProviderId" :options="providerOptions" size="sm" placeholder="选择接口" />
            </div>
            <span class="ct-label">模型</span>
            <div class="ct-model">
              <Dropdown v-model="chatModel" :options="modelOptions" size="sm" placeholder="选择模型" />
            </div>
          </div>
          <div v-if="attachments.length" class="attach-row">
            <div v-for="(a, i) in attachments" :key="i" class="attach">
              <img v-if="a.kind === 'image'" :src="a.dataUrl" alt="" />
              <span v-else class="attach-file"><Icon name="logs" :size="13" />{{ a.name }}</span>
              <button class="attach-x" @click="removeAttachment(i)"><Icon name="win-close" :size="10" /></button>
            </div>
          </div>
          <div class="composer-main">
            <input ref="fileInput" type="file" multiple accept="image/*,.txt,.md,.json,.csv,.log,.js,.ts,.py,.html,.css,.xml,.yml,.yaml" hidden @change="onPickFile" />
            <button class="attach-btn" title="上传图片 / 文本文件" :disabled="!configured" @click="fileInput && fileInput.click()">
              <Icon name="image" :size="18" />
            </button>
            <textarea
              v-model="input"
              class="chat-input"
              rows="1"
              :placeholder="configured ? '输入消息，Enter 发送，Shift+Enter 换行' : '请先到设置配置接口'"
              :disabled="!configured || sending"
              @keydown="onKeydown"
            ></textarea>
            <button v-if="sending" class="send-btn stop" title="停止生成" @click="stop">
              <Icon name="stop" :size="18" />
            </button>
            <button
              v-else
              class="send-btn"
              :disabled="!input.trim() && !attachments.length"
              @click="send"
            >
              <Icon name="sparkle" :size="16" />
            </button>
          </div>
        </div>
      </div>
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
  gap: 14px;
  padding: 16px 30px 14px;
  border-bottom: 1px solid var(--border);
}
.head-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ghost-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  color: var(--text-2);
  border: 1px solid var(--border);
}
.ghost-icon:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}
.ghost-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ghost-icon.on {
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}
.head-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.model-wrap {
  width: 200px;
  flex-shrink: 0;
}

.chat-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.conv-list {
  width: 232px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-2);
}
.new-conv {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 12px;
  height: 36px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 4px 12px var(--accent-glow);
}
.new-conv:hover {
  background: var(--accent-hover);
}
.conv-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--text-2);
  transition: background 0.12s ease, color 0.12s ease;
}
.conv-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
.conv-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.conv-ic {
  flex-shrink: 0;
  opacity: 0.7;
}
.conv-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-title {
  font-size: 12.5px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-meta {
  font-size: 10.5px;
  color: var(--text-3);
}
.conv-del {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
}
.conv-item:hover .conv-del {
  opacity: 1;
}
.conv-del:hover {
  background: rgba(225, 29, 72, 0.12);
  color: var(--danger);
}
.conv-empty {
  margin: auto;
  padding: 20px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  color: var(--text-3);
}
.conv-empty span {
  font-size: 12.5px;
  color: var(--text-2);
}
.conv-empty small {
  font-size: 11px;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 22px 30px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.empty {
  margin: auto;
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
  margin: 16px 0 6px;
  font-weight: 600;
}
.empty-sub {
  font-size: 12.5px;
  line-height: 1.7;
  margin: 0;
}
.empty-sub b {
  color: var(--accent);
}
.msg {
  display: flex;
  gap: 11px;
  width: 100%;
}
.msg.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
}
.avatar.assistant {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
}
.avatar.user {
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
}
.bubble {
  position: relative;
  max-width: min(760px, 80%);
  padding: 11px 14px;
  border-radius: 14px;
  font-size: 13.5px;
  line-height: 1.65;
}
.msg.assistant .bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  border-top-left-radius: 4px;
}
.msg.user .bubble {
  background: var(--accent);
  color: #fff;
  border-top-right-radius: 4px;
}
.bubble.error {
  background: rgba(225, 29, 72, 0.1);
  border: 1px solid rgba(225, 29, 72, 0.35);
  color: var(--danger);
}
.msg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.msg-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.msg-imgs img {
  max-width: 180px;
  max-height: 180px;
  border-radius: 8px;
  display: block;
}
.msg-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}
.msg.assistant .file-chip {
  background: var(--surface-2);
  color: var(--text-2);
}
.copy-out {
  align-self: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.14s ease, background 0.14s ease;
}
.msg:hover .copy-out {
  opacity: 1;
}
.copy-out:hover {
  background: var(--surface-2);
  color: var(--text);
}
.md-body {
  user-select: text;
  font-size: 13.5px;
  line-height: 1.65;
  word-break: break-word;
}
.md-body :deep(p) {
  margin: 0 0 8px;
}
.md-body :deep(p:last-child) {
  margin-bottom: 0;
}
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  margin: 10px 0 6px;
  font-size: 15px;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}
.md-body :deep(li) {
  margin: 3px 0;
}
.md-body :deep(code) {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12.5px;
}
.md-body :deep(pre) {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.md-body :deep(pre code) {
  background: none;
  padding: 0;
}
.md-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}
.md-body :deep(strong) {
  font-weight: 700;
}
.md-body :deep(blockquote) {
  border-left: 3px solid var(--border-2);
  margin: 8px 0;
  padding-left: 12px;
  color: var(--text-2);
}
.md-body :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
}
.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
  font-size: 12.5px;
}
.typing {
  display: inline-flex;
  gap: 4px;
  padding: 2px 0;
}
.typing i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
  animation: blink 1.2s infinite both;
}
.typing i:nth-child(2) {
  animation-delay: 0.2s;
}
.typing i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%, 80%, 100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}
.composer {
  border-top: 1px solid var(--border);
  padding: 12px 30px 16px;
}
.composer-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 10px;
}
.ct-label {
  font-size: 12px;
  color: var(--text-3);
}
.ct-prov {
  width: 160px;
}
.ct-model {
  width: 220px;
}
.attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.attach {
  position: relative;
}
.attach img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: block;
}
.attach-file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 52px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.attach-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
}
.attach-x:hover {
  background: var(--danger);
}
.composer-main {
  display: flex;
  align-items: flex-end;
  gap: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 8px 8px 10px;
}
.composer-main:focus-within {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.attach-btn {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  color: var(--text-2);
}
.attach-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--accent);
}
.attach-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  max-height: 160px;
  padding: 9px 2px;
  outline: none;
  user-select: text;
}
.chat-input::placeholder {
  color: var(--text-3);
}
.send-btn {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 4px 12px var(--accent-glow);
}
.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.send-btn.stop {
  background: var(--danger);
  box-shadow: none;
}
.send-btn.stop:hover {
  opacity: 0.9;
}
</style>
