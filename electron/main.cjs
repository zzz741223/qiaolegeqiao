const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  shell,
  systemPreferences,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { uIOhook, UiohookKey } = require('uiohook-napi')
const { LanService } = require('./lan-service.cjs')
const {
  MAC_KEYBOARD_PERMISSION_ERROR,
  createKeyboardAccessState,
  loginItemSettings,
  macPrivacySettingsUrl,
} = require('./platform-support.cjs')

const APP_NAME = '敲了个敲'
const STATS_FILE = 'keyboard-stats.json'
const SAVE_DELAY_MS = 1200
const ACTIVE_WINDOW_MS = 5000
const ROLLING_WINDOW_MS = 60000
const IS_MAC = process.platform === 'darwin'

app.setName(APP_NAME)
const devProfile = String(process.env.QIAO_DEV_PROFILE || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
app.setPath(
  'userData',
  app.isPackaged
    ? path.join(app.getPath('appData'), APP_NAME)
    : path.join(__dirname, '..', devProfile ? `.dev-user-data-${devProfile}` : '.dev-user-data'),
)

const petSizes = {
  small: { width: 210, height: 250 },
  medium: { width: 270, height: 320 },
  large: { width: 340, height: 395 },
}

const defaultPreferences = {
  displayName: '工位一号',
  avatarId: 'spark',
  themeId: 'office',
  soundEnabled: false,
  petAlwaysOnTop: true,
  petSize: 'medium',
  launchAtStartup: false,
  lanEnabled: false,
  petPosition: null,
}

let petWindow = null
let dashboardWindow = null
let pendingDashboardView = ''
let tray = null
let isQuitting = false
let hookRunning = false
let hookAvailable = true
let hookError = ''
let macKeyboardPermissionGranted = !IS_MAC
let waitingForMacKeyboardPermission = false
let saveTimer = null
let broadcastTimer = null
let lastKeyAt = 0
let recentKeyTimes = []
let lanService = null
const pressedKeys = new Set()

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyDay(date = new Date()) {
  return {
    date: localDateKey(date),
    keystrokes: 0,
    activeSeconds: 0,
    peakKpm: 0,
    hourly: Array(24).fill(0),
  }
}

function createDefaultState() {
  return {
    version: 3,
    trackingEnabled: true,
    totalKeystrokes: 0,
    today: createEmptyDay(),
    history: [],
    preferences: { ...defaultPreferences },
    lan: {
      instanceId: randomUUID(),
      buddies: [],
    },
  }
}

let statsState = createDefaultState()

function statsPath() {
  return path.join(app.getPath('userData'), STATS_FILE)
}

function sanitizeDay(day, fallbackDate) {
  return {
    date: typeof day?.date === 'string' ? day.date : fallbackDate,
    keystrokes: Number.isFinite(day?.keystrokes) ? Math.max(0, day.keystrokes) : 0,
    activeSeconds: Number.isFinite(day?.activeSeconds) ? Math.max(0, day.activeSeconds) : 0,
    peakKpm: Number.isFinite(day?.peakKpm) ? Math.max(0, day.peakKpm) : 0,
    hourly: Array.from({ length: 24 }, (_, index) => {
      const value = day?.hourly?.[index]
      return Number.isFinite(value) ? Math.max(0, value) : 0
    }),
  }
}

function sanitizeBuddy(buddy) {
  if (!buddy || typeof buddy.id !== 'string' || !buddy.id.trim()) return null
  return {
    id: buddy.id.trim().slice(0, 64),
    name: typeof buddy.name === 'string' ? buddy.name.trim().slice(0, 18) || '常用搭子' : '常用搭子',
    avatarId: ['spark', 'rice', 'lamp', 'cloud'].includes(buddy.avatarId) ? buddy.avatarId : 'spark',
    addedAt: Number.isFinite(buddy.addedAt) ? buddy.addedAt : Date.now(),
  }
}

function sanitizeLanState(lan) {
  return {
    instanceId: typeof lan?.instanceId === 'string' && lan.instanceId.trim()
      ? lan.instanceId.trim().slice(0, 64)
      : randomUUID(),
    buddies: Array.isArray(lan?.buddies)
      ? lan.buddies.map(sanitizeBuddy).filter(Boolean).slice(0, 100)
      : [],
  }
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statsPath(), 'utf8'))
    statsState = {
      ...createDefaultState(),
      ...parsed,
      today: sanitizeDay(parsed.today, localDateKey()),
      history: Array.isArray(parsed.history)
        ? parsed.history.slice(0, 365).map((day) => sanitizeDay(day, day?.date || localDateKey()))
        : [],
      preferences: { ...defaultPreferences, ...parsed.preferences },
      lan: sanitizeLanState(parsed.lan),
    }
  } catch {
    statsState = createDefaultState()
  }
  ensureCurrentDay()
}

