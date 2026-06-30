<script setup>
import { computed, ref } from 'vue'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'

const props = defineProps({
  item: { type: Object, required: true }
})
const emit = defineEmits(['zoom'])

const saving = ref(false)
const isVideo = computed(() => props.item.kind === 'video')

const src = computed(() => {
  if (props.item.b64) {
    const mime = isVideo.value ? 'video/mp4' : 'image/png'
    return `data:${mime};base64,${props.item.b64}`
  }
  return props.item.url || ''
})

async function save() {
  saving.value = true
  try {
    const res = await window.api.saveMedia({
      b64: props.item.b64,
      url: props.item.url,
      kind: props.item.kind,
      ext: isVideo.value ? 'mp4' : 'png'
    })
    props.item.saved = true
    toast.success(`已保存到 ${res.dir}`)
  } catch (err) {
    toast.error(`保存失败：${err.message}`)
  } finally {
    saving.value = false
  }
}

async function saveAs() {
  try {
    const res = await window.api.saveMediaAs({
      b64: props.item.b64,
      url: props.item.url,
      kind: props.item.kind,
      ext: isVideo.value ? 'mp4' : 'png'
    })
    if (!res.canceled) toast.success(`已另存为 ${res.path}`)
  } catch (err) {
    toast.error(`保存失败：${err.message}`)
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(props.item.prompt || '')
    toast.success('提示词已复制')
  } catch {
    toast.error('复制失败')
  }
}
</script>

<template>
  <div class="media-card">
    <div class="media-wrap" @click="emit('zoom', { src, kind: item.kind })">
      <template v-if="isVideo">
        <video :src="src" muted preload="metadata" playsinline></video>
        <div class="play-badge"><Icon name="play" :size="18" /></div>
      </template>
      <img v-else :src="src" :alt="item.prompt" loading="lazy" />
      <div class="overlay">
        <span class="zoom-hint">
          <Icon :name="isVideo ? 'play' : 'expand'" :size="14" /> {{ isVideo ? '播放' : '查看大图' }}
        </span>
      </div>
      <span v-if="item.saved" class="saved-flag"><Icon name="check" :size="12" /> 已保存</span>
      <span v-if="isVideo" class="kind-flag"><Icon name="film" :size="11" /> 视频</span>
    </div>

    <div class="actions">
      <button class="btn btn-sm btn-primary save-btn" :disabled="saving" @click="save">
        <span v-if="saving" class="spin"></span>
        <Icon v-else name="save" :size="14" />
        <span>保存</span>
      </button>
      <button class="btn btn-sm btn-icon" title="另存为…" @click="saveAs"><Icon name="download" :size="15" /></button>
      <button class="btn btn-sm btn-icon" title="复制提示词" @click="copyPrompt"><Icon name="copy" :size="15" /></button>
    </div>

    <p v-if="item.revisedPrompt" class="revised" :title="item.revisedPrompt">
      {{ item.revisedPrompt }}
    </p>
  </div>
</template>

<style scoped>
.media-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 9px;
  transition: border-color 0.16s ease;
}
.media-card:hover {
  border-color: var(--border-2);
}
.media-wrap {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-1);
}
.media-wrap img,
.media-wrap video {
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
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: end center;
  padding-bottom: 12px;
  background: linear-gradient(180deg, transparent 55%, rgba(0, 0, 0, 0.6));
  opacity: 0;
  transition: opacity 0.18s ease;
}
.media-wrap:hover .overlay {
  opacity: 1;
}
.zoom-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 6px 12px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.saved-flag {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(56, 199, 147, 0.92);
  padding: 4px 9px;
  border-radius: 999px;
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
.actions {
  display: flex;
  gap: 6px;
}
.save-btn {
  flex: 1;
}
.revised {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
