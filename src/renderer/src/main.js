import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles.css'

// 挂载前先按上次主题着色，避免首屏闪一下默认色（真正的持久化在 settings.json）
try {
  document.documentElement.dataset.theme = localStorage.getItem('rawphotos-theme') || 'sky'
} catch {
  // localStorage 不可用时忽略，loadSettings 仍会应用主题
}

createApp(App).mount('#app')