function persistState() {
  try {
    fs.mkdirSync(path.dirname(statsPath()), { recursive: true })
    const nextPath = `${statsPath()}.tmp`
    fs.writeFileSync(nextPath, JSON.stringify(statsState, null, 2), 'utf8')
    fs.renameSync(nextPath, statsPath())
  } catch (error) {
    console.error('Failed to persist keyboard statistics:', error)
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistState()
  }, SAVE_DELAY_MS)
}

function ensureCurrentDay() {
  const todayKey = localDateKey()
  if (statsState.today.date === todayKey) return

  if (statsState.today.keystrokes > 0 || statsState.today.activeSeconds > 0) {
    statsState.history = [statsState.today, ...statsState.history]
      .filter((day, index, days) => days.findIndex((candidate) => candidate.date === day.date) === index)
      .slice(0, 365)
  }
  statsState.today = createEmptyDay()
  recentKeyTimes = []
  scheduleSave()
}

function currentKpm(now = Date.now()) {
  recentKeyTimes = recentKeyTimes.filter((time) => now - time <= ROLLING_WINDOW_MS)
  if (recentKeyTimes.length === 0) return 0
  const observedMs = Math.max(1000, Math.min(ROLLING_WINDOW_MS, now - recentKeyTimes[0]))
  return Math.round((recentKeyTimes.length * ROLLING_WINDOW_MS) / observedMs)
}

function snapshot() {
  ensureCurrentDay()
  if (IS_MAC) {
    try {
      macKeyboardPermissionGranted = systemPreferences.isTrustedAccessibilityClient(false)
    } catch {
      macKeyboardPermissionGranted = false
    }
  }
  const kpm = currentKpm()
  return {
    trackingEnabled: statsState.trackingEnabled,
    hookAvailable,
    hookError,
    keyboardAccess: createKeyboardAccessState(process.platform, macKeyboardPermissionGranted),
    currentKpm: kpm,
    currentWpm: Math.round(kpm / 5),
    isTyping: statsState.trackingEnabled && Boolean(lastKeyAt) && Date.now() - lastKeyAt <= ACTIVE_WINDOW_MS,
    totalKeystrokes: statsState.totalKeystrokes,
    today: statsState.today,
    history: statsState.history,
    preferences: statsState.preferences,
  }
}

