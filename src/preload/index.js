import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testConnection: (provider) => ipcRenderer.invoke('connection:test', provider),
  listModels: (provider) => ipcRenderer.invoke('models:list', provider),
  generateImage: (payload) => ipcRenderer.invoke('image:generate', payload),
  editImage: (payload) => ipcRenderer.invoke('image:edit', payload),
  generateVideo: (payload) => ipcRenderer.invoke('video:generate', payload),
  optimizePrompt: (payload) => ipcRenderer.invoke('prompt:optimize', payload),
  chatSend: (payload) => ipcRenderer.invoke('chat:send', payload),
  chatAbort: () => ipcRenderer.invoke('chat:abort'),
  chatsList: () => ipcRenderer.invoke('chats:list'),
  chatsGet: (id) => ipcRenderer.invoke('chats:get', id),
  chatsSave: (conv) => ipcRenderer.invoke('chats:save', conv),
  chatsDelete: (id) => ipcRenderer.invoke('chats:delete', id),
  saveMedia: (payload) => ipcRenderer.invoke('media:save', payload),
  saveMediaAs: (payload) => ipcRenderer.invoke('media:saveAs', payload),
  listGallery: () => ipcRenderer.invoke('gallery:list'),
  pickDir: () => ipcRenderer.invoke('app:pickDir'),
  openPath: (target) => ipcRenderer.invoke('app:openPath', target),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  saveTextFile: (payload) => ipcRenderer.invoke('file:saveText', payload),
  quitApp: () => ipcRenderer.send('app:quit'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  defaultSaveDir: () => ipcRenderer.invoke('app:defaultSaveDir'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  openLogFile: () => ipcRenderer.invoke('logs:openFile'),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  resetUsage: () => ipcRenderer.invoke('usage:reset'),
  getQuota: (provider) => ipcRenderer.invoke('quota:get', provider),
  onLog: (cb) => {
    const handler = (_e, entry) => cb(entry)
    ipcRenderer.on('logs:new', handler)
    return () => ipcRenderer.removeListener('logs:new', handler)
  },
  // 把本地绝对路径转成可被 <img>/<video> 加载的自定义协议地址（纯字符串拼接，不走 IPC）
  mediaUrl: (absPath) => `rawmedia://media/?p=${encodeURIComponent(absPath)}`,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximizeToggle: () => ipcRenderer.send('window:maximizeToggle'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onState: (cb) => {
      const handler = (_e, state) => cb(state)
      ipcRenderer.on('window:state', handler)
      return () => ipcRenderer.removeListener('window:state', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
