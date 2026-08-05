const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  getStats: () => ipcRenderer.invoke('stats:get'),
  toggleTracking: (enabled) => ipcRenderer.invoke('tracking:toggle', enabled),
  requestKeyboardPermission: () => ipcRenderer.invoke('keyboard:permission-request'),
  openKeyboardSettings: (section) => ipcRenderer.invoke('keyboard:settings-open', section),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  updatePreferences: (preferences) => ipcRenderer.invoke('preferences:update', preferences),
  clearStatistics: () => ipcRenderer.invoke('statistics:clear'),
  openDashboard: (view) => ipcRenderer.invoke('dashboard:open', view),
  openPetMenu: () => ipcRenderer.invoke('pet:menu'),
  getLan: () => ipcRenderer.invoke('lan:get'),
  toggleLan: (enabled) => ipcRenderer.invoke('lan:toggle', enabled),
  createRoom: (durationMinutes) => ipcRenderer.invoke('lan:room-create', durationMinutes),
  joinRoom: (target) => ipcRenderer.invoke('lan:room-join', target),
  startRoom: () => ipcRenderer.invoke('lan:room-start'),
  leaveRoom: () => ipcRenderer.invoke('lan:room-leave'),
  toggleBuddy: (peerId) => ipcRenderer.invoke('lan:buddy-toggle', peerId),
  onStats: (listener) => {
    const handler = (_event, stats) => listener(stats)
    ipcRenderer.on('stats:update', handler)
    return () => ipcRenderer.removeListener('stats:update', handler)
  },
  onKeystroke: (listener) => {
    const handler = (_event, pulse) => listener(pulse)
    ipcRenderer.on('keyboard:pulse', handler)
    return () => ipcRenderer.removeListener('keyboard:pulse', handler)
  },
  onLan: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('lan:update', handler)
    return () => ipcRenderer.removeListener('lan:update', handler)
  },
  onNavigate: (listener) => {
    const handler = (_event, view) => listener(view)
    ipcRenderer.on('dashboard:navigate', handler)
    return () => ipcRenderer.removeListener('dashboard:navigate', handler)
  },
})
