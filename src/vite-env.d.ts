/// <reference types="vite/client" />

import type { AppView, GlobalStatsSnapshot, KeyboardPulse, LanSnapshot, UserPreferences } from './types'

declare global {
  interface Window {
    desktop?: {
      isElectron: boolean
      platform: string
      getStats: () => Promise<GlobalStatsSnapshot>
      toggleTracking: (enabled?: boolean) => Promise<GlobalStatsSnapshot>
      requestKeyboardPermission: () => Promise<GlobalStatsSnapshot>
      openKeyboardSettings: (section?: 'accessibility' | 'input-monitoring') => Promise<void>
      relaunch: () => Promise<void>
      updatePreferences: (preferences: Partial<UserPreferences>) => Promise<GlobalStatsSnapshot>
      clearStatistics: () => Promise<GlobalStatsSnapshot>
      openDashboard: (view?: AppView) => Promise<void>
      openPetMenu: () => Promise<void>
      getLan: () => Promise<LanSnapshot>
      toggleLan: (enabled: boolean) => Promise<LanSnapshot>
      createRoom: (durationMinutes: number) => Promise<LanSnapshot>
      joinRoom: (target: string) => Promise<LanSnapshot>
      startRoom: () => Promise<LanSnapshot>
      leaveRoom: () => Promise<LanSnapshot>
      toggleBuddy: (peerId: string) => Promise<LanSnapshot>
      onStats: (listener: (stats: GlobalStatsSnapshot) => void) => () => void
      onKeystroke: (listener: (pulse: KeyboardPulse) => void) => () => void
      onLan: (listener: (state: LanSnapshot) => void) => () => void
      onNavigate: (listener: (view: AppView) => void) => () => void
    }
  }
}

export {}
