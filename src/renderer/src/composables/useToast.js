import { reactive } from 'vue'

let seed = 0
export const toasts = reactive([])

export function pushToast(message, type = 'info', timeout = 3200) {
  const id = ++seed
  toasts.push({ id, message, type })
  if (timeout > 0) {
    setTimeout(() => dismissToast(id), timeout)
  }
  return id
}

export function dismissToast(id) {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

export const toast = {
  info: (m, t) => pushToast(m, 'info', t),
  success: (m, t) => pushToast(m, 'success', t),
  error: (m, t) => pushToast(m, 'error', t ?? 5000)
}
