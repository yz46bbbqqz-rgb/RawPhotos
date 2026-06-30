<script setup>
defineProps({
  src: { type: String, default: '' },
  kind: { type: String, default: 'image' }
})
const emit = defineEmits(['close'])
</script>

<template>
  <Transition name="fade">
    <div v-if="src" class="lightbox" @click.self="emit('close')">
      <video v-if="kind === 'video'" :src="src" class="media" controls autoplay loop @click.stop></video>
      <img v-else :src="src" class="media" alt="预览" />
      <button class="close" @click="emit('close')">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(5, 6, 10, 0.86);
  display: grid;
  place-items: center;
  padding: 48px;
  backdrop-filter: blur(6px);
}
.media {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: 12px;
  box-shadow: var(--shadow);
  object-fit: contain;
}
.close {
  position: absolute;
  top: 22px;
  right: 26px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  color: #fff;
  font-size: 17px;
}
.close:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