function send(channel, payload) {
  for (const window of [petWindow, dashboardWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function broadcastSnapshot() {
  send('stats:update', snapshot())
}

function lanProfile() {
  return {
    id: statsState.lan.instanceId,
    name: statsState.preferences.displayName,
    avatarId: statsState.preferences.avatarId,
  }
}

function lanMetrics() {
  const now = Date.now()
  return {
    todayKeystrokes: statsState.today.keystrokes,
    currentKpm: currentKpm(now),
    isTyping: statsState.trackingEnabled && Boolean(lastKeyAt) && now - lastKeyAt <= ACTIVE_WINDOW_MS,
  }
}

function lanSnapshot() {
  if (!lanService) {
    return {
      enabled: false,
      available: false,
      error: '',
      connectionNote: '',
      selfId: statsState.lan.instanceId,
      port: 0,
      peers: [],
      buddies: statsState.lan.buddies,
      room: null,
    }
  }
  return lanService.snapshot(statsState.lan.buddies)
}

function broadcastLanSnapshot() {
  send('lan:update', lanSnapshot())
}

function countKeystroke() {
  if (!statsState.trackingEnabled) return
  ensureCurrentDay()

  const now = Date.now()
  lastKeyAt = now
  recentKeyTimes.push(now)
  recentKeyTimes = recentKeyTimes.filter((time) => now - time <= ROLLING_WINDOW_MS)

  statsState.today.keystrokes += 1
  statsState.today.hourly[new Date(now).getHours()] += 1
  statsState.totalKeystrokes += 1
  const kpm = currentKpm(now)
  statsState.today.peakKpm = Math.max(statsState.today.peakKpm, kpm)
  lanService?.recordKeystroke(kpm)

  send('keyboard:pulse', { at: now, currentKpm: kpm })
  scheduleBroadcast()
  scheduleSave()
}

function scheduleBroadcast() {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    broadcastSnapshot()
  }, 80)
}

const ignoredKeys = new Set([
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
  UiohookKey.CapsLock,
  UiohookKey.NumLock,
  UiohookKey.ScrollLock,
  UiohookKey.PrintScreen,
])

uIOhook.on('keydown', (event) => {
  if (pressedKeys.has(event.keycode)) return
  pressedKeys.add(event.keycode)
  if (!ignoredKeys.has(event.keycode)) countKeystroke()
})

uIOhook.on('keyup', (event) => {
  pressedKeys.delete(event.keycode)
})

function startHook({ promptForPermission = false } = {}) {
  if (hookRunning || !statsState.trackingEnabled) return
  if (IS_MAC) {
    try {
      macKeyboardPermissionGranted = systemPreferences.isTrustedAccessibilityClient(promptForPermission)
    } catch {
      macKeyboardPermissionGranted = false
    }
    if (!macKeyboardPermissionGranted) {
      hookAvailable = false
      hookError = MAC_KEYBOARD_PERMISSION_ERROR
      waitingForMacKeyboardPermission = true
      broadcastSnapshot()
      return
    }
  }
  try {
    uIOhook.start()
    hookRunning = true
    hookAvailable = true
    hookError = ''
    waitingForMacKeyboardPermission = false
  } catch (error) {
    hookAvailable = false
    hookError = error instanceof Error ? error.message : String(error)
    console.error('Global keyboard hook failed:', error)
  }
  broadcastSnapshot()
}

function stopHook() {
  if (!hookRunning) return
  try {
    uIOhook.stop()
  } catch (error) {
    console.error('Global keyboard hook stop failed:', error)
  }
  hookRunning = false
  pressedKeys.clear()
  recentKeyTimes = []
}

function toggleTracking(forceValue) {
  const nextValue = typeof forceValue === 'boolean' ? forceValue : !statsState.trackingEnabled
  statsState.trackingEnabled = nextValue
  if (nextValue) startHook({ promptForPermission: IS_MAC })
  else stopHook()
  scheduleSave()
  refreshTrayMenu()
  broadcastSnapshot()
  return snapshot()
}

function requestKeyboardAccess() {
  if (!IS_MAC) return snapshot()
  if (hookRunning) stopHook()
  startHook({ promptForPermission: true })
  return snapshot()
}

function openKeyboardSettings(section) {
  if (!IS_MAC) return
  const target = section === 'input-monitoring' ? 'input-monitoring' : 'accessibility'
  shell.openExternal(macPrivacySettingsUrl(target))
}

function relaunchApp() {
  if (!app.isPackaged) return
  isQuitting = true
  app.relaunch()
  app.quit()
}

function devUrl(mode) {
  const base = process.env.VITE_DEV_SERVER_URL
  return mode ? `${base}?mode=${mode}` : base
}

function loadRenderer(window, mode) {
  if (process.env.VITE_DEV_SERVER_URL) return window.loadURL(devUrl(mode))
  return window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
    query: mode ? { mode } : undefined,
  })
}

function safePetPosition(size) {
  const saved = statsState.preferences.petPosition
  const displays = screen.getAllDisplays()
  if (saved && displays.some(({ workArea }) => (
    saved.x < workArea.x + workArea.width - 60
    && saved.x + size.width > workArea.x + 60
    && saved.y < workArea.y + workArea.height - 60
    && saved.y + size.height > workArea.y + 60
  ))) return saved

  const workArea = screen.getPrimaryDisplay().workArea
  return {
    x: workArea.x + workArea.width - size.width - 24,
    y: workArea.y + workArea.height - size.height - 24,
  }
}

function createPetWindow() {
  const size = petSizes[statsState.preferences.petSize] || petSizes.medium
  const position = safePetPosition(size)
  petWindow = new BrowserWindow({
    ...size,
    ...position,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    alwaysOnTop: statsState.preferences.petAlwaysOnTop,
    backgroundColor: '#00000000',
    title: `${APP_NAME}桌面宠物`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setAlwaysOnTop(statsState.preferences.petAlwaysOnTop, 'floating')
  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return
    const [x, y] = petWindow.getPosition()
    statsState.preferences.petPosition = { x, y }
    scheduleSave()
  })
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      petWindow.hide()
    }
  })
  petWindow.webContents.on('context-menu', () => showPetMenu())
  petWindow.once('ready-to-show', () => petWindow.showInactive())
  loadRenderer(petWindow, 'pet')
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#edf0f2',
    title: `${APP_NAME} · 数据面板`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  dashboardWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      dashboardWindow.hide()
    }
  })
  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show()
    if (pendingDashboardView) {
      dashboardWindow.webContents.send('dashboard:navigate', pendingDashboardView)
      pendingDashboardView = ''
    }
  })
  loadRenderer(dashboardWindow)
}

