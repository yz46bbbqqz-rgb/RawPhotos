<script setup>
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { store, loadSettings, persistSettings, isConfigured, activeProvider, setTheme, THEMES } from './store'
import { toast } from './composables/useToast'
import TitleBar from './components/TitleBar.vue'
import Icon from './components/Icon.vue'
import GenerateView from './components/GenerateView.vue'
import ChatView from './components/ChatView.vue'
import GalleryView from './components/GalleryView.vue'
import SettingsView from './components/SettingsView.vue'
import LogsView from './components/LogsView.vue'
import StatsView from './components/StatsView.vue'
import AboutView from './components/AboutView.vue'
import ToastHost from './components/ToastHost.vue'

const view = ref('generate')

const navItems = [
  { id: 'generate', label: '生成', icon: 'sparkle' },
  { id: 'chat', label: '对话', icon: 'chat' },
  { id: 'gallery', label: '画廊', icon: 'grid' },
  { id: 'stats', label: '统计', icon: 'chart' },
  { id: 'logs', label: '日志', icon: 'logs' },
  { id: 'settings', label: '设置', icon: 'settings' },
  { id: 'about', label: '关于', icon: 'info' }
]

const configured = computed(() => isConfigured())
const prov = computed(() => activeProvider())
const currentTheme = computed(() => store.settings.theme || 'dark')

const quit = () => window.api.quitApp()
const hideToTray = () => window.api.window.close()

const balance = ref(null)
function money(v) {
  if (v == null) return '—'
  const u = balance.value?.unit || 'USD'
  return u === 'USD' ? `$${Number(v).toFixed(2)}` : `${Number(v).toFixed(2)} ${u}`
}
let belowAlerted = false
function checkAlert() {
  const s = store.settings
  const rem = balance.value?.remaining
  if (!s.alertEnabled || rem == null) {
    belowAlerted = false
    return
  }
  const th = Number(s.alertThreshold) || 0
  if (rem <= th) {
    if (!belowAlerted) {
      belowAlerted = true
      const msg = `剩余额度 ${money(rem)}，已低于预警值 ${money(th)}`
      toast.error(`⚠️ 额度预警：${msg}`)
      window.api.notify({ title: '额度预警 · RawPhotos', body: msg })
    }
  } else {
    belowAlerted = false
  }
}

async function loadBalance() {
  if (!isConfigured()) {
    balance.value = null
    return
  }
  try {
    const q = await window.api.getQuota()
    balance.value = q && q.error ? null : q
    checkAlert()
  } catch {
    balance.value = null
  }
}
let balTimer = null
watch(() => store.settings.activeProviderId, () => loadBalance())

const closeDialog = ref(false)
const rememberClose = ref(false)

function onCloseRequest() {
  const mode = store.settings.closeAction || 'ask'
  if (mode === 'tray') return hideToTray()
  if (mode === 'quit') return quit()
  rememberClose.value = false
  closeDialog.value = true
}

async function chooseClose(action) {
  if (rememberClose.value) await persistSettings({ closeAction: action })
  closeDialog.value = false
  if (action === 'tray') hideToTray()
  else quit()
}

onMounted(async () => {
  await loadSettings()
  if (!isConfigured()) view.value = 'settings'
  loadBalance()
  balTimer = setInterval(loadBalance, 60000)
})
onUnmounted(() => {
  if (balTimer) clearInterval(balTimer)
})
</script>

