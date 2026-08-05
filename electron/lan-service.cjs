const { randomInt } = require('node:crypto')
const { Bonjour } = require('bonjour-service')
const { WebSocket, WebSocketServer } = require('ws')

const SERVICE_TYPE = 'qiaoqiao'
const MESSAGE_LIMIT_BYTES = 8192
const ROOM_LIMIT = 20
const ALLOWED_DURATIONS = new Set([15, 30, 60])
const ALLOWED_AVATARS = new Set(['spark', 'rice', 'lamp', 'cloud'])

function clampText(value, fallback, maxLength = 24) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  return normalized.slice(0, maxLength) || fallback
}

function safeAvatar(value) {
  return ALLOWED_AVATARS.has(value) ? value : 'spark'
}

function sanitizeProfile(profile, fallbackId = '') {
  return {
    id: clampText(profile?.id, fallbackId, 64),
    name: clampText(profile?.name, '匿名工友', 18),
    avatarId: safeAvatar(profile?.avatarId),
  }
}

function sanitizePresence(presence) {
  const profile = sanitizeProfile(presence?.profile || presence)
  return {
    ...profile,
    todayKeystrokes: numeric(presence?.todayKeystrokes, 0, 10000000),
    currentKpm: numeric(presence?.currentKpm, 0, 3000),
    isTyping: Boolean(presence?.isTyping),
  }
}

function roomCode() {
  return String(randomInt(100000, 1000000))
}

function formatWebSocketHost(address) {
  return address.includes(':') ? `[${address}]` : address
}

function usableAddress(service) {
  const addresses = Array.isArray(service?.addresses) ? service.addresses : []
  const ipv4 = addresses.find((address) => (
    typeof address === 'string'
    && /^\d{1,3}(\.\d{1,3}){3}$/.test(address)
    && !address.startsWith('127.')
  ))
  if (ipv4) return ipv4
  const referred = service?.referer?.address
  if (typeof referred === 'string' && referred) return referred.replace(/^::ffff:/, '')
  return addresses.find((address) => typeof address === 'string' && address !== '::1') || ''
}

