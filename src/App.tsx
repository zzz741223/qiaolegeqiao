import { Eye, Pause, Play, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { useDesktopStats } from './lib/desktop'
import type { AppView } from './types'
import { GlobalRankingView } from './views/GlobalRankingView'
import { NearbyView } from './views/NearbyView'
import { OverviewView } from './views/OverviewView'
import { RhythmView } from './views/RhythmView'
import { WardrobeView } from './views/WardrobeView'

const viewMeta: Record<AppView, { eyebrow: string; title: string }> = {
  overview: { eyebrow: '桌面宠物状态', title: '键盘响了，它就知道。' },
  rhythm: { eyebrow: '打字节奏', title: '今天都在哪些时段发力？' },
  neighbors: { eyebrow: '同 WiFi 工位圈', title: '附近谁又在疯狂敲键盘？' },
  ranking: { eyebrow: '本机排行', title: '每个工作日都算数。' },
  wardrobe: { eyebrow: '角色与皮肤', title: '把桌面搭子调成顺眼的样子。' },
}

function activeDayCount(dates: string[]): number {
  return new Set(dates).size
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('overview')
  const {
    stats,
    toggleTracking,
    requestKeyboardPermission,
    openKeyboardSettings,
    relaunch,
    updatePreferences,
    clearStatistics,
  } = useDesktopStats()
  const meta = viewMeta[activeView]
  const days = useMemo(() => activeDayCount([stats.today, ...stats.history].filter((day) => day.keystrokes > 0).map((day) => day.date)), [stats.history, stats.today])

  useEffect(() => window.desktop?.onNavigate(setActiveView), [])

  return (
    <div className={`app theme-${stats.preferences.themeId}`}>
      <div className="app-shell">
        <Sidebar activeView={activeView} stats={stats} onNavigate={setActiveView} />
        <main className="page-main">
          <header className="topbar">
            <div><span className="topbar__eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1></div>
            <div className="topbar__actions">
              <div className="privacy-pill"><ShieldCheck size={16} /><span>只计数，不读内容</span></div>
              <div className="active-days"><Eye size={16} /><span><strong>{days}</strong> 个活跃日</span></div>
              <button className={`tracking-icon-button ${stats.trackingEnabled && stats.hookAvailable ? 'is-active' : ''}`} onClick={() => toggleTracking()} title={stats.trackingEnabled ? '暂停全局检测' : '继续全局检测'} aria-label={stats.trackingEnabled ? '暂停全局检测' : '继续全局检测'}>
                {stats.trackingEnabled ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </div>
          </header>
          <div className="view-container dash-view-container">
            {activeView === 'overview' && (
              <OverviewView
                stats={stats}
                onToggleTracking={() => toggleTracking()}
                onRequestKeyboardPermission={requestKeyboardPermission}
                onOpenKeyboardSettings={openKeyboardSettings}
                onRelaunch={relaunch}
                onUpdatePreferences={updatePreferences}
              />
            )}
            {activeView === 'rhythm' && <RhythmView stats={stats} />}
            {activeView === 'neighbors' && <NearbyView stats={stats} />}
            {activeView === 'ranking' && <GlobalRankingView stats={stats} />}
            {activeView === 'wardrobe' && <WardrobeView preferences={stats.preferences} onChange={updatePreferences} />}
          </div>
          {activeView === 'overview' && stats.totalKeystrokes > 0 && (
            <button className="clear-statistics-link" onClick={() => {
              if (window.confirm('确认清空本机全部按键统计吗？角色和皮肤设置会保留。')) clearStatistics()
            }}>清空本机统计</button>
          )}
        </main>
      </div>
    </div>
  )
}
