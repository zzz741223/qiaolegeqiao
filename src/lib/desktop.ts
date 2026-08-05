import { useCallback, useEffect, useState } from 'react'
import type { AppView, GlobalStatsSnapshot, KeyboardPulse, LanSnapshot, UserPreferences } from '../types'

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const fallbackSnapshot: GlobalStatsSnapshot = {
  trackingEnabled: true,
  hookAvailable: false,
  hookError: '',
  keyboardAccess: {
    required: false,
    granted: true,
    canRequest: false,
  },
  currentKpm: 0,
  currentWpm: 0,
  isTyping: false,
  totalKeystrokes: 0,
  today: {
    date: localDateKey(),
    keystrokes: 0,
    activeSeconds: 0,
    peakKpm: 0,
    hourly: Array(24).fill(0),
  },
  history: [],
  preferences: {
    displayName: '工位一号',
    avatarId: 'spark',
    themeId: 'office',
    soundEnabled: false,
    petAlwaysOnTop: true,
    petSize: 'medium',
    launchAtStartup: false,
    lanEnabled: false,
    petPosition: null,
  },
}

export const fallbackLanSnapshot: LanSnapshot = {
  enabled: false,
  available: false,
  error: '',
  connectionNote: '',
  selfId: 'browser-preview',
  port: 0,
  peers: [],
  buddies: [],
  room: null,
}

export function useDesktopStats() {
  const [stats, setStats] = useState<GlobalStatsSnapshot>(fallbackSnapshot)
  const [pulse, setPulse] = useState<KeyboardPulse | null>(null)

  useEffect(() => {
    let pulseTimer: number | undefined
    const showPulse = (nextPulse: KeyboardPulse) => {
      setPulse(nextPulse)
      if (pulseTimer) window.clearTimeout(pulseTimer)
      pulseTimer = window.setTimeout(() => setPulse(null), 760)
    }

    if (window.desktop?.isElectron) {
      window.desktop.getStats().then(setStats)
      const removeStats = window.desktop.onStats(setStats)
      const removePulse = window.desktop.onKeystroke(showPulse)
      return () => {
        if (pulseTimer) window.clearTimeout(pulseTimer)
        removeStats()
        removePulse()
      }
    }

    let recentTimes: number[] = []
    const handlePreviewKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      const now = Date.now()
      recentTimes = [...recentTimes.filter((time) => now - time <= 60000), now]
      const observedMs = Math.max(1000, Math.min(60000, now - recentTimes[0]))
      const kpm = Math.round((recentTimes.length * 60000) / observedMs)
      showPulse({ at: now, currentKpm: kpm })
      setStats((current) => {
        const hourly = current.today.hourly.slice()
        hourly[new Date().getHours()] += 1
        return {
          ...current,
          currentKpm: kpm,
          currentWpm: Math.round(kpm / 5),
          isTyping: true,
          totalKeystrokes: current.totalKeystrokes + 1,
          today: {
            ...current.today,
            keystrokes: current.today.keystrokes + 1,
            peakKpm: Math.max(current.today.peakKpm, kpm),
            hourly,
          },
        }
      })
    }
    window.addEventListener('keydown', handlePreviewKey)
    return () => {
      if (pulseTimer) window.clearTimeout(pulseTimer)
      window.removeEventListener('keydown', handlePreviewKey)
    }
  }, [])

  const toggleTracking = useCallback(async (enabled?: boolean) => {
    if (window.desktop?.isElectron) {
      const next = await window.desktop.toggleTracking(enabled)
      setStats(next)
      return
    }
    setStats((current) => ({
      ...current,
      trackingEnabled: typeof enabled === 'boolean' ? enabled : !current.trackingEnabled,
      currentKpm: 0,
      currentWpm: 0,
      isTyping: false,
    }))
  }, [])

  const requestKeyboardPermission = useCallback(async () => {
    if (!window.desktop?.isElectron) return
    const next = await window.desktop.requestKeyboardPermission()
    setStats(next)
  }, [])

  const openKeyboardSettings = useCallback((section?: 'accessibility' | 'input-monitoring') => {
    window.desktop?.openKeyboardSettings(section)
  }, [])

  const relaunch = useCallback(() => {
    window.desktop?.relaunch()
  }, [])

  const updatePreferences = useCallback(async (preferences: Partial<UserPreferences>) => {
    if (window.desktop?.isElectron) {
      const next = await window.desktop.updatePreferences(preferences)
      setStats(next)
      return
    }
    setStats((current) => ({
      ...current,
      preferences: { ...current.preferences, ...preferences },
    }))
  }, [])

  const clearStatistics = useCallback(async () => {
    if (window.desktop?.isElectron) {
      const next = await window.desktop.clearStatistics()
      setStats(next)
      return
    }
    setStats((current) => ({
      ...fallbackSnapshot,
      hookAvailable: current.hookAvailable,
      preferences: current.preferences,
    }))
  }, [])

  const openDashboard = useCallback((view?: AppView) => {
    window.desktop?.openDashboard(view)
  }, [])

  return {
    stats,
    pulse,
    toggleTracking,
    requestKeyboardPermission,
    openKeyboardSettings,
    relaunch,
    updatePreferences,
    clearStatistics,
    openDashboard,
  }
}

function actionError(error: unknown): string {
  if (!(error instanceof Error)) return '操作失败，请稍后重试'
  return error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

export function useLanState() {
  const [lan, setLan] = useState<LanSnapshot>(fallbackLanSnapshot)

  useEffect(() => {
    if (!window.desktop?.isElectron) return
    window.desktop.getLan().then(setLan)
    return window.desktop.onLan(setLan)
  }, [])

  const run = useCallback(async (action: () => Promise<LanSnapshot>) => {
    try {
      const next = await action()
      setLan(next)
      return { ok: true as const, state: next }
    } catch (error) {
      return { ok: false as const, message: actionError(error) }
    }
  }, [])

  const unavailable = useCallback(async () => ({
    ok: false as const,
    message: '附近工友需要在 Electron 桌面版中使用',
  }), [])

  return {
    lan,
    toggleLan: (enabled: boolean) => window.desktop ? run(() => window.desktop!.toggleLan(enabled)) : unavailable(),
    createRoom: (duration: number) => window.desktop ? run(() => window.desktop!.createRoom(duration)) : unavailable(),
    joinRoom: (target: string) => window.desktop ? run(() => window.desktop!.joinRoom(target)) : unavailable(),
    startRoom: () => window.desktop ? run(() => window.desktop!.startRoom()) : unavailable(),
    leaveRoom: () => window.desktop ? run(() => window.desktop!.leaveRoom()) : unavailable(),
    toggleBuddy: (peerId: string) => window.desktop ? run(() => window.desktop!.toggleBuddy(peerId)) : unavailable(),
  }
}
