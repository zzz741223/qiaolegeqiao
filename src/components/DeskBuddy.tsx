import type { AvatarId } from '../types'
import { avatarMeta } from '../data/avatars'

export type BuddyMood = 'idle' | 'typing' | 'streak' | 'oops' | 'done'

interface DeskBuddyProps {
  avatarId: AvatarId
  mood?: BuddyMood
  compact?: boolean
}

export function DeskBuddy({ avatarId, mood = 'idle', compact = false }: DeskBuddyProps) {
  return (
    <div
      className={`buddy buddy--${avatarId} buddy--${mood} ${compact ? 'buddy--compact' : ''}`}
      role="img"
      aria-label={`${avatarMeta[avatarId].name}，${avatarMeta[avatarId].role}`}
    >
      <div className="buddy__signal">
        <span />
        <i />
      </div>
      <div className="buddy__shadow" />
      <div className="buddy__ear buddy__ear--left" />
      <div className="buddy__ear buddy__ear--right" />
      <div className="buddy__body">
        <div className="buddy__shine" />
        <div className="buddy__face">
          <span className="buddy__eye buddy__eye--left" />
          <span className="buddy__eye buddy__eye--right" />
          <span className="buddy__cheek buddy__cheek--left" />
          <span className="buddy__cheek buddy__cheek--right" />
          <span className="buddy__mouth" />
        </div>
        <div className="buddy__badge" />
      </div>
      <div className="buddy__arm buddy__arm--left" />
      <div className="buddy__arm buddy__arm--right" />
      <div className="buddy__foot buddy__foot--left" />
      <div className="buddy__foot buddy__foot--right" />
      <div className="buddy__keyboard">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  )
}
