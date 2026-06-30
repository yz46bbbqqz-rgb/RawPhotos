<script setup>
import { ref, onMounted } from 'vue'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'

const SITE = 'https://nexus.apimf.top'
const QQ_GROUP = '1105572960'
const version = ref('')

onMounted(async () => {
  try {
    version.value = await window.api.getVersion()
  } catch {
    version.value = ''
  }
})

function openSite() {
  window.api.openExternal(SITE)
}

async function copyGroup() {
  try {
    await navigator.clipboard.writeText(QQ_GROUP)
    toast.success('群号已复制：' + QQ_GROUP)
  } catch {
    toast.error('复制失败')
  }
}

const features = [
  { icon: 'image', text: '文生图：多张并发、可选尺寸' },
  { icon: 'film', text: '文生视频：同步直出 / 异步轮询' },
  { icon: 'sparkle', text: 'AI 提示词优化（GPT / Claude / Grok 通用）' },
  { icon: 'plug', text: '多中转接口配置，一键切换' },
  { icon: 'logs', text: '运行日志，错误一目了然' },
  { icon: 'palette', text: '多主题切换，自动记忆' }
]
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>关于</h1>
        <p class="sub">RawPhotos · AI 文生图 / 文生视频桌面应用</p>
      </div>
    </header>

    <div class="scroll">
      <section class="hero card">
        <div class="logo"><Icon name="sparkle" :size="30" /></div>
        <div class="hero-main">
          <div class="hero-title">
            <h2>RawPhotos</h2>
            <span v-if="version" class="ver">v{{ version }}</span>
          </div>
          <p class="hero-desc">基于 Electron + Vue 3 的桌面创作工具，通过 OpenAI 兼容中转接口调用 flux / Grok 等模型出图、出片。</p>
          <button class="btn btn-sm site-btn" @click="openSite">
            <Icon name="link" :size="14" /><span>{{ SITE }}</span>
          </button>
        </div>
      </section>

      <section class="card group-card">
        <div class="group-left">
          <div class="group-icon"><Icon name="group" :size="22" /></div>
          <div class="group-text">
            <div class="group-label">交流 / 反馈 QQ 群</div>
            <div class="group-num">{{ QQ_GROUP }}</div>
          </div>
        </div>
        <button class="btn btn-primary copy-group" @click="copyGroup">
          <Icon name="copy" :size="15" /><span>复制群号</span>
        </button>
      </section>

      <section class="card feat-card">
        <h3 class="feat-title">功能一览</h3>
        <div class="feat-grid">
          <div v-for="f in features" :key="f.text" class="feat-item">
            <span class="feat-ic"><Icon :name="f.icon" :size="16" /></span>
            <span class="feat-tx">{{ f.text }}</span>
          </div>
        </div>
      </section>

      <p class="foot-note">© RawPhotos · 仅供学习与个人创作使用，请遵守所用模型 / 接口的使用条款。</p>
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
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 22px 34px 40px;
  width: 100%;
}
.hero {
  display: flex;
  gap: 18px;
  padding: 22px;
  margin-bottom: 16px;
}
.logo {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  box-shadow: 0 8px 22px var(--accent-glow);
}
.hero-main {
  min-width: 0;
}
.hero-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hero-title h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}
.ver {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-2);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.hero-desc {
  margin: 8px 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}
.site-btn {
  color: var(--accent);
}

.group-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.group-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.group-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}
.group-label {
  font-size: 12px;
  color: var(--text-3);
}
.group-num {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  user-select: text;
}
.copy-group {
  flex-shrink: 0;
}

.feat-card {
  padding: 18px 20px;
  margin-bottom: 16px;
}
.feat-title {
  margin: 0 0 14px;
  font-size: 13.5px;
  font-weight: 650;
}
.feat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.feat-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.feat-ic {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.feat-tx {
  font-size: 12.5px;
  color: var(--text-2);
}
.foot-note {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}
</style>
