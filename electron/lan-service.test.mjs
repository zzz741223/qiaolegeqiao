import { afterEach, describe, expect, it } from 'vitest'
import lanModule from './lan-service.cjs'

const {
  LanService,
  formatWebSocketHost,
  parseMessage,
  publicRoom,
  sanitizeProfile,
  usableAddress,
} = lanModule

const services = []

afterEach(() => {
  for (const service of services.splice(0)) {
    service.leaveRoom()
    service.stopNetwork()
  }
})

function createService(profile, metrics) {
  const service = new LanService({ getProfile: () => profile, getMetrics: metrics, onChange: () => {} })
  services.push(service)
  return service
}

async function waitFor(check, timeout = 1500) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Condition timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('LAN data boundaries', () => {
  it('sanitizes the only profile fields sent to peers', () => {
    expect(sanitizeProfile({
      id: 'worker-a',
      name: '  牛马\u0000一号  ',
      avatarId: 'unknown',
      typedContent: 'should never leave this machine',
    })).toEqual({ id: 'worker-a', name: '牛马一号', avatarId: 'spark' })
  })

  it('sorts room members by session keys then speed', () => {
    const room = {
      code: '123456',
      hostId: 'a',
      status: 'running',
      durationMinutes: 15,
      createdAt: 1,
      startedAt: 2,
      endsAt: 3,
      finishedAt: 0,
      members: new Map([
        ['a', { id: 'a', name: 'A', avatarId: 'spark', sessionKeys: 10, currentKpm: 80, isHost: true }],
        ['b', { id: 'b', name: 'B', avatarId: 'rice', sessionKeys: 20, currentKpm: 40, isHost: false }],
      ]),
    }
    expect(publicRoom(room, 'a').members.map((member) => member.id)).toEqual(['b', 'a'])
  })

  it('rejects oversized or invalid messages and formats IPv6 hosts', () => {
    expect(parseMessage(Buffer.from('{bad json'))).toBeNull()
    expect(parseMessage(Buffer.alloc(9000))).toBeNull()
    expect(formatWebSocketHost('fe80::1234')).toBe('[fe80::1234]')
    expect(usableAddress({ addresses: ['::1', '192.168.1.8'] })).toBe('192.168.1.8')
  })
})

describe('LAN room transport', () => {
  it('streams live daily totals and KPM to nearby peers without joining a room', async () => {
    const host = createService(
      { id: 'presence-host', name: '榜一工友', avatarId: 'lamp' },
      () => ({ todayKeystrokes: 12345, currentKpm: 166, isTyping: true }),
    )
    const watcher = createService({ id: 'presence-watcher', name: '围观工友', avatarId: 'cloud' })
    host.enabled = true
    host.available = true
    watcher.enabled = true
    watcher.available = true
    await host.startServer()
    watcher.peers.set('presence-host', {
      id: 'presence-host',
      name: '榜一工友',
      avatarId: 'lamp',
      address: '127.0.0.1',
      port: host.port,
      lastSeenAt: Date.now(),
      roomCode: '',
      roomStatus: '',
      durationMinutes: 0,
    })

    watcher.connectPresence('presence-host')
    await waitFor(() => watcher.peers.get('presence-host')?.todayKeystrokes === 12345)

    expect(watcher.peers.get('presence-host')).toMatchObject({
      currentKpm: 166,
      isTyping: true,
      todayKeystrokes: 12345,
    })
  })

  it('joins a room and synchronizes global keystroke counts over WebSocket', async () => {
    const host = createService({ id: 'host-id', name: '房主', avatarId: 'spark' })
    const guest = createService({ id: 'guest-id', name: '工友', avatarId: 'rice' })
    host.enabled = true
    host.available = true
    guest.enabled = true
    guest.available = true
    await host.startServer()

    host.createRoom(15)
    guest.peers.set('host-id', {
      id: 'host-id',
      name: '房主',
      avatarId: 'spark',
      address: '127.0.0.1',
      port: host.port,
      lastSeenAt: Date.now(),
      roomCode: host.room.code,
      roomStatus: 'lobby',
      durationMinutes: 15,
    })

    await guest.joinRoom(host.room.code)
    expect(host.room.members.has('guest-id')).toBe(true)

    host.startRoom()
    await waitFor(() => guest.room?.status === 'running')
    host.recordKeystroke(96)
    guest.recordKeystroke(123)
    guest.recordKeystroke(123)
    guest.tick(123)

    await waitFor(() => host.room.members.get('guest-id')?.sessionKeys === 2)
    expect(host.room.members.get('host-id').sessionKeys).toBe(1)
    expect(host.room.members.get('guest-id').currentKpm).toBe(123)
    expect(publicRoom(host.room, 'host-id').members[0].id).toBe('guest-id')
  })
})
