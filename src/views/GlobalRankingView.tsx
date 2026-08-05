import { Crown, Keyboard, Medal, Sparkles, TimerReset, Trophy, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DailyStats, GlobalStatsSnapshot } from '../types'

type RankingMode = 'speed' | 'volume'

interface GlobalRankingViewProps {
  stats: GlobalStatsSnapshot
}

export function GlobalRankingView({ stats }: GlobalRankingViewProps) {
  const [mode, setMode] = useState<RankingMode>('speed')
  const days = useMemo(() => [stats.today, ...stats.history]
    .filter((day, index, all) => day.keystrokes > 0 && all.findIndex((candidate) => candidate.date === day.date) === index), [stats.history, stats.today])
  const ranking = days.slice().sort((a, b) => mode === 'speed' ? b.peakKpm - a.peakKpm : b.keystrokes - a.keystrokes).slice(0, 12)
  const totalMinutes = Math.round(days.reduce((sum, day) => sum + day.activeSeconds, 0) / 60)
  const bestDay = days.slice().sort((a, b) => b.keystrokes - a.keystrokes)[0]

  const achievements = [
    { label: '键盘开光', note: `${Math.min(stats.totalKeystrokes, 1000).toLocaleString()}/1,000 次`, unlocked: stats.totalKeystrokes >= 1000, icon: Keyboard },
    { label: '手速在线', note: `${Math.min(Math.max(0, ...days.map((day) => day.peakKpm)), 200)}/200 KPM`, unlocked: days.some((day) => day.peakKpm >= 200), icon: Zap },
    { label: '稳坐工位', note: `${Math.min(days.length, 7)}/7 个活跃日`, unlocked: days.length >= 7, icon: Medal },
    { label: '万键户', note: `${Math.min(stats.totalKeystrokes, 10000).toLocaleString()}/10,000 次`, unlocked: stats.totalKeystrokes >= 10000, icon: Trophy },
  ]

  return (
    <div className="ranking-global-layout">
      <section className="panel global-ranking-panel">
        <div className="panel-header global-ranking-header">
          <div><span className="section-kicker"><Trophy size={15} /> 本机日榜</span><h2>看看哪天最能敲</h2><p>每天一条记录，只和自己的历史比。</p></div>
          <div className="segmented"><button className={mode === 'speed' ? 'is-active' : ''} onClick={() => setMode('speed')}>速度榜</button><button className={mode === 'volume' ? 'is-active' : ''} onClick={() => setMode('volume')}>键数榜</button></div>
        </div>
        {ranking.length ? (
          <div className="daily-ranking-table">
            <div className="daily-ranking-row daily-ranking-row--head"><span>名次</span><span>日期</span><span>{mode === 'speed' ? '峰值速度' : '按键总量'}</span><span>活跃时长</span></div>
            {ranking.map((day: DailyStats, index) => (
              <div className={`daily-ranking-row ${index === 0 ? 'is-champion' : ''}`} key={day.date}>
                <span className={`daily-rank daily-rank--${index + 1}`}>{index === 0 ? <Crown size={18} /> : index + 1}</span>
                <span><strong>{day.date === stats.today.date ? '今天' : day.date}</strong><small>{day.date === stats.today.date ? '正在刷新' : '已归档'}</small></span>
                <span><strong>{mode === 'speed' ? day.peakKpm : day.keystrokes.toLocaleString()}</strong><small>{mode === 'speed' ? ' KPM' : ' 次'}</small></span>
                <span><strong>{Math.round(day.activeSeconds / 60)}</strong><small> 分钟</small></span>
              </div>
            ))}
          </div>
        ) : (
          <div className="data-empty data-empty--ranking"><Trophy size={28} /><strong>榜首还没上班</strong><span>全局检测收到第一批按键后，今天会自动入榜。</span></div>
        )}
      </section>

      <aside className="global-ranking-aside">
        <section className="rank-highlight">
          <Sparkles size={20} />
          <span>最能敲的一天</span>
          <strong>{bestDay?.keystrokes.toLocaleString() ?? '--'}</strong>
          <small>{bestDay ? `${bestDay.date} · ${bestDay.peakKpm} KPM` : '等待第一天数据'}</small>
        </section>
        <section className="panel achievement-panel">
          <div className="panel-header"><div><span className="section-kicker"><Medal size={15} /> 工位成就</span><h3>慢慢攒出来的</h3></div><span className="panel-count"><TimerReset size={13} /> {totalMinutes} 分钟</span></div>
          <div className="achievement-grid">
            {achievements.map(({ label, note, unlocked, icon: Icon }) => (
              <div className={`global-achievement ${unlocked ? 'is-unlocked' : ''}`} key={label}><span><Icon size={18} /></span><div><strong>{label}</strong><small>{note}</small></div></div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}
