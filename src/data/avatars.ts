import type { AvatarId } from '../types'

export const avatarMeta: Record<AvatarId, { name: string; role: string }> = {
  spark: { name: '阿闪', role: '键盘节拍员' },
  rice: { name: '饭团', role: '午休守门员' },
  lamp: { name: '小灯', role: '加班照明员' },
  cloud: { name: '云团', role: '情绪缓冲员' },
}
