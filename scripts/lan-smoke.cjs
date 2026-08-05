const { LanService } = require('../electron/lan-service.cjs')

const nodes = []

function createNode(profile, getMetrics) {
  const node = new LanService({ getProfile: () => profile, getMetrics, onChange: () => {} })
  nodes.push(node)
  return node
}

async function waitFor(check, label, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`${label}超时`)
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
}

async function main() {
  const host = createNode(
    { id: `smoke-host-${Date.now()}`, name: '冒烟房主', avatarId: 'spark' },
    () => ({ todayKeystrokes: 4321, currentKpm: 88, isTyping: true }),
  )
  const guest = createNode({ id: `smoke-guest-${Date.now()}`, name: '冒烟工友', avatarId: 'rice' })

  await Promise.all([host.start(), guest.start()])
  if (!host.available || !guest.available) throw new Error(host.error || guest.error || '局域网服务不可用')

  await waitFor(() => host.peers.has(guest.self.id) && guest.peers.has(host.self.id), 'mDNS 互相发现')
  await waitFor(() => guest.peers.get(host.self.id)?.todayKeystrokes === 4321, '附近实时榜同步')
  host.createRoom(15)
  await waitFor(() => guest.peers.get(host.self.id)?.roomCode === host.room.code, '房间广播')
  await guest.joinRoom(host.room.code)
  host.startRoom()
  await waitFor(() => guest.room?.status === 'running', '开赛状态同步')

  host.recordKeystroke(88)
  guest.recordKeystroke(132)
  guest.recordKeystroke(132)
  guest.tick(132)
  await waitFor(() => host.room.members.get(guest.self.id)?.sessionKeys === 2, '局内键数同步')

  const ranking = host.snapshot().room.members.map((member) => ({
    name: member.name,
    keys: member.sessionKeys,
    kpm: member.currentKpm,
  }))
  console.log(JSON.stringify({
    ok: true,
    discovered: host.peers.size,
    nearbyLive: guest.peers.get(host.self.id)?.todayKeystrokes,
    room: host.room.code,
    ranking,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    for (const node of nodes) node.stop()
  })
