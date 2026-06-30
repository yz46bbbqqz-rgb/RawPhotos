<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from '../composables/useToast'
import Lightbox from './Lightbox.vue'
import Icon from './Icon.vue'

const loading = ref(false)
const dir = ref('')
const items = ref([])
const zoom = ref({ src: '', kind: 'image' })
const filter = ref('all')

const imageCount = computed(() => items.value.filter((i) => i.kind === 'image').length)
const videoCount = computed(() => items.value.filter((i) => i.kind === 'video').length)
const filteredItems = computed(() =>
  filter.value === 'all' ? items.value : items.value.filter((i) => i.kind === filter.value)
)
const filterTabs = computed(() => [
  { id: 'all', label: '全部', n: items.value.length },
  { id: 'image', label: '图片', n: imageCount.value },
  { id: 'video', label: '视频', n: videoCount.value }
])

function srcOf(item) {
  if (item.kind === 'video') return window.api.mediaUrl(item.path)
  return item.dataUrl
}

async function refresh() {
  loading.value = true
  try {
    const res = await window.api.listGallery()
    dir.value = res.dir
    items.value = res.items || []
  } catch (err) {
    toast.error(`读取画廊失败：${err.message}`)
  } finally {
    loading.value = false
  }
}

function open(item) {
  zoom.value = { src: srcOf(item), kind: item.kind }
}

async function openFolder() {
  await window.api.openPath(dir.value || '')
}

async function saveAs(item) {
  try {
    const payload =
      item.kind === 'video'
        ? { path: item.path, kind: 'video', defaultName: item.name }
        : { b64: (item.dataUrl || '').split(',')[1] || '', kind: 'image', defaultName: item.name }
    const res = await window.api.saveMediaAs(payload)
    if (!res.canceled) toast.success(`已另存为 ${res.path}`)
  } catch (err) {
    toast.error(`另存失败：${err.message}`)
  }
}

onMounted(refresh)
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>画廊</h1>
        <p class="sub">
          已保存到本地 · 图片 {{ imageCount }} · 视频 {{ videoCount }}
        </p>
      </div>
      <div class="head-actions">
        <button class="btn btn-sm" :disabled="loading" @click="refresh">
          <span v-if="loading" class="spin"></span>
          <Icon v-else name="refresh" :size="15" />
          <span>刷新</span>
        </button>
        <button class="btn btn-sm" @click="openFolder">
          <Icon name="folder-open" :size="15" />
          <span>打开文件夹</span>
        </button>
      </div>
    </header>

    <div class="scroll">
      <p v-if="dir" class="dir-line"><Icon name="folder" :size="13" /> {{ dir }}</p>

      <template v-if="items.length">
        <div class="filter-tabs">
          <button
            v-for="t in filterTabs"
            :key="t.id"
            class="filter-tab"
            :class="{ active: filter === t.id }"
            @click="filter = t.id"
          >
            {{ t.label }} <span class="ft-n">{{ t.n }}</span>
          </button>
        </div>

        <div v-if="filteredItems.length" class="grid">
          <div v-for="item in filteredItems" :key="item.path" class="g-card">
          <div class="g-wrap" @click="open(item)">
            <template v-if="item.kind === 'video'">
              <video :src="srcOf(item)" muted preload="metadata" playsinline></video>
              <div class="play-badge"><Icon name="play" :size="16" /></div>
              <span class="kind-flag"><Icon name="film" :size="11" /> 视频</span>
            </template>
            <img v-else :src="item.dataUrl" :alt="item.name" loading="lazy" />
            <div class="g-overlay"><Icon :name="item.kind === 'video' ? 'play' : 'expand'" :size="16" /></div>
          </div>
          <div class="g-foot">
            <span class="g-name" :title="item.name">{{ item.name }}</span>
            <button class="btn btn-sm btn-icon btn-ghost" title="另存为…" @click="saveAs(item)">
              <Icon name="download" :size="15" />
            </button>
          </div>
        </div>
      </div>
        <p v-else class="filter-empty">该分类暂无内容</p>
      </template>

      <div v-else-if="!loading" class="empty">
        <div class="empty-art"><Icon name="grid" :size="32" /></div>
        <p class="empty-title">画廊还是空的</p>
        <p class="empty-sub">在「生成」页保存图片或视频后会出现在这里</p>
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
.head-actions {
  display: flex;
  gap: 8px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 30px 40px;
}
.dir-line {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--text-3);
  margin: 0 0 16px;
  word-break: break-all;
}
.filter-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 18px;
}
.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 13px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  transition: background 0.14s ease, color 0.14s ease;
}
.filter-tab:hover {
  color: var(--text);
}
.filter-tab.active {
  background: var(--accent);
  color: #fff;
}
.ft-n {
  font-size: 11px;
  opacity: 0.7;
}
.filter-empty {
  margin: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}
.g-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  transition: border-color 0.16s ease;
}
.g-card:hover {
  border-color: var(--border-2);
}
.g-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-1);
}
.g-wrap img,
.g-wrap video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.play-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.kind-flag {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 4px 9px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.g-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.g-wrap:hover .g-overlay {
  opacity: 1;
}
.g-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.g-name {
  flex: 1;
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
