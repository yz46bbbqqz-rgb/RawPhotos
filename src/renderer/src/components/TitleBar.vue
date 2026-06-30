<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

const maximized = ref(false)
let off = null

onMounted(async () => {
  maximized.value = await window.api.window.isMaximized()
  off = window.api.window.onState((s) => {
    maximized.value = s.maximized
  })
})
onUnmounted(() => off && off())

const emit = defineEmits(['close-request'])

const SITE = 'https://nexus.apimf.top'
const openSite = () => window.api.openExternal(SITE)

const min = () => window.api.window.minimize()
const max = () => window.api.window.maximizeToggle()
const close = () => emit('close-request')
</script>

<template>
  <div class="titlebar">
    <div class="tb-brand">
      <div class="tb-mark"><Icon name="sparkle" :size="13" /></div>
      <span class="tb-name">RawPhotos</span>
      <button class="tb-tag" title="打开网站" @click="openSite">https://nexus.apimf.top</button>
    </div>

    <div class="tb-drag"></div>

    <div class="tb-controls">
      <button class="tb-btn" title="最小化" @click="min"><Icon name="win-min" :size="15" /></button>
      <button class="tb-btn" :title="maximized ? '还原' : '最大化'" @click="max">
        <Icon :name="maximized ? 'win-restore' : 'win-max'" :size="14" />
      </button>
      <button class="tb-btn tb-close" title="关闭（收起到托盘 / 退出）" @click="close">
        <Icon name="win-close" :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  display: flex;
  align-items: center;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  flex-shrink: 0;
  padding-left: 14px;
}
.tb-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.tb-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  display: grid;
  place-items: center;
  color: #fff;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.tb-name {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.2px;
}
.tb-tag {
  font-size: 11.5px;
  color: var(--text-3);
  padding-left: 10px;
  margin-left: 2px;
  border-left: 1px solid var(--border);
  -webkit-app-region: no-drag;
  cursor: pointer;
  transition: color 0.14s ease;
}
.tb-tag:hover {
  color: var(--accent);
}
.tb-drag {
  flex: 1;
  height: 100%;
}
.tb-controls {
  display: flex;
  -webkit-app-region: no-drag;
  height: 100%;
}
.tb-btn {
  width: 46px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  transition: background 0.14s ease, color 0.14s ease;
}
.tb-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.tb-close:hover {
  background: #e11d48;
  color: #fff;
}
</style>