function openDashboard(view = '') {
  if (view === 'neighbors') pendingDashboardView = view
  if (!dashboardWindow || dashboardWindow.isDestroyed()) createDashboardWindow()
  else {
    dashboardWindow.show()
    dashboardWindow.focus()
    dashboardWindow.webContents.send('stats:update', snapshot())
    if (pendingDashboardView) {
      dashboardWindow.webContents.send('dashboard:navigate', pendingDashboardView)
      pendingDashboardView = ''
    }
  }
}

function setPetSize(sizeKey) {
  const size = petSizes[sizeKey]
  if (!size) return
  statsState.preferences.petSize = sizeKey
  statsState.preferences.petPosition = null
  if (petWindow && !petWindow.isDestroyed()) {
    const position = safePetPosition(size)
    petWindow.setBounds({ ...size, ...position }, true)
  }
  scheduleSave()
  refreshTrayMenu()
  broadcastSnapshot()
}

function updatePreferences(nextPreferences) {
  const previousSize = statsState.preferences.petSize
  const previousLanEnabled = statsState.preferences.lanEnabled
  statsState.preferences = { ...statsState.preferences, ...nextPreferences }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setAlwaysOnTop(statsState.preferences.petAlwaysOnTop, 'floating')
  }
  if (nextPreferences.petSize && nextPreferences.petSize !== previousSize) {
    setPetSize(nextPreferences.petSize)
  }
  if (typeof nextPreferences.launchAtStartup === 'boolean' && app.isPackaged) {
    app.setLoginItemSettings(loginItemSettings(process.platform, nextPreferences.launchAtStartup, process.execPath))
  }
  if (typeof nextPreferences.lanEnabled === 'boolean' && nextPreferences.lanEnabled !== previousLanEnabled) {
    if (nextPreferences.lanEnabled) lanService?.start()
    else lanService?.stop()
  }
  if (nextPreferences.displayName || nextPreferences.avatarId) lanService?.profileChanged()
  scheduleSave()
  refreshTrayMenu()
  broadcastSnapshot()
  return snapshot()
}

function toggleBuddy(peerId) {
  if (typeof peerId !== 'string') throw new Error('工友身份无效')
  const normalizedId = peerId.trim().slice(0, 64)
  const existingIndex = statsState.lan.buddies.findIndex((buddy) => buddy.id === normalizedId)
  if (existingIndex >= 0) {
    statsState.lan.buddies.splice(existingIndex, 1)
  } else {
    const peer = lanSnapshot().peers.find((candidate) => candidate.id === normalizedId)
    if (!peer) throw new Error('这位工友已经离开附近')
    statsState.lan.buddies.unshift({
      id: peer.id,
      name: peer.name,
      avatarId: peer.avatarId,
      addedAt: Date.now(),
    })
    statsState.lan.buddies = statsState.lan.buddies.slice(0, 100)
  }
  scheduleSave()
  broadcastLanSnapshot()
  return lanSnapshot()
}

function clearStatistics() {
  statsState.totalKeystrokes = 0
  statsState.today = createEmptyDay()
  statsState.history = []
  recentKeyTimes = []
  lastKeyAt = 0
  persistState()
  broadcastSnapshot()
  return snapshot()
}

