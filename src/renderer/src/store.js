import { reactive } from 'vue'

export const THEMES = [
  { id: 'green', label: '晴绿', bg: '#f2f7f4', accent: '#0d9488' },
  { id: 'sky', label: '海盐', bg: '#eef4fb', accent: '#0ea5e9' },
  { id: 'dark', label: '曜夜', bg: '#0d1311', accent: '#2dd4bf' }
]
const THEME_IDS = new Set([...THEMES.map((t) => t.id), 'custom'])
const ACCENT_VARS = ['--accent', '--accent-hover', '--accent-soft', '--accent-line', '--ring', '--accent-glow']

export const store = reactive({
  settings: {
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
  },
  settingsLoaded: false,
  // 本次会话生成的结果：{ id, kind:'image'|'video', b64, url, prompt, revisedPrompt, model, time, saved }
  results: []
})

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const int = parseInt(n, 16)
  if (Number.isNaN(int) || n.length !== 6) return { r: 16, g: 185, b: 129 }
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}
function darkenHex(hex, factor = 0.84) {
  const { r, g, b } = hexToRgb(hex)
  const d = (v) => Math.max(0, Math.min(255, Math.round(v * factor)))
  return `#${[d(r), d(g), d(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function applyTheme(theme) {
  const t = THEME_IDS.has(theme) ? theme : 'sky'
  const el = document.documentElement
  el.dataset.theme = t
  if (t === 'custom') {
    const c = store.settings.customColor || '#10b981'
    const { r, g, b } = hexToRgb(c)
    el.style.setProperty('--accent', c)
    el.style.setProperty('--accent-hover', darkenHex(c))
    el.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.12)`)
    el.style.setProperty('--accent-line', `rgba(${r}, ${g}, ${b}, 0.5)`)
    el.style.setProperty('--ring', `rgba(${r}, ${g}, ${b}, 0.4)`)
    el.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.28)`)
  } else {
    ACCENT_VARS.forEach((v) => el.style.removeProperty(v))
  }
  try {
    localStorage.setItem('rawphotos-theme', t)
  } catch {
    // 忽略：localStorage 不可用不影响主题应用
  }
}

export async function setCustomColor(color) {
  store.settings.customColor = color
  applyTheme('custom')
  return persistSettings({ theme: 'custom', customColor: color })
}

export async function loadSettings() {
  store.settings = await window.api.getSettings()
  store.settingsLoaded = true
  applyTheme(store.settings.theme)
  return store.settings
}

export async function persistSettings(patch) {
  store.settings = await window.api.saveSettings(patch)
  return store.settings
}

export async function setTheme(theme) {
  applyTheme(theme)
  return persistSettings({ theme })
}

export function activeProvider() {
  const list = store.settings.providers || []
  return list.find((p) => p.id === store.settings.activeProviderId) || list[0] || null
}

export async function setActiveProvider(id) {
  if (id === store.settings.activeProviderId) return store.settings
  return persistSettings({ activeProviderId: id })
}

export function addResults(items) {
  store.results.unshift(...items)
}

export function clearResults() {
  store.results.splice(0, store.results.length)
}

export function isConfigured() {
  const p = activeProvider()
  return Boolean(p && p.baseUrl)
}
