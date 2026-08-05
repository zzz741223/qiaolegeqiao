import { Activity, Eye, Keyboard, Pause, Play, RotateCcw, Settings2, ShieldAlert, ShieldCheck, Sparkles, TimerReset, Zap } from 'lucide-react'
import { DeskBuddy, type BuddyMood } from '../components/DeskBuddy'
import { avatarMeta } from '../data/avatars'
import type { GlobalStatsSnapshot, UserPreferences } from '../types'

interface OverviewViewProps {
  stats: GlobalStatsSnapshot
  onToggleTracking: () => void
  onRequestKeyboardPermission: () => void
  onOpenKeyboardSettings: (section?: 'accessibility' | 'input-monitoring') => void
  onRelaunch: () => void
  onUpdatePreferences: (preferences: Partial<UserPreferences>) => void
}

function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

function busiestHour(hourly: number[]): number | null {
  const max = Math.max(...hourly)
  return max > 0 ? hourly.indexOf(max) : null
}

export function OverviewView({ stats, onToggleTracking, onRequestKeyboardPermission, onOpenKeyboardSettings, onRelaunch, onUpdatePreferences }: OverviewViewProps) {
  const maxHour = Math.max(1, ...stats.today.hourly)
  const busyHour = busiestHour(stats.today.hourly)
  const hookConnected = !window.desktop?.isElectron || stats.hookAvailable
  const isListening = stats.trackingEnabled && hookConnected
  const mood: BuddyMood = !isListening
    ? 'idle'
    : stats.currentKpm >= 180
      ? 'streak'
      : stats.currentKpm > 0 ? 'typing' : 'idle'
  const liveLine = window.desktop?.isElectron && !stats.hookAvailable
    ? '还差系统键盘权限，授权后我才能正式上班。'
    : !stats.trackingEnabled
    ? '暂停中，今天先让手指喘口气。'
    : stats.currentKpm >= 180
      ? '这波键盘要冒烟了，稳住节奏。'
      : stats.currentKpm > 0
        ? '全局按键已收到，我在认真记数。'
        : '我在桌面等着，你去任何软件打字都行。'

  return (
    <div className="dash-stack">
      {!window.desktop?.isElectron && (
        <div className="desktop-only-banner"><Eye size={16} /><span>当前是浏览器预览；安装桌面版后才会检测其他软件中的键盘活动。</span></div>
      )}
      {window.desktop?.isElectron && stats.keyboardAccess.required && (
        <div className={`keyboard-access-banner ${stats.keyboardAccess.granted ? 'is-granted' : ''}`}>
          {stats.keyboardAccess.granted ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
          <div className="keyboard-access-banner__copy">
            <strong>{stats.keyboardAccess.granted ? 'Mac 键盘权限已接通' : '让桌面宠物听见整个 Mac'}</strong>
            <span>{stats.keyboardAccess.granted
              ? '辅助功能已允许；如果仍然没有计数，请检查输入监控后重新检测。'
              : '请在系统设置中允许“敲了个敲”访问辅助功能和输入监控。我们只记录次数，不读取文字。'}</span>
          </div>
          <div className="keyboard-access-banner__actions">
            <button onClick={onRequestKeyboardPermission}><RotateCcw size={14} />重新检测</button>
            <button onClick={() => onOpenKeyboardSettings('accessibility')}><Settings2 size={14} />辅助功能</button>
            <button onClick={() => onOpenKeyboardSettings('input-monitoring')}><Settings2 size={14} />输入监控</button>
            <button onClick={onRelaunch}><RotateCcw size={14} />重启应用</button>
          </div>
        </div>
      )}
      {window.desktop?.isElectron && !stats.keyboardAccess.required && !stats.hookAvailable && (
        <div className="desktop-only-banner"><ShieldAlert size={16} /><span>全局键盘模块没有启动：{stats.hookError || '请重启应用后再试。'}</span></div>
      )}

      <section className={`live-hero ${isListening ? 'is-listening' : 'is-paused'}`}>
        <div className="live-hero__copy">
          <span className="section-kicker"><Activity size={15} /> 全局键速</span>
          <div className="live-speed">
            <strong>{stats.currentKpm}</strong>
            <span>键/分</span>
          </div>
          <div className="live-substats">
            <span><b>{stats.currentWpm}</b> WPM 估算</span>
            <span><b>{stats.today.peakKpm}</b> 今日峰值</span>
          </div>
          <button className={`tracking-button ${stats.trackingEnabled ? '' : 'is-paused'}`} onClick={onToggleTracking}>
            {stats.trackingEnabled ? <Pause size={17} /> : <Play size={17} />}
            {stats.trackingEnabled ? '暂停检测' : '继续检测'}
          </button>
        </div>
        <div className="live-hero__pet">
          <div className="dashboard-speech">{liveLine}</div>
          <DeskBuddy avatarId={stats.preferences.avatarId} mood={mood} />
        </div>
        <div className="live-privacy"><ShieldCheck size={15} /> 仅统计事件数量和时间</div>
      </section>

      <section className="global-metrics">
        <article>
          <span className="global-metric__icon global-metric__icon--yellow"><Keyboard size={19} /></span>
          <div><small>今日按键</small><strong>{stats.today.keystrokes.toLocaleString()}</strong><span>次</span></div>
        </article>
        <article>
          <span className="global-metric__icon global-metric__icon--green"><TimerReset size={19} /></span>
          <div><small>活跃打字</small><strong>{durationLabel(stats.today.activeSeconds)}</strong></div>
        </article>
        <article>
          <span className="global-metric__icon global-metric__icon--red"><Zap size={19} /></span>
          <div><small>最忙时段</small><strong>{busyHour === null ? '--' : `${String(busyHour).padStart(2, '0')}:00`}</strong></div>
        </article>
        <article>
          <span className="global-metric__icon global-metric__icon--blue"><Sparkles size={19} /></span>
          <div><small>累计陪伴</small><strong>{stats.totalKeystrokes.toLocaleString()}</strong><span>次</span></div>
        </article>
      </section>

      <section className="overview-grid">
        <div className="panel hourly-mini-panel">
          <div className="panel-header">
            <div><span className="section-kicker">今日节奏</span><h3>每小时按键量</h3></div>
            <span className={`listening-badge ${isListening ? '' : 'is-paused'}`}><i />{isListening ? '实时更新' : stats.trackingEnabled ? '等待权限' : '已暂停'}</span>
          </div>
          <div className="hourly-mini-chart">
            {stats.today.hourly.map((value, hour) => (
              <div className={`hourly-mini-bar ${hour === new Date().getHours() ? 'is-current' : ''}`} key={hour} title={`${hour}:00 · ${value} 次`}>
                <i style={{ height: `${Math.max(value ? 8 : 2, (value / maxHour) * 100)}%` }} />
                {hour % 3 === 0 && <span>{String(hour).padStart(2, '0')}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="panel quick-settings">
          <div className="panel-header"><div><span className="section-kicker">宠物状态</span><h3>{avatarMeta[stats.preferences.avatarId].name} 的工作设置</h3></div></div>
          <label className="setting-row">
            <span><strong>始终置顶</strong><small>宠物保持在其他窗口前面</small></span>
            <input type="checkbox" checked={stats.preferences.petAlwaysOnTop} onChange={(event) => onUpdatePreferences({ petAlwaysOnTop: event.target.checked })} />
          </label>
          <label className="setting-row">
             <span><strong>开机启动</strong><small>登录系统后自动来上班</small></span>
            <input type="checkbox" checked={stats.preferences.launchAtStartup} onChange={(event) => onUpdatePreferences({ launchAtStartup: event.target.checked })} />
          </label>
          <div className="privacy-note"><ShieldCheck size={17} /><p><strong>不做键盘记录器</strong><span>键码只用于防止长按重复，绝不落盘；统计文件里没有字符内容。</span></p></div>
        </div>
      </section>
    </div>
  )
}