<template>
  <div class="app">
    <TitleBar @close-request="onCloseRequest" />

    <div class="body">
      <aside class="sidebar">
        <nav class="nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: view === item.id }"
            @click="view = item.id"
          >
            <Icon :name="item.icon" :size="18" />
            <span>{{ item.label }}</span>
            <span v-if="item.id === 'settings' && !configured" class="nav-dot"></span>
          </button>
        </nav>

        <div class="sidebar-foot">
          <div v-if="balance" class="balance" title="当前接口剩余额度（每分钟刷新）">
            <span class="bal-ic"><Icon name="plug" :size="13" /></span>
            <div class="bal-text">
              <div class="bal-num">{{ money(balance.remaining) }}</div>
              <div class="bal-sub">
                剩余额度<template v-if="balance.total != null"> · 总 {{ money(balance.total) }}</template>
              </div>
            </div>
          </div>

          <div class="theme-row">
            <button
              v-for="t in THEMES"
              :key="t.id"
              class="theme-dot"
              :class="{ active: currentTheme === t.id }"
              :style="{ background: t.bg }"
              :title="`主题：${t.label}`"
              @click="setTheme(t.id)"
            >
              <span class="theme-accent" :style="{ background: t.accent }"></span>
            </button>
            <button
              class="theme-dot"
              :class="{ active: currentTheme === 'custom' }"
              style="background: #f4f5f7"
              title="自定义主题"
              @click="setTheme('custom')"
            >
              <span class="theme-accent" :style="{ background: store.settings.customColor || '#10b981' }"></span>
            </button>
          </div>

          <div class="status-card">
            <span class="dot" :class="{ on: configured }"></span>
            <div class="status-text">
              <div class="status-title">{{ configured ? (prov?.name || '接口已连接') : '未配置接口' }}</div>
              <div class="status-sub">{{ prov?.imageModel || '未设置模型' }}</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="content">
        <template v-if="store.settingsLoaded">
          <GenerateView v-show="view === 'generate'" @go-settings="view = 'settings'" />
          <ChatView v-if="view === 'chat'" />
          <GalleryView v-if="view === 'gallery'" />
          <StatsView v-if="view === 'stats'" />
          <LogsView v-if="view === 'logs'" />
          <SettingsView v-if="view === 'settings'" />
          <AboutView v-if="view === 'about'" />
        </template>
      </main>
    </div>

    <Transition name="fade">
      <div v-if="closeDialog" class="modal-mask" @click.self="closeDialog = false">
        <div class="modal">
          <button class="modal-x" title="取消" @click="closeDialog = false">
            <Icon name="win-close" :size="13" />
          </button>
          <h3 class="modal-title">关闭 RawPhotos</h3>
          <p class="modal-desc">选择关闭方式</p>

          <div class="modal-choices">
            <button class="choice" @click="chooseClose('tray')">
              <span class="choice-ic tray"><Icon name="tray" :size="18" /></span>
              <span class="choice-txt">
                <b>最小化到托盘</b>
                <small>后台继续运行，点托盘图标随时恢复</small>
              </span>
              <Icon name="chevron" :size="15" class="choice-arrow" />
            </button>
            <button class="choice" @click="chooseClose('quit')">
              <span class="choice-ic quit"><Icon name="power" :size="18" /></span>
              <span class="choice-txt">
                <b>退出应用</b>
                <small>完全关闭 RawPhotos</small>
              </span>
              <Icon name="chevron" :size="15" class="choice-arrow" />
            </button>
          </div>

          <label class="modal-remember">
            <input type="checkbox" v-model="rememberClose" />
            <span>记住选择，下次不再询问</span>
          </label>
        </div>
      </div>
    </Transition>

    <ToastHost />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.body {
  flex: 1;
  display: grid;
  grid-template-columns: 216px 1fr;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  padding: 14px 12px;
  background: var(--bg-1);
  border-right: 1px solid var(--border);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13.5px;
  font-weight: 550;
  position: relative;
  transition: background 0.14s ease, color 0.14s ease;
}
.nav-item:hover {
  background: var(--surface);
  color: var(--text);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.nav-dot {
  margin-left: auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.16);
}

.sidebar-foot {
  margin-top: auto;
}
.balance {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}
.bal-ic {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent);
}
.bal-text {
  min-width: 0;
}
.bal-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.bal-sub {
  font-size: 10.5px;
  color: var(--text-3);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.theme-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 6px 0 12px;
}
.theme-dot {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid var(--border-2);
  display: grid;
  place-items: center;
  transition: transform 0.12s ease, border-color 0.14s ease;
}
.theme-dot:hover {
  transform: translateY(-2px);
}
.theme-dot.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.theme-accent {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.status-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
}
.status-card .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
  flex-shrink: 0;
}
.status-card .dot.on {
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(56, 199, 147, 0.16);
}
.status-text {
  min-width: 0;
}
.status-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.status-sub {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(5, 8, 7, 0.55);
  display: grid;
  place-items: center;
  backdrop-filter: blur(4px);
}
.modal {
  position: relative;
  width: 360px;
  max-width: calc(100vw - 48px);
  padding: 22px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border-2);
  box-shadow: var(--shadow);
}
.modal-x {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: var(--text-3);
}
.modal-x:hover {
  background: var(--surface-2);
  color: var(--text);
}
.modal-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
}
.modal-desc {
  margin: 0 0 16px;
  font-size: 12.5px;
  color: var(--text-3);
}
.modal-choices {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 13px;
  border-radius: var(--radius);
  background: var(--bg-1);
  border: 1px solid var(--border);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.06s ease;
}
.choice:hover {
  border-color: var(--accent-line);
  background: var(--surface-2);
}
.choice:active {
  transform: translateY(1px);
}
.choice-ic {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
}
.choice-ic.quit {
  color: var(--danger);
  background: rgba(225, 29, 72, 0.1);
}
.choice-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.choice-txt b {
  font-size: 13.5px;
  font-weight: 600;
}
.choice-txt small {
  font-size: 11.5px;
  color: var(--text-3);
}
.choice-arrow {
  color: var(--text-3);
  flex-shrink: 0;
}
.modal-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
  margin-top: 16px;
  cursor: pointer;
}
.modal-remember input {
  accent-color: var(--accent);
}

.content {
  overflow: hidden;
  min-width: 0;
}
</style>
