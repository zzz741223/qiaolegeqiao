import { Activity, BarChart3, Keyboard, Medal, ShieldCheck, Shirt, UsersRound } from 'lucide-react'
import { avatarMeta } from '../data/avatars'
import type { AppView, GlobalStatsSnapshot } from '../types'
import { DeskBuddy } from './DeskBuddy'

interface SidebarProps {
  activeView: AppView
  stats: GlobalStatsSnapshot
  onNavigate: (view: AppView) => void
}

const navigation: Array<{
  id: AppView
  label: string
  eyebrow: string
  icon: typeof Activity
}> = [
  { id: 'overview', label: '今日', eyebrow: '实时状态', icon: Activity },
  { id: 'rhythm', label: '节奏', eyebrow: '时段趋势', icon: BarChart3 },
  { id: 'neighbors', label: '附近工友', eyebrow: '今日实时榜', icon: UsersRound },
  { id: 'ranking', label: '工位榜', eyebrow: '本机日榜', icon: Medal },
  { id: 'wardrobe', label: '换装间', eyebrow: '宠物皮肤', icon: Shirt },
]

export function Sidebar({ activeView, stats, onNavigate }: SidebarProps) {
  const { preferences } = stats
  const hookConnected = !window.desktop?.isElectron || stats.hookAvailable
  const isListening = stats.trackingEnabled && hookConnected
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('overview')} aria-label="返回今日概览">
        <span className="brand__mark"><Keyboard size={19} strokeWidth={2.4} /></span>
        <span>
          <strong>敲了个敲</strong>
          <small>桌面打字搭子</small>
        </span>
      </button>

      <div className="sidebar-profile">
        <div className="sidebar-profile__buddy">
          <DeskBuddy avatarId={preferences.avatarId} compact />
        </div>
        <div>
          <span className={`status-dot ${isListening ? '' : 'is-paused'}`} />
          <strong>{preferences.displayName}</strong>
          <small>{avatarMeta[preferences.avatarId].name} {isListening ? '正在听键' : stats.trackingEnabled ? '等待权限' : '正在休息'}</small>
        </div>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              data-view={item.id}
              className={`nav-item ${activeView === item.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <span className="nav-item__icon"><Icon size={19} /></span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.eyebrow}</small>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-local">
        <ShieldCheck size={15} />
        <span>
          <strong>隐私计数模式</strong>
          <small>只记次数，不记按键内容</small>
        </span>
      </div>
    </aside>
  )
}
