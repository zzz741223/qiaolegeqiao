import { BarChart3, GripHorizontal, Pause, Play, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DeskBuddy, type BuddyMood } from './components/DeskBuddy'
import { avatarMeta } from './data/avatars'
import { useDesktopStats, useLanState } from './lib/desktop'

const idleLines = [
  '我在桌面守着，你去忙就好。',
  '不记内容，只帮你数今天敲了多少下。',
  '键盘没响，我先发一会儿呆。',
]

export default function PetOverlay() {
  const { stats, pulse, toggleTracking, openDashboard } = useDesktopStats()
  const { lan } = useLanState()
  const [lineIndex, setLineIndex] = useState(0)

  useEffect(() => {
    document.documentElement.classList.add('pet-document')
    return () => document.documentElement.classList.remove('pet-document')
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setLineIndex((current) => current + 1), 9000)
    return () => window.clearInterval(timer)
  }, [])

  const line = useMemo(() => {
    if (!stats.hookAvailable && window.desktop?.isElectron) return '全局键盘权限没接上，去面板看一下。'
    if (!stats.trackingEnabled) return '检测暂停了，点播放我再继续上班。'
    if (lan.room?.status === 'running') {
      const rank = lan.room.members.findIndex((member) => member.id === lan.selfId) + 1
      const leader = lan.room.members[0]
      return rank === 1 ? '你在工位房领跑，先别回头。' : `目前第 ${rank || '-'} 名，离 ${leader?.name || '前面'} 还可以再敲几下。`
    }
    if (lan.room?.status === 'lobby') return `工位房 ${lan.room.code} 等人中，叫个搭子来。`
    if (lan.room?.status === 'finished') return '这局收工了，成绩已经定榜。'
    if (stats.currentKpm >= 220) return '好快！先稳住，别和键盘拼命。'
    if (stats.currentKpm >= 120) return `${stats.currentKpm} 键/分，今天手感在线。`
    if (pulse) return `收到！今天已经敲了 ${stats.today.keystrokes.toLocaleString()} 下。`
    return idleLines[lineIndex % idleLines.length]
  }, [lan.room, lan.selfId, lineIndex, pulse, stats])

  const roomMember = lan.room?.members.find((member) => member.id === lan.selfId)
  const roomRank = lan.room && roomMember ? lan.room.members.findIndex((member) => member.id === lan.selfId) + 1 : 0
  const liveLabel = lan.room?.status === 'running'
    ? `第 ${roomRank} 名 · ${roomMember?.sessionKeys.toLocaleString() || 0} 键`
    : stats.trackingEnabled ? `${stats.currentKpm} 键/分` : '暂停中'
  const mood: BuddyMood = pulse ? (pulse.currentKpm >= 180 ? 'streak' : 'typing') : 'idle'

  return (
    <main className={`pet-window theme-${stats.preferences.themeId}`} onDoubleClick={() => openDashboard()}>
      <div className="pet-drag-strip"><GripHorizontal size={18} /></div>
      <div className="pet-hover-tools">
        <button onClick={(event) => { event.stopPropagation(); toggleTracking() }} title={stats.trackingEnabled ? '暂停检测' : '继续检测'} aria-label={stats.trackingEnabled ? '暂停检测' : '继续检测'}>
          {stats.trackingEnabled ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button onClick={(event) => { event.stopPropagation(); openDashboard() }} title="打开数据面板" aria-label="打开数据面板"><BarChart3 size={15} /></button>
        {lan.room && <button onClick={(event) => { event.stopPropagation(); openDashboard('neighbors') }} title="打开工位房" aria-label="打开工位房"><UsersRound size={15} /></button>}
      </div>
      <div className="pet-speech"><span>{avatarMeta[stats.preferences.avatarId].name}</span>{line}</div>
      <div className="pet-character"><DeskBuddy avatarId={stats.preferences.avatarId} mood={stats.trackingEnabled ? mood : 'idle'} /></div>
      <div className={`pet-live-chip ${stats.trackingEnabled ? '' : 'is-paused'} ${lan.room?.status === 'running' ? 'is-room' : ''}`}><i />{liveLabel}</div>
    </main>
  )
}