function menuTemplate() {
  const preferences = statsState.preferences
  return [
    { label: '打开数据面板', click: openDashboard },
    { label: '附近工友与工位房', click: () => openDashboard('neighbors') },
    { label: petWindow?.isVisible() ? '隐藏桌面宠物' : '显示桌面宠物', click: () => petWindow?.isVisible() ? petWindow.hide() : petWindow.showInactive() },
    { type: 'separator' },
    { label: '检测全局键盘', type: 'checkbox', checked: statsState.trackingEnabled, click: (item) => toggleTracking(item.checked) },
    ...(IS_MAC
      ? [{
        label: 'Mac 键盘权限',
        submenu: [
          { label: '重新检测', click: requestKeyboardAccess },
          { label: '打开辅助功能设置', click: () => openKeyboardSettings('accessibility') },
          { label: '打开输入监控设置', click: () => openKeyboardSettings('input-monitoring') },
          { label: '重启应用', click: relaunchApp },
        ],
      }]
      : []),
    { label: '同 WiFi 可见', type: 'checkbox', checked: preferences.lanEnabled, click: (item) => updatePreferences({ lanEnabled: item.checked }) },
    { label: '始终置顶', type: 'checkbox', checked: preferences.petAlwaysOnTop, click: (item) => updatePreferences({ petAlwaysOnTop: item.checked }) },
    {
      label: '宠物大小',
      submenu: Object.keys(petSizes).map((size) => ({
        label: { small: '小', medium: '中', large: '大' }[size],
        type: 'radio',
        checked: preferences.petSize === size,
        click: () => setPetSize(size),
      })),
    },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]
}

function showPetMenu() {
  Menu.buildFromTemplate(menuTemplate()).popup({ window: petWindow })
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'app-icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 })
  tray = new Tray(icon)
  tray.setToolTip(`${APP_NAME} · ${statsState.trackingEnabled ? '正在统计' : '已暂停'}`)
  tray.on('double-click', openDashboard)
  refreshTrayMenu()
}

ipcMain.handle('stats:get', () => snapshot())
ipcMain.handle('tracking:toggle', (_event, value) => toggleTracking(value))
ipcMain.handle('keyboard:permission-request', () => requestKeyboardAccess())
ipcMain.handle('keyboard:settings-open', (_event, section) => openKeyboardSettings(section))
ipcMain.handle('app:relaunch', () => relaunchApp())
ipcMain.handle('preferences:update', (_event, preferences) => updatePreferences(preferences || {}))
ipcMain.handle('statistics:clear', () => clearStatistics())
ipcMain.handle('dashboard:open', (_event, view) => openDashboard(view))
ipcMain.handle('pet:menu', () => showPetMenu())
ipcMain.handle('lan:get', () => lanSnapshot())
ipcMain.handle('lan:toggle', async (_event, enabled) => {
  statsState.preferences.lanEnabled = Boolean(enabled)
  if (statsState.preferences.lanEnabled) await lanService?.start()
  else await lanService?.stop()
  scheduleSave()
  refreshTrayMenu()
  broadcastSnapshot()
  return lanSnapshot()
})
ipcMain.handle('lan:room-create', (_event, durationMinutes) => {
  lanService?.createRoom(durationMinutes)
  return lanSnapshot()
})
ipcMain.handle('lan:room-join', async (_event, target) => {
  await lanService?.joinRoom(target)
  return lanSnapshot()
})
ipcMain.handle('lan:room-start', () => {
  lanService?.startRoom()
  return lanSnapshot()
})
ipcMain.handle('lan:room-leave', () => {
  lanService?.leaveRoom()
  return lanSnapshot()
})
ipcMain.handle('lan:buddy-toggle', (_event, peerId) => toggleBuddy(peerId))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.whenReady().then(() => {
  loadState()
  lanService = new LanService({ getProfile: lanProfile, getMetrics: lanMetrics, onChange: broadcastLanSnapshot })
  createPetWindow()
  createTray()
  if (IS_MAC) {
    macKeyboardPermissionGranted = systemPreferences.isTrustedAccessibilityClient(false)
  }
  startHook({ promptForPermission: IS_MAC })
  if (statsState.preferences.lanEnabled) lanService.start()

  setInterval(() => {
    ensureCurrentDay()
    if (statsState.trackingEnabled && lastKeyAt && Date.now() - lastKeyAt <= ACTIVE_WINDOW_MS) {
      statsState.today.activeSeconds += 1
      scheduleSave()
    }
    const kpm = currentKpm()
    if (IS_MAC && waitingForMacKeyboardPermission && systemPreferences.isTrustedAccessibilityClient(false)) {
      startHook()
    }
    broadcastSnapshot()
    lanService?.tick(kpm)
  }, 1000)

  app.on('activate', () => {
    if (!petWindow || petWindow.isDestroyed()) createPetWindow()
    petWindow.showInactive()
  })
})

app.on('second-instance', () => {
  openDashboard()
})

app.on('before-quit', () => {
  isQuitting = true
  lanService?.stop()
  stopHook()
  persistState()
})

app.on('window-all-closed', () => {
  // The tray and global keyboard counter keep running until the user chooses Exit.
})
