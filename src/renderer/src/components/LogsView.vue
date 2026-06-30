<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'

const logs = ref([])
const loading = ref(false)
const expanded = ref(null)
let off = null

const KIND = {
  image: '图片',
  video: '视频',
  optimize: '优化',
  test: '测试'
}

function fmtTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function refresh() {
  loading.value = true
  try {
    logs.value = await window.api.getLogs()
  } catch (err) {
    toast.error(`读取日志失败：${err.message}`)
  } finally {
    loading.value = false
  }
}

async function clear() {
  try {
    await window.api.clearLogs()
    logs.value = []
    expanded.value = null
    toast.success('日志已清空')
  } catch (err) {
    toast.error(`清空失败：${err.message}`)
  }
}

async function openFile() {
  try {
    const f = await window.api.openLogFile()
    toast.info(`已打开 ${f}`)
  } catch (err) {
    toast.error(`打开失败：${err.message}`)
  }
}

function toggle(id) {
  expanded.value = expanded.value === id ? null : id
}

async function copyDetail(e) {
  const lines = [
    `时间：${new Date(e.time).toLocaleString()}`,
    `类型：${KIND[e.kind] || e.kind} · ${e.ok ? '成功' : '失败'}`,
    `接口：${e.provider || '-'} · 模型 ${e.model || '-'}`,
    `URL：${e.url || '-'}`,
    `HTTP：${e.status ?? '-'} · 耗时 ${e.durationMs ?? '-'}ms`,
    `信息：${e.message || '-'}`,
    e.detail ? `原始返回：\n${e.detail}` : ''
  ]
  try {
    await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
    toast.success('已复制该条日志')
  } catch {
    toast.error('复制失败')
  }
}

onMounted(() => {
  refresh()
  off = window.api.onLog((entry) => {
    logs.value.unshift(entry)
    if (logs.value.length > 300) logs.value.length = 300
  })
})
onUnmounted(() => off && off())
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>日志</h1>
        <p class="sub">出图 / 出片 / 优化 / 测试的请求记录与错误详情 · 共 {{ logs.length }} 条</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-sm" :disabled="loading" @click="refresh">
          <span v-if="loading" class="spin"></span>
          <Icon v-else name="refresh" :size="15" />
          <span>刷新</span>
        </button>
        <button class="btn btn-sm" @click="openFile">
          <Icon name="folder-open" :size="15" /><span>日志文件</span>
        </button>
        <button class="btn btn-sm" @click="clear">
          <Icon name="trash" :size="15" /><span>清空</span>
        </button>
      </div>
    </header>

    <div class="scroll">
      <div v-if="logs.length" class="log-list">
        <div v-for="e in logs" :key="e.id" class="log-item" :class="{ err: !e.ok }">
          <button class="log-row" @click="toggle(e.id)">
            <span class="dot" :class="e.ok ? 'ok' : 'bad'"></span>
            <span class="time">{{ fmtTime(e.time) }}</span>
            <span class="kind" :class="e.kind">{{ KIND[e.kind] || e.kind }}</span>
            <span class="status" v-if="e.status">{{ e.status }}</span>
            <span class="msg">{{ e.message }}</span>
            <span class="model">{{ e.model || '' }}</span>
            <Icon name="chevron" :size="14" class="chev" :class="{ open: expanded === e.id }" />
          </button>

          <div v-if="expanded === e.id" class="log-detail">
            <div class="kv"><span>接口</span><b>{{ e.provider || '-' }}</b></div>
            <div class="kv"><span>模型</span><b>{{ e.model || '-' }}</b></div>
            <div class="kv"><span>URL</span><b class="mono">{{ e.url || '-' }}</b></div>
            <div class="kv"><span>HTTP</span><b>{{ e.status ?? '-' }} · {{ e.durationMs ?? '-' }}ms</b></div>
            <div class="kv"><span>信息</span><b>{{ e.message }}</b></div>
            <div v-if="e.detail" class="raw">
              <div class="raw-head">原始返回</div>
              <pre>{{ e.detail }}</pre>
            </div>
            <button class="btn btn-sm btn-ghost copy-btn" @click="copyDetail(e)">
              <Icon name="copy" :size="14" /><span>复制此条</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="!loading" class="empty">
        <div class="empty-art"><Icon name="logs" :size="32" /></div>
        <p class="empty-title">还没有日志</p>
        <p class="empty-sub">生成图片 / 视频或测试连接后，记录会出现在这里</p>
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
.head-actions {
  display: flex;
  gap: 8px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 30px 40px;
}
.log-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.log-item.err {
  border-color: rgba(240, 82, 106, 0.35);
}
.log-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 13px;
  text-align: left;
}
.log-row:hover {
  background: var(--surface-2);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.ok {
  background: var(--success);
}
.dot.bad {
  background: var(--danger);
}
.time {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.kind {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  flex-shrink: 0;
}
.kind.image {
  color: #c7bdff;
}
.kind.video {
  color: #8ab4ff;
}
.kind.optimize {
  color: var(--accent);
}
.status {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.msg {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  color: var(--text-3);
  flex-shrink: 0;
  transform: rotate(90deg);
  transition: transform 0.16s ease;
}
.chev.open {
  transform: rotate(-90deg);
}
.log-detail {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--border);
  background: var(--bg-1);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.kv {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
}
.kv > span {
  flex-shrink: 0;
  width: 48px;
  color: var(--text-3);
}
.kv > b {
  color: var(--text);
  font-weight: 550;
  word-break: break-all;
}
.mono {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}
.raw {
  margin-top: 4px;
}
.raw-head {
  font-size: 11.5px;
  color: var(--text-3);
  margin-bottom: 5px;
}
.raw pre {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
.copy-btn {
  align-self: flex-start;
  margin-top: 4px;
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
