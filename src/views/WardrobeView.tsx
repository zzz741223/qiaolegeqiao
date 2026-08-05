import { Check, Layers3, Palette, PencilLine, Pin, Rocket, Shirt, Sparkles } from 'lucide-react'
import { DeskBuddy } from '../components/DeskBuddy'
import { avatarMeta } from '../data/avatars'
import type { AvatarId, PetSize, ThemeId, UserPreferences } from '../types'

interface WardrobeViewProps {
  preferences: UserPreferences
  onChange: (preferences: Partial<UserPreferences>) => void
}

const avatarOptions: AvatarId[] = ['spark', 'rice', 'lamp', 'cloud']

const themeOptions: Array<{ id: ThemeId; name: string; note: string; colors: string[] }> = [
  { id: 'office', name: '晴天工位', note: '清爽、可靠、适合长时间陪伴', colors: ['#f5c84c', '#167d65', '#f4f6f8'] },
  { id: 'mint', name: '薄荷摸鱼', note: '眼睛喘口气的浅绿色', colors: ['#3d9b7b', '#f1c75b', '#eaf4ef'] },
  { id: 'night', name: '晚班模式', note: '低亮度，但不垮掉', colors: ['#f5b93f', '#61c3a5', '#20242b'] },
  { id: 'tomato', name: '番茄冲刺', note: '给短时任务一点热度', colors: ['#e85d4a', '#236f68', '#fff4ed'] },
]

const petSizes: Array<{ id: PetSize; label: string; note: string }> = [
  { id: 'small', label: '小只', note: '210 × 250' },
  { id: 'medium', label: '刚好', note: '270 × 320' },
  { id: 'large', label: '醒目', note: '340 × 395' },
]

export function WardrobeView({ preferences, onChange }: WardrobeViewProps) {
  const update = <Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) => {
    onChange({ [key]: value })
  }

  return (
    <div className="wardrobe-layout wardrobe-layout--pet">
      <section className="wardrobe-preview">
        <div className="preview-copy">
          <span className="section-kicker"><Sparkles size={15} /> 桌面实装</span>
          <h2>{avatarMeta[preferences.avatarId].name}</h2>
          <p>{avatarMeta[preferences.avatarId].role}</p>
        </div>
        <div className={`preview-stage preview-stage--${preferences.petSize}`}>
          <div className="preview-stage__dots"><span /><span /><span /></div>
          <DeskBuddy avatarId={preferences.avatarId} mood="streak" />
          <div className="preview-stage__floor" />
        </div>
        <div className="name-editor">
          <span><PencilLine size={17} /></span>
          <label>
            <small>工位昵称</small>
            <input
              value={preferences.displayName}
              onChange={(event) => update('displayName', event.target.value.slice(0, 12))}
              onBlur={() => {
                if (!preferences.displayName.trim()) update('displayName', '工位一号')
              }}
              aria-label="工位昵称"
            />
          </label>
        </div>
      </section>

      <section className="wardrobe-controls">
        <div className="panel wardrobe-panel">
          <div className="panel-header">
            <div><span className="section-kicker"><Shirt size={15} /> 形象</span><h3>换个搭子常驻桌面</h3></div>
            <span className="panel-count">全员可用</span>
          </div>
          <div className="avatar-grid">
            {avatarOptions.map((avatarId) => {
              const selected = preferences.avatarId === avatarId
              return (
                <button className={`avatar-option ${selected ? 'is-selected' : ''}`} onClick={() => update('avatarId', avatarId)} key={avatarId}>
                  {selected && <span className="selection-check"><Check size={14} /></span>}
                  <div className="avatar-option__visual"><DeskBuddy avatarId={avatarId} compact /></div>
                  <strong>{avatarMeta[avatarId].name}</strong>
                  <small>{avatarMeta[avatarId].role}</small>
                </button>
              )
            })}
          </div>
        </div>

        <div className="wardrobe-split">
          <div className="panel wardrobe-panel">
            <div className="panel-header"><div><span className="section-kicker"><Palette size={15} /> 皮肤</span><h3>给桌面换点颜色</h3></div></div>
            <div className="theme-list theme-list--single">
              {themeOptions.map((theme) => {
                const selected = preferences.themeId === theme.id
                return (
                  <button className={`theme-option ${selected ? 'is-selected' : ''}`} onClick={() => update('themeId', theme.id)} key={theme.id}>
                    <span className="theme-swatches">{theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
                    <span><strong>{theme.name}</strong><small>{theme.note}</small></span>
                    <i className="theme-radio">{selected && <Check size={13} />}</i>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="panel wardrobe-panel pet-form-panel">
            <div className="panel-header"><div><span className="section-kicker"><Layers3 size={15} /> 桌面形态</span><h3>大小与常驻方式</h3></div></div>
            <div className="pet-size-options">
              {petSizes.map((size) => (
                <button className={preferences.petSize === size.id ? 'is-selected' : ''} onClick={() => update('petSize', size.id)} key={size.id}>
                  <strong>{size.label}</strong><small>{size.note}</small>
                </button>
              ))}
            </div>
            <label className="setting-row"><span><Pin size={16} /><span><strong>始终置顶</strong><small>不被工作窗口盖住</small></span></span><input type="checkbox" checked={preferences.petAlwaysOnTop} onChange={(event) => update('petAlwaysOnTop', event.target.checked)} /></label>
            <label className="setting-row"><span><Rocket size={16} /><span><strong>开机启动</strong><small>登录后自动出现</small></span></span><input type="checkbox" checked={preferences.launchAtStartup} onChange={(event) => update('launchAtStartup', event.target.checked)} /></label>
          </div>
        </div>
      </section>
    </div>
  )
}
