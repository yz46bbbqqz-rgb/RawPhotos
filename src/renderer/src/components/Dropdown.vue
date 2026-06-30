<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] }, // string[] 或 {value,label}[]
  placeholder: { type: String, default: '请选择' },
  size: { type: String, default: 'md' } // 'md' | 'sm'
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const open = ref(false)
const openUp = ref(false)

const norm = computed(() =>
  props.options.map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) }))
)
const selected = computed(() => norm.value.find((o) => o.value === props.modelValue) || null)
const display = computed(() =>
  selected.value ? selected.value.label : props.modelValue || props.placeholder
)
const isPlaceholder = computed(() => !selected.value && !props.modelValue)

function toggle() {
  if (!open.value) {
    const rect = root.value && root.value.getBoundingClientRect()
    // 下方空间不足（< 300px）就向上弹，避免被窗口底部/任务栏挡住选不到
    openUp.value = rect ? window.innerHeight - rect.bottom < 300 : false
  }
  open.value = !open.value
}
function pick(v) {
  emit('update:modelValue', v)
  open.value = false
}
function onDoc(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
function onKey(e) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDoc)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="dd" :class="[{ open }, `dd-${size}`]">
    <button type="button" class="dd-btn" @click="toggle">
      <span class="dd-val" :class="{ ph: isPlaceholder }">{{ display }}</span>
      <Icon name="chevron" :size="14" class="dd-chev" />
    </button>
    <Transition name="dd-fade">
      <div v-if="open" class="dd-pop" :class="{ up: openUp }">
        <button
          v-for="o in norm"
          :key="String(o.value)"
          type="button"
          class="dd-opt"
          :class="{ active: o.value === modelValue }"
          @click="pick(o.value)"
        >
          <span class="dd-opt-label">{{ o.label }}</span>
          <Icon v-if="o.value === modelValue" name="check" :size="13" />
        </button>
        <div v-if="!norm.length" class="dd-empty">无可选项</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dd {
  position: relative;
  width: 100%;
}
.dd-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13.5px;
  text-align: left;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
}
.dd-sm .dd-btn {
  height: 32px;
  font-size: 12.5px;
}
.dd-btn:hover {
  border-color: var(--border-2);
}
.dd.open .dd-btn {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--bg);
}
.dd-val {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dd-val.ph {
  color: var(--text-3);
}
.dd-chev {
  flex-shrink: 0;
  color: var(--text-3);
  transform: rotate(90deg);
  transition: transform 0.16s ease;
}
.dd.open .dd-chev {
  transform: rotate(-90deg);
  color: var(--accent);
}
.dd-pop {
  position: absolute;
  z-index: 50;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
.dd-pop.up {
  top: auto;
  bottom: calc(100% + 6px);
}
.dd-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.dd-opt:hover {
  background: var(--surface-2);
  color: var(--text);
}
.dd-opt.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.dd-opt-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dd-empty {
  padding: 10px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}
.dd-fade-enter-active,
.dd-fade-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.dd-fade-enter-from,
.dd-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
