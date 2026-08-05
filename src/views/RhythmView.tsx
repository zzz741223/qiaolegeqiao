import { BarChart3, Clock3, Gauge, Keyboard, TimerReset } from 'lucide-react'
import type { DailyStats, GlobalStatsSnapshot } from '../types'

interface RhythmViewProps {
  stats: GlobalStatsSnapshot
}

function compactDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

function weekday(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
}

export function RhythmView({ stats }: RhythmViewProps) {
  const hourlyMax = Math.max(1, ...stats.today.hourly)
  const days: DailyStats[] = [stats.today, ...stats.history]
    .filter((day, index, all) => all.findIndex((candidate) => candidate.date === day.date) === index)
    .slice(0, 7)
    .reverse()
  const dayMax = Math.max(1, ...days.map((day) => day.keystrokes))
  const totalWeek = days.reduce((sum, day) => sum + day.keystrokes, 0)
  const activeWeek = Math.round(days.reduce((sum, day) => sum + day.activeSeconds, 0) / 60)
  const bestPeak = Math.max(0, ...days.map((day) => day.peakKpm))

  return (
    <div className="dash-stack">
      <section className="rhythm-summary">
        <div><span><Keyboard size={18} /></span><small>近七日按键</small><strong>{totalWeek.toLocaleString()}</strong></div>
        <div><span><TimerReset size={18} /></span><small>活跃分钟</small><strong>{activeWeek}</strong></div>
        <div><span><Gauge size={18} /></span><small>最高键速</small><strong>{bestPeak}<i> KPM</i></strong></div>
      </section>

      <section className="panel rhythm-panel">
        <div className="panel-header">
          <div><span className="section-kicker"><Clock3 size={15} /> 今天</span><h2>哪个时段敲得最凶</h2></div>
          <span className="panel-count">共 {stats.today.keystrokes.toLocaleString()} 次</span>
        </div>
        <div className="hourly-chart">
          {stats.today.hourly.map((value, hour) => (
            <div className={`hourly-column ${hour === new Date().getHours() ? 'is-current' : ''}`} key={hour}>
              <span>{value || ''}</span>
              <div><i style={{ height: `${Math.max(value ? 6 : 1, (value / hourlyMax) * 100)}%` }} /></div>
              <small>{String(hour).padStart(2, '0')}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel weekly-panel">
        <div className="panel-header">
          <div><span className="section-kicker"><BarChart3 size={15} /> 近七日</span><h2>打字工作量</h2></div>
        </div>
        {days.some((day) => day.keystrokes > 0) ? (
          <div className="weekly-bars">
            {days.map((day) => (
              <div className="weekly-bar" key={day.date}>
                <span>{day.keystrokes.toLocaleString()}</span>
                <div><i style={{ height: `${Math.max(7, (day.keystrokes / dayMax) * 100)}%` }} /></div>
                <strong>{weekday(day.date)}</strong>
                <small>{compactDate(day.date)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="data-empty"><BarChart3 size={25} /><strong>还没有节奏数据</strong><span>宠物开始听键后，这里会慢慢长出柱子。</span></div>
        )}
      </section>
    </div>
  )
}