function parseMessage(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (buffer.byteLength > MESSAGE_LIMIT_BYTES) return null
  try {
    const parsed = JSON.parse(buffer.toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function numeric(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    avatarId: member.avatarId,
    sessionKeys: numeric(member.sessionKeys),
    currentKpm: numeric(member.currentKpm, 0, 3000),
    connected: member.connected !== false,
    isHost: Boolean(member.isHost),
  }
}

function publicRoom(room, selfId) {
  if (!room) return null
  return {
    code: room.code,
    role: room.hostId === selfId ? 'host' : 'guest',
    hostId: room.hostId,
    status: room.status,
    durationMinutes: room.durationMinutes,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    finishedAt: room.finishedAt,
    members: Array.from(room.members.values())
      .map(publicMember)
      .sort((left, right) => right.sessionKeys - left.sessionKeys || right.currentKpm - left.currentKpm),
  }
}

class LanService {
  constructor({ getProfile, onChange, getMetrics }) {
    this.getProfile = getProfile
    this.getMetrics = getMetrics || (() => ({ todayKeystrokes: 0, currentKpm: 0, isTyping: false }))
    this.onChange = onChange
    this.enabled = false
    this.available = false
    this.error = ''
    this.port = 0
    this.bonjour = null
    this.browser = null
    this.advertisement = null
    this.server = null
    this.peers = new Map()
    this.room = null
    this.hostSockets = new Map()
    this.presenceSockets = new Set()
    this.peerSockets = new Map()
    this.peerRetryTimers = new Map()
    this.peerRemovalTimers = new Map()
    this.clientSocket = null
    this.localSessionKeys = 0
    this.lastKpm = 0
    this.connectionNote = ''
    this.republishTimer = null
  }

  get self() {
    return sanitizeProfile(this.getProfile())
  }

  snapshot(savedBuddies = []) {
    const peers = Array.from(this.peers.values())
      .sort((left, right) => {
        if (left.roomCode && !right.roomCode) return -1
        if (!left.roomCode && right.roomCode) return 1
        return left.name.localeCompare(right.name, 'zh-CN')
      })
    return {
      enabled: this.enabled,
      available: this.available,
      error: this.error,
      connectionNote: this.connectionNote,
      selfId: this.self.id,
      port: this.port,
      peers,
      buddies: savedBuddies,
      room: publicRoom(this.room, this.self.id),
    }
  }

  notify() {
    this.onChange?.()
  }

  async start() {
    if (this.enabled) return
    this.enabled = true
    this.error = ''
    this.connectionNote = ''
    try {
      await this.startServer()
      this.startDiscovery()
      this.available = true
    } catch (error) {
      this.available = false
      this.error = error instanceof Error ? error.message : String(error)
      this.stopNetwork()
    }
    this.notify()
  }

  async stop() {
    if (!this.enabled) return
    this.enabled = false
    this.leaveRoom()
    this.stopNetwork()
    this.peers.clear()
    this.available = false
    this.error = ''
    this.connectionNote = ''
    this.notify()
  }

  startServer() {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: '0.0.0.0', port: 0, maxPayload: MESSAGE_LIMIT_BYTES })
      this.server = server
      server.once('listening', () => {
        const address = server.address()
        this.port = typeof address === 'object' && address ? address.port : 0
        resolve()
      })
      server.once('error', reject)
      server.on('connection', (socket) => this.acceptConnection(socket))
    })
  }

  startDiscovery() {
    this.bonjour = new Bonjour()
    this.browser = this.bonjour.find({ type: SERVICE_TYPE })
    this.browser.on('up', (service) => this.updatePeer(service))
    this.browser.on('down', (service) => this.removePeer(service))
    this.publish()
  }

  stopNetwork() {
    if (this.republishTimer) clearTimeout(this.republishTimer)
    this.republishTimer = null
    try { this.advertisement?.stop() } catch {}
    try { this.browser?.stop() } catch {}
    try { this.bonjour?.destroy() } catch {}
    for (const socket of this.hostSockets.values()) {
      try { socket.close(1001, '服务已关闭') } catch {}
    }
    this.hostSockets.clear()
    for (const socket of this.presenceSockets) {
      try { socket.close(1001, '服务已关闭') } catch {}
    }
    this.presenceSockets.clear()
    for (const socket of this.peerSockets.values()) {
      try { socket.close(1000, '已退出') } catch {}
    }
    this.peerSockets.clear()
    for (const timer of this.peerRetryTimers.values()) clearTimeout(timer)
    this.peerRetryTimers.clear()
    for (const timer of this.peerRemovalTimers.values()) clearTimeout(timer)
    this.peerRemovalTimers.clear()
    if (this.clientSocket) {
      const socket = this.clientSocket
      this.clientSocket = null
      try { socket.close(1000, '已退出') } catch {}
    }
    try { this.server?.close() } catch {}
    this.advertisement = null
    this.browser = null
    this.bonjour = null
    this.server = null
    this.port = 0
  }

  publish() {
    if (!this.bonjour || !this.port) return
    const self = this.self
    const room = publicRoom(this.room, self.id)
    this.advertisement = this.bonjour.publish({
      name: `敲了个敲-${self.id.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: this.port,
      txt: {
        v: '1',
        id: self.id,
        name: self.name,
        avatar: self.avatarId,
        room: room?.role === 'host' ? room.code : '',
        status: room?.role === 'host' ? room.status : '',
        duration: room?.role === 'host' ? String(room.durationMinutes) : '',
      },
    })
  }

  scheduleRepublish() {
    if (!this.enabled || !this.bonjour) return
    if (this.republishTimer) clearTimeout(this.republishTimer)
    this.republishTimer = setTimeout(() => {
      this.republishTimer = null
      const previous = this.advertisement
      this.advertisement = null
      if (previous) previous.stop(() => this.publish())
      else this.publish()
    }, 120)
  }

  profileChanged() {
    if (this.room) {
      const member = this.room.members.get(this.self.id)
      if (member) Object.assign(member, this.self)
      if (this.room.hostId === this.self.id) this.broadcastRoom()
      else this.sendClientReport()
    }
    this.scheduleRepublish()
    this.broadcastPresence()
    this.notify()
  }

  updatePeer(service) {
    const txt = service?.txt || {}
    const id = clampText(txt.id, '', 64)
    if (!id || id === this.self.id || txt.v !== '1') return
    const address = usableAddress(service)
    if (!address || !Number.isFinite(service.port)) return
    const removalTimer = this.peerRemovalTimers.get(id)
    if (removalTimer) clearTimeout(removalTimer)
    this.peerRemovalTimers.delete(id)
    const previous = this.peers.get(id)
    this.peers.set(id, {
      ...previous,
      id,
      name: clampText(txt.name, '附近工友', 18),
      avatarId: safeAvatar(txt.avatar),
      address,
      port: service.port,
      lastSeenAt: Date.now(),
      roomCode: /^\d{6}$/.test(txt.room || '') ? txt.room : '',
      roomStatus: ['lobby', 'running', 'finished'].includes(txt.status) ? txt.status : '',
      durationMinutes: ALLOWED_DURATIONS.has(Number(txt.duration)) ? Number(txt.duration) : 0,
      todayKeystrokes: previous?.todayKeystrokes || 0,
      currentKpm: previous?.currentKpm || 0,
      isTyping: previous?.isTyping || false,
      presenceAt: previous?.presenceAt || 0,
    })
    this.connectPresence(id)
    this.notify()
  }

  removePeer(service) {
    const id = clampText(service?.txt?.id, '', 64)
    if (!id || this.peerRemovalTimers.has(id)) return
    const timer = setTimeout(() => {
      this.peerRemovalTimers.delete(id)
      this.dropPeer(id)
    }, 2000)
    this.peerRemovalTimers.set(id, timer)
  }

  dropPeer(id) {
    const socket = this.peerSockets.get(id)
    if (socket) {
      this.peerSockets.delete(id)
      try { socket.close(1000, '工友已离开') } catch {}
    }
    const retryTimer = this.peerRetryTimers.get(id)
    if (retryTimer) clearTimeout(retryTimer)
    this.peerRetryTimers.delete(id)
    if (this.peers.delete(id)) this.notify()
  }

  connectPresence(peerId) {
    const peer = this.peers.get(peerId)
    if (!this.enabled || !this.available || !peer || this.peerSockets.has(peerId)) return
    const socket = new WebSocket(`ws://${formatWebSocketHost(peer.address)}:${peer.port}`)
    this.peerSockets.set(peerId, socket)
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'presence:watch', profile: this.self }))
    })
    socket.on('message', (data) => {
      const message = parseMessage(data)
      if (!message || message.type !== 'presence:state') return
      const presence = sanitizePresence(message.presence)
      if (presence.id !== peerId) return
      const current = this.peers.get(peerId)
      if (!current) return
      Object.assign(current, presence, { presenceAt: Date.now() })
      this.notify()
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (this.peerSockets.get(peerId) !== socket) return
      this.peerSockets.delete(peerId)
      if (!this.enabled || !this.peers.has(peerId) || this.peerRetryTimers.has(peerId)) return
      const timer = setTimeout(() => {
        this.peerRetryTimers.delete(peerId)
        this.connectPresence(peerId)
      }, 3000)
      this.peerRetryTimers.set(peerId, timer)
    })
  }

  presenceState() {
    return sanitizePresence({ profile: this.self, ...this.getMetrics() })
  }

  broadcastPresence() {
    if (!this.enabled) return
    const payload = JSON.stringify({ type: 'presence:state', presence: this.presenceState() })
    for (const socket of this.presenceSockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    }
  }

  createRoom(durationMinutes) {
    if (!this.enabled || !this.available) throw new Error('请先开启附近工友')
    const duration = Number(durationMinutes)
    if (!ALLOWED_DURATIONS.has(duration)) throw new Error('只支持 15、30 或 60 分钟')
    this.leaveRoom()
    const self = this.self
    this.localSessionKeys = 0
    this.room = {
      code: roomCode(),
      hostId: self.id,
      status: 'lobby',
      durationMinutes: duration,
      createdAt: Date.now(),
      startedAt: 0,
      endsAt: 0,
      finishedAt: 0,
      members: new Map([[self.id, {
        ...self,
        sessionKeys: 0,
        currentKpm: this.lastKpm,
        connected: true,
        isHost: true,
      }]]),
    }
    this.connectionNote = ''
    this.scheduleRepublish()
    this.notify()
    return this.snapshot()
  }

  startRoom() {
    if (!this.room || this.room.hostId !== this.self.id) throw new Error('只有房主能开赛')
    if (this.room.status !== 'lobby') throw new Error('房间已经开赛')
    const now = Date.now()
    this.localSessionKeys = 0
    this.room.status = 'running'
    this.room.startedAt = now
    this.room.endsAt = now + this.room.durationMinutes * 60 * 1000
    this.room.finishedAt = 0
    for (const member of this.room.members.values()) {
      member.sessionKeys = 0
      member.currentKpm = 0
    }
    this.scheduleRepublish()
    this.broadcastRoom()
    this.notify()
    return this.snapshot()
  }

  async joinRoom(target) {
    if (!this.enabled || !this.available) throw new Error('请先开启附近工友')
    if (this.room) throw new Error('请先退出当前工位房')
    const normalized = clampText(target, '', 64).toLowerCase()
    const peer = Array.from(this.peers.values()).find((candidate) => (
      candidate.id.toLowerCase() === normalized || candidate.roomCode === normalized
    ))
    if (!peer || !peer.roomCode) throw new Error('没找到这个房间，请确认在同一 WiFi 且房主仍在等候')
    if (peer.roomStatus !== 'lobby') throw new Error('这个房间已经开赛或结束了')
    this.connectionNote = '正在加入工位房…'
    this.notify()
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${formatWebSocketHost(peer.address)}:${peer.port}`)
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        socket.close()
        this.connectionNote = ''
        reject(new Error('连接超时，请检查 Windows 防火墙和局域网设置'))
        this.notify()
      }, 6000)

      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'room:join', roomCode: peer.roomCode, profile: this.self }))
      })
      socket.on('message', (data) => {
        const message = parseMessage(data)
        if (!message) return
        if (message.type === 'room:error') {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            this.connectionNote = ''
            reject(new Error(clampText(message.message, '加入失败', 80)))
            this.notify()
          }
          socket.close()
          return
        }
        if (message.type === 'room:closed') {
          this.clientSocket = null
          this.room = null
          this.localSessionKeys = 0
          this.connectionNote = clampText(message.message, '房主关闭了房间', 80)
          this.notify()
          return
        }
        if (message.type !== 'room:state') return
        const nextRoom = this.deserializeRoom(message.room)
        if (!nextRoom || nextRoom.code !== peer.roomCode) return
        this.room = nextRoom
        this.connectionNote = ''
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          this.clientSocket = socket
          resolve(this.snapshot())
        }
        this.notify()
      })
      socket.on('error', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          this.connectionNote = ''
          reject(new Error('连接失败，请检查双方是否在同一 WiFi'))
          this.notify()
        }
      })
      socket.on('close', () => {
        clearTimeout(timeout)
        if (this.clientSocket === socket) {
          this.clientSocket = null
          this.room = null
          this.localSessionKeys = 0
          this.connectionNote = '工位房连接已断开'
          this.notify()
        }
      })
    })
  }

  deserializeRoom(value) {
    if (!value || !/^\d{6}$/.test(value.code || '')) return null
    if (!['lobby', 'running', 'finished'].includes(value.status)) return null
    const members = Array.isArray(value.members) ? value.members.slice(0, ROOM_LIMIT) : []
    const mapped = new Map()
    for (const rawMember of members) {
      const profile = sanitizeProfile(rawMember)
      if (!profile.id) continue
      mapped.set(profile.id, {
        ...profile,
        sessionKeys: numeric(rawMember.sessionKeys, 0, 10000000),
        currentKpm: numeric(rawMember.currentKpm, 0, 3000),
        connected: rawMember.connected !== false,
        isHost: Boolean(rawMember.isHost),
      })
    }
    return {
      code: value.code,
      hostId: clampText(value.hostId, '', 64),
      status: value.status,
      durationMinutes: ALLOWED_DURATIONS.has(Number(value.durationMinutes)) ? Number(value.durationMinutes) : 15,
      createdAt: numeric(value.createdAt),
      startedAt: numeric(value.startedAt),
      endsAt: numeric(value.endsAt),
      finishedAt: numeric(value.finishedAt),
      members: mapped,
    }
  }

  acceptConnection(socket) {
    let memberId = ''
    let isPresenceSubscriber = false
    socket.on('message', (data) => {
      const message = parseMessage(data)
      if (!message) return
      if (message.type === 'presence:watch') {
        isPresenceSubscriber = true
        this.presenceSockets.add(socket)
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'presence:state', presence: this.presenceState() }))
        }
        return
      }
      if (message.type === 'room:join') {
        if (!this.room || this.room.hostId !== this.self.id || message.roomCode !== this.room.code) {
          socket.send(JSON.stringify({ type: 'room:error', message: '房间不存在或房间码已失效' }))
          socket.close()
          return
        }
        if (this.room.status !== 'lobby') {
          socket.send(JSON.stringify({ type: 'room:error', message: '比赛已经开始，下局早点来' }))
          socket.close()
          return
        }
        const profile = sanitizeProfile(message.profile)
        if (!profile.id || profile.id === this.self.id) {
          socket.send(JSON.stringify({ type: 'room:error', message: '工友身份无效' }))
          socket.close()
          return
        }
        if (!this.room.members.has(profile.id) && this.room.members.size >= ROOM_LIMIT) {
          socket.send(JSON.stringify({ type: 'room:error', message: '工位房已满（最多 20 人）' }))
          socket.close()
          return
        }
        const previous = this.hostSockets.get(profile.id)
        if (previous && previous !== socket) previous.close(1000, '已在另一连接加入')
        memberId = profile.id
        this.hostSockets.set(memberId, socket)
        this.room.members.set(memberId, {
          ...profile,
          sessionKeys: 0,
          currentKpm: 0,
          connected: true,
          isHost: false,
        })
        this.broadcastRoom()
        this.notify()
        return
      }
      if (message.type === 'room:report' && memberId && this.room?.status === 'running') {
        const member = this.room.members.get(memberId)
        if (!member) return
        member.sessionKeys = Math.max(member.sessionKeys, numeric(message.sessionKeys, 0, 10000000))
        member.currentKpm = numeric(message.currentKpm, 0, 3000)
        const profile = sanitizeProfile(message.profile, memberId)
        member.name = profile.name
        member.avatarId = profile.avatarId
        this.broadcastRoom()
        this.notify()
      }
    })
    socket.on('close', () => {
      if (isPresenceSubscriber) this.presenceSockets.delete(socket)
      if (!memberId || this.hostSockets.get(memberId) !== socket) return
      this.hostSockets.delete(memberId)
      if (this.room?.status === 'lobby') this.room.members.delete(memberId)
      else {
        const member = this.room?.members.get(memberId)
        if (member) {
          member.connected = false
          member.currentKpm = 0
        }
      }
      this.broadcastRoom()
      this.notify()
    })
  }

  broadcastRoom() {
    if (!this.room || this.room.hostId !== this.self.id) return
    const payload = JSON.stringify({ type: 'room:state', room: publicRoom(this.room, this.self.id) })
    for (const socket of this.hostSockets.values()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    }
  }

  sendClientReport() {
    if (!this.room || this.room.status !== 'running' || !this.clientSocket) return
    if (this.clientSocket.readyState !== WebSocket.OPEN) return
    this.clientSocket.send(JSON.stringify({
      type: 'room:report',
      profile: this.self,
      sessionKeys: this.localSessionKeys,
      currentKpm: this.lastKpm,
    }))
  }

  recordKeystroke(currentKpm) {
    if (this.room?.status !== 'running' || Date.now() >= this.room.endsAt) return
    this.localSessionKeys += 1
    this.lastKpm = currentKpm
    const selfMember = this.room.members.get(this.self.id)
    if (selfMember) {
      selfMember.sessionKeys = this.localSessionKeys
      selfMember.currentKpm = currentKpm
    }
  }

  tick(currentKpm) {
    this.lastKpm = currentKpm
    const now = Date.now()
    if (this.room?.status === 'running') {
      const selfMember = this.room.members.get(this.self.id)
      if (selfMember) selfMember.currentKpm = currentKpm
      if (this.room.hostId === this.self.id) {
        if (now >= this.room.endsAt) {
          this.room.status = 'finished'
          this.room.finishedAt = now
          for (const member of this.room.members.values()) member.currentKpm = 0
          this.scheduleRepublish()
        }
        this.broadcastRoom()
      } else {
        this.sendClientReport()
      }
    }
    this.broadcastPresence()
    this.notify()
  }

  leaveRoom() {
    if (!this.room && !this.clientSocket) return this.snapshot()
    const wasHost = this.room?.hostId === this.self.id
    if (wasHost) {
      const payload = JSON.stringify({ type: 'room:closed', message: '房主收起了工位房' })
      for (const socket of this.hostSockets.values()) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload)
        socket.close(1000, '房间已关闭')
      }
      this.hostSockets.clear()
    }
    if (this.clientSocket) {
      const socket = this.clientSocket
      this.clientSocket = null
      socket.close(1000, '主动退出')
    }
    this.room = null
    this.localSessionKeys = 0
    this.connectionNote = ''
    this.scheduleRepublish()
    this.notify()
    return this.snapshot()
  }
}

module.exports = {
  ALLOWED_DURATIONS,
  LanService,
  formatWebSocketHost,
  parseMessage,
  publicRoom,
  sanitizeProfile,
  usableAddress,
}
