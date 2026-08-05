export type AppView = 'overview' | 'rhythm' | 'neighbors' | 'ranking' | 'wardrobe'

export type AvatarId = 'spark' | 'rice' | 'lamp' | 'cloud'

export type ThemeId = 'office' | 'mint' | 'night' | 'tomato'

export type PetSize = 'small' | 'medium' | 'large'

export interface DailyStats {
  date: string
  keystrokes: number
  activeSeconds: number
  peakKpm: number
  hourly: number[]
}

export interface UserPreferences {
  displayName: string
  avatarId: AvatarId
  themeId: ThemeId
  soundEnabled: boolean
  petAlwaysOnTop: boolean
  petSize: PetSize
  launchAtStartup: boolean
  lanEnabled: boolean
  petPosition?: { x: number; y: number } | null
}

export interface GlobalStatsSnapshot {
  trackingEnabled: boolean
  hookAvailable: boolean
  hookError: string
  keyboardAccess: {
    required: boolean
    granted: boolean
    canRequest: boolean
  }
  currentKpm: number
  currentWpm: number
  isTyping: boolean
  totalKeystrokes: number
  today: DailyStats
  history: DailyStats[]
  preferences: UserPreferences
}

export interface KeyboardPulse {
  at: number
  currentKpm: number
}

export interface NearbyPeer {
  id: string
  name: string
  avatarId: AvatarId
  address: string
  port: number
  lastSeenAt: number
  roomCode: string
  roomStatus: '' | 'lobby' | 'running' | 'finished'
  durationMinutes: number
  todayKeystrokes: number
  currentKpm: number
  isTyping: boolean
  presenceAt: number
}

export interface SavedBuddy {
  id: string
  name: string
  avatarId: AvatarId
  addedAt: number
}

export interface LanRoomMember {
  id: string
  name: string
  avatarId: AvatarId
  sessionKeys: number
  currentKpm: number
  connected: boolean
  isHost: boolean
}

export interface LanRoom {
  code: string
  role: 'host' | 'guest'
  hostId: string
  status: 'lobby' | 'running' | 'finished'
  durationMinutes: number
  createdAt: number
  startedAt: number
  endsAt: number
  finishedAt: number
  members: LanRoomMember[]
}

export interface LanSnapshot {
  enabled: boolean
  available: boolean
  error: string
  connectionNote: string
  selfId: string
  port: number
  peers: NearbyPeer[]
  buddies: SavedBuddy[]
  room: LanRoom | null
}
