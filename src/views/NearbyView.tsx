import {
  CircleStop,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  Gauge,
  Keyboard,
  LogIn,
  Medal,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Star,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DeskBuddy } from '../components/DeskBuddy'
import { useLanState } from '../lib/desktop'
import type { GlobalStatsSnapshot, LanRoomMember, NearbyPeer } from '../types'

interface NearbyViewProps {
  stats: GlobalStatsSnapshot
}

interface ActionResult {
  ok: boolean
  message?: string
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function MemberAvatar({ member }: { member: Pick<LanRoomMember, 'avatarId' | 'name'> }) {
  return (
    <span className="lan-avatar" title={member.name}>
      <DeskBuddy avatarId={member.avatarId} compact />
    </span>
  )
}

function OnlineRow({
  peer,
  isBuddy,
  onJoin,
  onToggleBuddy,
}: {
  peer: NearbyPeer
  isBuddy: boolean
  onJoin: () => void
  onToggleBuddy: () => void
}) {
  return (
    <div className="nearby-row">
      <MemberAvatar member={peer} />
      <span className="nearby-row__identity">
        <strong>{peer.name}</strong>
        <small><i className={peer.isTyping ? 'is-typing' : ''} />{peer.isTyping ? '正在敲' : '在线'} · 今日 {peer.todayKeystrokes.toLocaleString()} 键 · {peer.currentKpm} KPM</small>
      </span>
      {peer.roomCode && peer.roomStatus === 'lobby' && (
        <button className="compact-command" onClick={onJoin}><LogIn size={14} /> 加入</button>
      )}
      <button className={`icon-command ${isBuddy ? 'is-saved' : ''}`} onClick={onToggleBuddy} title={isBuddy ? '移出常用搭子' : '收藏为常用搭子'} aria-label={isBuddy ? '移出常用搭子' : '收藏为常用搭子'}>
        <Star size={16} fill={isBuddy ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

function LiveRankRow({ entry, rank }: { entry: LiveRankEntry; rank: number }) {
  return (
    <div className={`live-rank-row ${entry.isSelf ? 'is-self' : ''}`}>
      <span className={`live-rank-number live-rank-number--${rank}`}>{rank === 1 ? <Crown size={17} /> : rank}</span>
      <span className="live-rank-identity"><MemberAvatar member={entry} /><span><strong>{entry.name}{entry.isSelf ? '（我）' : ''}</strong><small><i className={entry.isTyping ? 'is-typing' : ''} />{entry.isTyping ? '正在敲' : '在线'}</small></span></span>
      <span className="live-rank-value"><strong>{entry.todayKeystrokes.toLocaleString()}</strong><small>今日键数</small></span>
      <span className="live-rank-value"><strong>{entry.currentKpm}</strong><small>KPM</small></span>
    </div>
  )
}

interface LiveRankEntry {
  id: string
  name: string
  avatarId: NearbyPeer['avatarId']
  todayKeystrokes: number
  currentKpm: number
  isTyping: boolean
  isSelf: boolean
}

export function NearbyView({ stats }: NearbyViewProps) {
  const { lan, toggleLan, createRoom, joinRoom, startRoom, leaveRoom, toggleBuddy } = useLanState()
  const [duration, setDuration] = useState(15)
  const [joinCode, setJoinCode] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (lan.room?.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [lan.room?.status])

  const buddyIds = useMemo(() => new Set(lan.buddies.map((buddy) => buddy.id)), [lan.buddies])
  const liveRanking = useMemo<LiveRankEntry[]>(() => [
    {
      id: lan.selfId,
      name: stats.preferences.displayName,
      avatarId: stats.preferences.avatarId,
      todayKeystrokes: stats.today.keystrokes,
      currentKpm: stats.currentKpm,
      isTyping: stats.isTyping,
      isSelf: true,
    },
    ...lan.peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      avatarId: peer.avatarId,
      todayKeystrokes: peer.todayKeystrokes,
      currentKpm: peer.currentKpm,
      isTyping: peer.isTyping,
      isSelf: false,
    })),
  ].sort((left, right) => right.todayKeystrokes - left.todayKeystrokes || right.currentKpm - left.currentKpm), [lan.peers, lan.selfId, stats.currentKpm, stats.isTyping, stats.preferences.avatarId, stats.preferences.displayName, stats.today.keystrokes])
  const selfMember = lan.room?.members.find((member) => member.id === lan.selfId)
  const selfRank = lan.room && selfMember
    ? lan.room.members.findIndex((member) => member.id === lan.selfId) + 1
    : 0

  async function perform(action: () => Promise<ActionResult>, success = '') {
    setBusy(true)
    setNotice('')
    const result = await action()
    setBusy(false)
    if (!result.ok) setNotice(result.message || '操作失败')
    else if (success) setNotice(success)
  }

  function submitCode(event: FormEvent) {
    event.preventDefault()
    if (!/^\d{6}$/.test(joinCode)) {
      setNotice('房间码是 6 位数字')
      return
    }
    perform(() => joinRoom(joinCode))
  }

  const room = lan.room
  const connectionMessage = notice || lan.error || lan.connectionNote

  return (
    <div className="lan-stack">
      <section className={`lan-status-band ${lan.enabled && lan.available ? 'is-online' : ''}`}>
        <span className="lan-status-band__icon">{lan.enabled ? <Wifi size={20} /> : <WifiOff size={20} />}</span>
        <div>
          <strong>{lan.enabled ? (lan.available ? '已加入附近工位圈' : '局域网服务未就绪') : '附近工友已关闭'}</strong>
          <small>{lan.enabled ? `每秒更新今日键数和当前 KPM · ${lan.peers.length} 位工友在线` : '关闭后不会在局域网中被发现'}</small>
        </div>
        <label className="lan-switch">
          <input type="checkbox" checked={lan.enabled} disabled={busy} onChange={(event) => perform(() => toggleLan(event.target.checked))} />
          <span>{lan.enabled ? '局域网可见' : '保持隐身'}</span>
        </label>
      </section>

      {connectionMessage && <div className="lan-notice" role="status"><Radio size={15} /> {connectionMessage}</div>}

      <section className="panel live-ranking-panel">
        <div className="panel-header">
          <div><span className="section-kicker"><Medal size={15} /> 附近实时榜</span><h2>今天谁敲得最多？</h2><p>按今日累计键数排名，当前 KPM 只做即时参考。</p></div>
          <span className="live-ranking-meta"><Gauge size={14} /> {lan.enabled ? '每秒刷新' : '开启后加入'}</span>
        </div>
        {lan.enabled ? (
          <div className="live-ranking-table">
            <div className="live-rank-row live-rank-row--head"><span>名次</span><span>工友</span><span>今日键数</span><span>当前速度</span></div>
            {liveRanking.map((entry, index) => <LiveRankRow entry={entry} rank={index + 1} key={entry.id} />)}
          </div>
        ) : (
          <div className="live-ranking-disabled"><WifiOff size={20} /><strong>打开局域网可见，实时榜才会出现工友</strong><span>只会同步聚合后的今日键数和当前 KPM。</span></div>
        )}
      </section>

      <div className="lan-main-grid">
        <section className="panel room-panel">
          <div className="panel-header">
            <div><span className="section-kicker"><Keyboard size={15} /> 同 WiFi 工位房</span><h2>{room ? `房间 ${room.code}` : '拉个临时打字局'}</h2></div>
            {room && <span className={`room-status room-status--${room.status}`}>{room.status === 'lobby' ? '等人中' : room.status === 'running' ? '比拼中' : '已结束'}</span>}
          </div>

          {!room ? (
            <div className="room-create">
              <div className="duration-picker">
                <span>本局时长</span>
                <div className="segmented">
                  {[15, 30, 60].map((minutes) => <button key={minutes} className={duration === minutes ? 'is-active' : ''} onClick={() => setDuration(minutes)}>{minutes} 分钟</button>)}
                </div>
              </div>
              <button className="primary-command" disabled={busy || !lan.available} onClick={() => perform(() => createRoom(duration))}><UsersRound size={17} /> 创建工位房</button>
              <div className="room-divider"><span>或者输入房间码</span></div>
              <form className="room-code-form" onSubmit={submitCode}>
                <input inputMode="numeric" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="六位房间码" />
                <button className="secondary-command" disabled={busy || !lan.available}><LogIn size={16} /> 加入</button>
              </form>
            </div>
          ) : (
            <div className="room-live">
              <div className="room-scoreboard-head">
                <div className="room-code-block"><span>房间码</span><strong>{room.code}</strong><button className="icon-command" title="复制房间码" aria-label="复制房间码" onClick={() => navigator.clipboard.writeText(room.code).then(() => setNotice('房间码已复制')).catch(() => setNotice(`房间码：${room.code}`))}><Copy size={15} /></button></div>
                <div className="room-clock"><Clock3 size={17} /><span>{room.status === 'lobby' ? `${room.durationMinutes} 分钟` : room.status === 'running' ? formatCountdown(room.endsAt - Math.max(now, room.startedAt)) : '本局结束'}</span></div>
              </div>

              <div className="room-leaderboard">
                <div className="room-member room-member--head"><span>名次</span><span>工友</span><span>局内键数</span><span>实时速度</span></div>
                {room.members.map((member, index) => (
                  <div className={`room-member ${member.id === lan.selfId ? 'is-self' : ''}`} key={member.id}>
                    <span className="room-rank">{index === 0 && room.status !== 'lobby' ? <Crown size={17} /> : index + 1}</span>
                    <span className="room-member__identity"><MemberAvatar member={member} /><span><strong>{member.name}{member.id === lan.selfId ? '（我）' : ''}</strong><small>{member.isHost ? '房主' : member.connected ? '在线' : '已掉线'}</small></span></span>
                    <strong>{member.sessionKeys.toLocaleString()}</strong>
                    <span><strong>{member.currentKpm}</strong><small> KPM</small></span>
                  </div>
                ))}
              </div>

              <div className="room-actions">
                <span>{room.status === 'lobby' ? `${room.members.length} 人已就位` : selfRank ? `你当前第 ${selfRank} 名 · ${selfMember?.sessionKeys.toLocaleString() || 0} 键` : '榜单同步中'}</span>
                {room.role === 'host' && room.status === 'lobby' && <button className="primary-command" disabled={busy} onClick={() => perform(startRoom)}><Play size={16} /> 开始比拼</button>}
                <button className="secondary-command" disabled={busy} onClick={() => perform(leaveRoom)}>{room.role === 'host' ? <CircleStop size={16} /> : <DoorOpen size={16} />}{room.role === 'host' ? ' 收起房间' : ' 退出房间'}</button>
              </div>
            </div>
          )}
        </section>

        <section className="panel nearby-panel">
          <div className="panel-header">
            <div><span className="section-kicker"><Radio size={15} /> 附近工友</span><h3>同一 WiFi 在线</h3></div>
            <span className="nearby-count"><i /> {lan.peers.length} 人</span>
          </div>
          <div className="nearby-list">
            {lan.peers.length ? lan.peers.map((peer) => (
              <OnlineRow key={peer.id} peer={peer} isBuddy={buddyIds.has(peer.id)} onJoin={() => perform(() => joinRoom(peer.id))} onToggleBuddy={() => perform(() => toggleBuddy(peer.id))} />
            )) : (
              <div className="lan-empty"><RefreshCw size={22} /><strong>附近还没人冒泡</strong><span>两台电脑开启附近工友并连在同一 WiFi 后，会自动出现。</span></div>
            )}
          </div>
        </section>
      </div>

      <section className="panel buddy-panel">
        <div className="panel-header">
          <div><span className="section-kicker"><Star size={15} /> 常用搭子</span><h3>下次碰面，一眼认出</h3></div>
          <span className="panel-count">{lan.buddies.length} 人</span>
        </div>
        {lan.buddies.length ? (
          <div className="buddy-strip">
            {lan.buddies.map((buddy) => {
              const peer = lan.peers.find((candidate) => candidate.id === buddy.id)
              return (
                <div className="buddy-chip" key={buddy.id}>
                  <MemberAvatar member={peer || buddy} />
                  <span><strong>{peer?.name || buddy.name}</strong><small>{peer ? '附近在线' : '暂时离线'}</small></span>
                  {peer?.roomCode && peer.roomStatus === 'lobby' && <button className="icon-command" onClick={() => perform(() => joinRoom(peer.id))} title="加入工位房" aria-label="加入工位房"><LogIn size={15} /></button>}
                  <button className="icon-command is-saved" onClick={() => perform(() => toggleBuddy(buddy.id))} title="移出常用搭子" aria-label="移出常用搭子"><Star size={15} fill="currentColor" /></button>
                </div>
              )
            })}
          </div>
        ) : <div className="buddy-empty"><Star size={17} /> 在附近工友右侧点星标，即可收藏。</div>}
      </section>

      <div className="lan-privacy"><ShieldCheck size={16} /><span><strong>只比数量，不碰内容</strong> 局域网只同步昵称、形象、今日累计键数、实时 KPM 和在线状态；字符与历史统计始终留在本机。</span></div>
      {!stats.trackingEnabled && <div className="lan-paused"><CircleStop size={15} /> 全局检测已暂停，局内键数也会暂停。</div>}
    </div>
  )
}
