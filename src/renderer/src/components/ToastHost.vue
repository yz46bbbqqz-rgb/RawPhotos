<script setup>
import { toasts, dismissToast } from '../composables/useToast'
import Icon from './Icon.vue'

const iconFor = (type) => (type === 'success' ? 'check' : type === 'error' ? 'alert' : 'sparkle')
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        @click="dismissToast(t.id)"
      >
        <span class="ic"><Icon :name="iconFor(t.type)" :size="13" /></span>
        <span class="msg">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 420px;
  padding: 12px 15px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  box-shadow: var(--shadow);
  font-size: 13px;
  cursor: pointer;
}
.toast .ic {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.toast.success .ic {
  background: rgba(56, 199, 147, 0.16);
  color: var(--success);
}
.toast.error .ic {
  background: rgba(240, 82, 106, 0.16);
  color: var(--danger);
}
.toast.info .ic {
  background: var(--accent-soft);
  color: var(--accent);
}
.msg {
  line-height: 1.45;
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
