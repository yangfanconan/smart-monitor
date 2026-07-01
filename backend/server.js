import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { SystemCollector } from './collectors/system.js'
import { NetworkCollector } from './collectors/network.js'
import { ConntrackCollector } from './collectors/conntrack.js'
import { DhcpCollector } from './collectors/dhcp.js'
import { AlertManager } from './alerts/alert-manager.js'
import { ThreatDetector } from './analyzers/threat-detector.js'
import { DpiEngine } from './analyzers/dpi-engine.js'
import { PacketCapture } from './analyzers/packet-capture.js'
import { CaptureConfig, captureConfig } from './analyzers/capture-config.js'
import { getDeviceAnalytics, getDeviceDetail, getCategorySummary, getHourlyDistribution, getCrossDeviceAnalysis, getTrendAnalysis, generateReport } from './analyzers/user-analytics.js'
import { LlmAnalyzer, llmAnalyzer } from './analyzers/llm-analyzer.js'
import { IpResolver } from './analyzers/ip-resolver.js'
import { IpIntelligence } from './analyzers/ip-intelligence.js'
import { anomalyDetector } from './analyzers/anomaly-detector.js'
import { baselineManager } from './analyzers/baseline.js'
import { deviceActivity } from './analyzers/device-activity.js'
import { notifier } from './alerts/notifier.js'
import { storage } from './storage/db.js'
import { userStore } from './storage/user-store.js'
import { tokenManager } from './auth/token.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../frontend/dist')
const CONFIG_PATH = path.resolve(__dirname, '../config.json')
const PORT = 8080

// Load config
const config = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  : { alerts: { temperature: { critical: 85, warning: 70 }, cpu: { critical: 95, warning: 80 }, memory: { critical: 95, warning: 80 } } }

// MIME types
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json'
}

// Initialize modules
const systemCollector = new SystemCollector()
const networkCollector = new NetworkCollector()
const conntrackCollector = new ConntrackCollector()
const dhcpCollector = new DhcpCollector()
const alertManager = new AlertManager(config.alerts)
const threatDetector = new ThreatDetector()
const dpiEngine = new DpiEngine()
const packetCapture = new PacketCapture()
const ipResolver = new IpResolver()
const ipIntelligence = new IpIntelligence()

// Configure network uplink detection
if (config.network?.uplink) {
  networkCollector.setUplinkOverride(config.network.uplink)
  console.log(`Uplink interface configured: ${config.network.uplink}`)
}
if (config.network?.lanIfaces) {
  networkCollector.setLanIfaces(config.network.lanIfaces)
}

// WebSocket clients
const wsClients = new Set()

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() })
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

// Start collectors
systemCollector.start((data) => broadcast('system:update', data))
networkCollector.start((data) => broadcast('network:update', data))
conntrackCollector.start((data) => {
  broadcast('connection:update', data.slice(0, 200))
  const threats = threatDetector.analyze(data)
  for (const t of threats) {
    const alert = alertManager.addAlert(t)
    if (alert) {
      broadcast('alert:new', alert)
      broadcast('threat:detected', t)
    }
  }
})
dhcpCollector.start()
dpiEngine.start((data) => broadcast('dpi:update', data))

// Start packet capture for deep content inspection
let contentBroadcastBatch = []
let contentBroadcastTimer = setInterval(() => {
  if (contentBroadcastBatch.length > 0) {
    const batch = contentBroadcastBatch.splice(0)
    // Send only the first 10 items to avoid flooding, include count
    broadcast('content:batch', { items: batch.slice(0, 10), total: batch.length })
  }
}, 2000)

// Packet capture — full with broadcast
packetCapture.start((record) => {
  if (!captureConfig.shouldCaptureIp(record.srcIp)) return
  if (!captureConfig.shouldSaveType(record.contentType)) return
  if (!captureConfig.shouldCaptureSize(record.payloadLen)) return

  try {
    const summary = buildContentSummary(record)
    const detail = JSON.stringify(record.content)
    const rawHex = record.content?.raw || null
    storage.saveContentRecord(
      record.ts, record.protocol, record.srcIp, record.dstIp,
      record.srcPort, record.dstPort, record.contentType,
      record.encrypted, summary, detail, rawHex, record.payloadLen
    )
  } catch { /* ignore */ }

  // Broadcast
  contentBroadcastBatch.push({
    ts: record.ts, protocol: record.protocol,
    srcIp: record.srcIp, dstIp: record.dstIp,
    srcPort: record.srcPort, dstPort: record.dstPort,
    contentType: record.contentType, encrypted: record.encrypted,
    summary, payloadLen: record.payloadLen,
  })
  if (contentBroadcastBatch.length > 200) contentBroadcastBatch.splice(0, 100)
}, { iface: 'br-lan', filter: 'not port 8080' })

// Start IP intelligence engine
ipIntelligence.start(storage)

// Start anomaly detector — checks device behavior against historical baselines
anomalyDetector.start(
  (alert) => {
    const result = alertManager.addAlert(alert)
    if (result) {
      broadcast('alert:new', result)
      broadcast('anomaly:detected', alert)
    }
  },
  () => {
    // Build per-device stats from current connections
    const connections = conntrackCollector.getLatest()
    if (!connections?.length) return new Map()
    const stats = new Map()
    for (const conn of connections) {
      if (!conn.srcIp) continue
      const s = stats.get(conn.srcIp) || { connections: 0, rxBytes: 0, txBytes: 0 }
      s.connections++
      s.rxBytes += conn.replyBytes || 0
      s.txBytes += conn.origBytes || 0
      stats.set(conn.srcIp, s)
    }
    // Attach DHCP device list for name resolution
    stats._dhcpDevices = dhcpCollector.getDevices() || []
    return stats
  }
)

// Memory monitor — log every minute
setInterval(() => {
  const mem = process.memoryUsage()
  console.log(`[MEM] rss=${Math.round(mem.rss/1048576)}MB heap=${Math.round(mem.heapUsed/1048576)}MB ext=${Math.round(mem.external/1048576)}MB wsClients=${wsClients.size}`)
}, 60000).unref?.()

// Periodic database cleanup — trim old records every 30 min
setInterval(() => {
  try {
    const cutoff24h = Date.now() - 86400000
    const cutoff7d = Date.now() - 7 * 86400000
    // content_records: keep 24h
    const cr = storage.db.prepare('DELETE FROM content_records WHERE ts < ?').run(cutoff24h)
    // dpi_protocols: keep 24h
    const dp = storage.db.prepare('DELETE FROM dpi_protocols WHERE ts < ?').run(cutoff24h)
    // device_destinations: keep 7d
    const dd = storage.db.prepare('DELETE FROM device_destinations WHERE ts < ?').run(cutoff7d)
    // device_traffic: keep 7d
    const dt = storage.db.prepare('DELETE FROM device_traffic WHERE ts < ?').run(cutoff7d)
    // network_metrics: keep 7d
    const nm = storage.db.prepare('DELETE FROM network_metrics WHERE ts < ?').run(cutoff7d)
    // connection_snapshots: keep 24h
    const cs = storage.db.prepare('DELETE FROM connection_snapshots WHERE ts < ?').run(cutoff24h)
    // system_metrics: keep 7d
    const sm = storage.db.prepare('DELETE FROM system_metrics WHERE ts < ?').run(cutoff7d)
    console.log(`DB cleanup: content_records -${cr.changes}, dpi_protocols -${dp.changes}, device_destinations -${dd.changes}, device_traffic -${dt.changes}`)
  } catch (e) {
    console.warn('DB cleanup error:', e.message)
  }
}, 1800000).unref?.()

function buildContentSummary(record) {
  const c = record.content
  if (!c) return `${record.protocol.toUpperCase()} ${record.srcIp}:${record.srcPort} → ${record.dstIp}:${record.dstPort}`
  if (record.contentType === 'HTTP') {
    if (c.type === 'request') return `${c.method} ${c.fullUrl || c.uri}`
    return `HTTP ${c.statusCode} ${c.statusText}`
  }
  if (record.contentType === 'DNS') return c.summary || c.questions?.join(', ') || 'DNS'
  if (record.contentType === 'TLS') return `TLS ${c.tlsVersion || ''} ${c.handshakeType || c.contentType || ''}${c.serverName ? ' → ' + c.serverName : ''}`
  if (c.text) return c.text.substring(0, 120).replace(/\n/g, ' ')
  return `${record.contentType} ${record.payloadLen}B`
}

// Persist metrics to SQLite every 60 seconds
setInterval(() => {
  const sys = systemCollector.getLatest()
  const net = networkCollector.getLatest()
  const conn = conntrackCollector.getLatest()
  const dpi = dpiEngine.getStats()
  const now = Date.now()

  if (sys) {
    const tempMax = sys.temperature?.length ? Math.max(...sys.temperature.map(t => t.temp)) : 0
    storage.saveSystemMetric(now, sys.cpu, sys.memory?.usagePercent, sys.load?.load1, sys.load?.load5, sys.load?.load15, tempMax)
  }

  if (net?.interfaces) {
    for (const iface of net.interfaces) {
      storage.saveNetworkMetric(now, iface.name, iface.rx.bytes, iface.tx.bytes, iface.rxSpeed, iface.txSpeed)
    }
  }

  if (conn?.length) {
    const tcp = conn.filter(c => c.protocol === 'tcp').length
    const udp = conn.filter(c => c.protocol === 'udp').length
    const icmp = conn.filter(c => c.protocol === 'icmp').length
    const ips = new Set(conn.map(c => c.srcIp)).size
    storage.saveConnectionSnapshot(now, conn.length, tcp, udp, icmp, ips)
  }

  if (dpi?.protocols) {
    storage.saveDpiSnapshot(now, dpi.protocols)
  }

  // Save per-device traffic and destinations
  if (conn?.length) {
    const devices = dhcpCollector.getDevices()
    const deviceMap = new Map()
    for (const d of devices || []) deviceMap.set(d.ip, d)

    // Aggregate by source IP
    const trafficByIp = {}
    const destBySrcIp = {}

    for (const c of conn) {
      const srcIp = c.srcIp
      const dstIp = c.dstIp
      const dstPort = c.dport
      const protocol = c.protocol
      const txBytes = c.origBytes || 0
      const rxBytes = c.replyBytes || 0
      const totalBytes = c.bytes || (txBytes + rxBytes)

      // Traffic aggregation
      if (!trafficByIp[srcIp]) {
        const dev = deviceMap.get(srcIp)
        trafficByIp[srcIp] = { ip: srcIp, mac: dev?.mac || '', hostname: dev?.hostname || srcIp, rxBytes: 0, txBytes: 0, connections: 0 }
      }
      trafficByIp[srcIp].connections++
      trafficByIp[srcIp].rxBytes += rxBytes
      trafficByIp[srcIp].txBytes += txBytes

      // Destination aggregation (limit to prevent DB bloat)
      const destKey = `${srcIp}:${dstIp}:${dstPort}:${protocol}`
      if (!destBySrcIp[destKey]) {
        destBySrcIp[destKey] = { srcIp, dstIp, dstPort, protocol, bytes: 0, connections: 0 }
      }
      destBySrcIp[destKey].bytes += totalBytes
      destBySrcIp[destKey].connections++
    }

    // Save device traffic
    for (const [ip, data] of Object.entries(trafficByIp)) {
      storage.saveDeviceTraffic(now, data.ip, data.mac, data.hostname, data.rxBytes, data.txBytes, data.connections)
    }

    // Save device destinations (limit to top 50 per source IP)
    const destEntries = Object.values(destBySrcIp)
    const bySrcIp = {}
    for (const d of destEntries) {
      if (!bySrcIp[d.srcIp]) bySrcIp[d.srcIp] = []
      bySrcIp[d.srcIp].push(d)
    }
    for (const [srcIp, dests] of Object.entries(bySrcIp)) {
      const topDests = dests.sort((a, b) => b.bytes - a.bytes).slice(0, 50)
      for (const d of topDests) {
        storage.saveDeviceDestination(now, d.srcIp, d.dstIp, d.dstPort, d.protocol, d.bytes, d.connections)
      }
    }
  }
}, 60000)

// Cleanup old data every hour, vacuum if needed
setInterval(() => {
  storage.runCleanup()
  if (storage.shouldVacuum()) storage.vacuum()
}, 3600000)

// Content retention cleanup every 30 minutes — per-type based on capture config
setInterval(() => {
  try {
    const policies = captureConfig.getRetentionPolicies()
    let totalDeleted = 0
    for (const p of policies) {
      if (p.retentionHours <= 0) continue
      const cutoff = Date.now() - p.retentionHours * 3600 * 1000
      const result = storage.db.prepare('DELETE FROM content_records WHERE content_type = ? AND ts < ?').run(p.type, cutoff)
      if (result.changes) totalDeleted += result.changes
    }
    // Also clean up any records older than the default retention (excluding types with custom policies)
    const defaultHours = captureConfig.get().retention._default || 48
    const defaultCutoff = Date.now() - defaultHours * 3600 * 1000
    const customTypes = policies.filter(p => p.retentionHours > 0).map(p => p.type)
    let sql2 = 'DELETE FROM content_records WHERE ts < ?'
    const params2 = [defaultCutoff]
    if (customTypes.length > 0) {
      sql2 += ' AND content_type NOT IN (' + customTypes.map(() => '?').join(',') + ')'
      params2.push(...customTypes)
    }
    const r2 = storage.db.prepare(sql2).run(...params2)
    if (r2.changes) totalDeleted += r2.changes
    if (totalDeleted > 0) {
      storage._pendingDeletes = (storage._pendingDeletes || 0) + totalDeleted
      console.log(`Content cleanup: removed ${totalDeleted} expired records`)
    }
    if (storage.shouldVacuum()) storage.vacuum()
  } catch (e) {
    console.warn('Content cleanup error:', e.message)
  }
}, 1800000)

// System health alerts
setInterval(() => {
  const sys = systemCollector.getLatest()
  const alerts = alertManager.checkSystemThresholds(sys)
  for (const a of alerts) broadcast('alert:new', a)
}, 10000)

// HTTP server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // API routes
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json')

    // Auth check — skip for public endpoints
    if (!PUBLIC_API.includes(url.pathname)) {
      const token = extractToken(req)
      const session = tokenManager.validateToken(token)
      if (!session) {
        res.writeHead(401)
        res.end(JSON.stringify({ code: 401, msg: '未登录或登录已过期', data: null }))
        return
      }
      req.user = session
      req.token = token
    }

    // Read body for POST/PUT
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = ''
      let bodyTooLarge = false
      req.on('data', chunk => {
        body += chunk
        if (body.length > 10 * 1024 * 1024) { // 10MB limit
          bodyTooLarge = true
          res.writeHead(413)
          res.end(JSON.stringify({ code: 413, msg: 'Request body too large', data: null }))
          req.destroy()
        }
      })
      req.on('end', async () => {
        if (bodyTooLarge) return
        try {
          const parsed = body ? JSON.parse(body) : {}

          // Handle logout inline — revoke the current token
          if (url.pathname === '/api/auth/logout') {
            if (req.token) tokenManager.revokeToken(req.token)
            res.writeHead(200)
            res.end(JSON.stringify(ok(null)))
            return
          }

          const result = await handleApi(req.method, url.pathname, url.searchParams, parsed, req.user)
          res.writeHead(200)
          res.end(JSON.stringify(result))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ code: 500, msg: err.message, data: null }))
        }
      })
      return
    }

    try {
      const result = await handleApi(req.method, url.pathname, url.searchParams, null, req.user)
      res.writeHead(200)
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ code: 500, msg: err.message, data: null }))
    }
    return
  }

  // Static files (SPA fallback)
  let filePath = path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

// WebSocket server — auth via query param ?token=xxx
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/ws') {
    const token = url.searchParams.get('token')
    const session = tokenManager.validateToken(token)
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  }
})
wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.send(JSON.stringify({ event: 'init', data: { system: systemCollector.getLatest(), network: networkCollector.getLatest(), connections: conntrackCollector.getLatest().slice(0, 200), devices: dhcpCollector.getDevices() }, ts: Date.now() }))
  ws.on('close', () => wsClients.delete(ws))
})

// Helper: wrap response in framework format
function ok(data) { return { code: 200, msg: 'success', data } }

function tryParseJson(str) {
  if (!str) return null
  try { return JSON.parse(str) } catch { return str }
}

// Helper: get service name from IP and port
function getServiceName(ip, port) {
  const wellKnown = {
    '8.8.8.8': 'Google DNS', '8.8.4.4': 'Google DNS',
    '114.114.114.114': '114 DNS', '223.5.5.5': 'AliDNS',
    '1.1.1.1': 'Cloudflare DNS', '9.9.9.9': 'Quad9 DNS',
    '208.67.222.222': 'OpenDNS'
  }
  if (wellKnown[ip]) return wellKnown[ip]
  if (port === 53) return 'DNS'
  if (port === 443 || port === 8443) return 'HTTPS'
  if (port === 80 || port === 8080) return 'HTTP'
  if (port === 22) return 'SSH'
  if (port === 21) return 'FTP'
  if (port === 25) return 'SMTP'
  if (port === 110) return 'POP3'
  if (port === 143) return 'IMAP'
  if (port === 993) return 'IMAPS'
  if (port === 995) return 'POP3S'
  if (port === 3306) return 'MySQL'
  if (port === 5432) return 'PostgreSQL'
  if (port === 6379) return 'Redis'
  if (port === 27017) return 'MongoDB'
  if (port === 1883) return 'MQTT'
  if (port === 5683) return 'CoAP'
  if (port === 1900) return 'UPnP'
  if (port === 5353) return 'mDNS'
  return null
}

const PUBLIC_API = ['/api/auth/login', '/api/auth/refresh', '/api/health']

function extractToken(req) {
  const auth = req.headers.authorization
  if (auth) return auth.replace(/^Bearer\s+/i, '').trim()
  const url = new URL(req.url, 'http://x')
  return url.searchParams.get('token')
}

function hashPassword(pwd) { return crypto.createHash('sha256').update(pwd).digest('hex') }

async function handleApi(method, pathname, params, body, user) {
  // === Auth APIs ===
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { userName, password } = body || {}
    const authedUser = userStore.authenticate(userName, password)
    if (!authedUser) return { code: 400, msg: '用户名或密码错误', data: null }
    const tokens = tokenManager.createSession(authedUser.id, authedUser.username, authedUser.roles)
    return ok({ token: tokens.accessToken, refreshToken: tokens.refreshToken })
  }

  if (pathname === '/api/auth/refresh' && method === 'POST') {
    const { refreshToken } = body || {}
    const tokens = tokenManager.refreshSession(refreshToken)
    if (!tokens) return { code: 401, msg: '刷新令牌无效或已过期', data: null }
    return ok({ token: tokens.accessToken, refreshToken: tokens.refreshToken })
  }

  if (pathname === '/api/health' && method === 'GET') {
    return ok({
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      wsClients: wsClients.size,
      ts: Date.now()
    })
  }

  if (pathname === '/api/user/info' && method === 'GET') {
    const user = userStore.getUserList({ current: 1, size: 1 }).records[0]
    if (!user) return { code: 404, msg: '用户不存在', data: null }
    return ok({
      buttons: ['add', 'edit', 'delete', 'view'],
      roles: user.userRoles,
      userId: user.id,
      userName: user.userName,
      email: user.userEmail
    })
  }

  if (pathname === '/api/auth/logout') return ok(null)

  // === User CRUD ===
  if (pathname === '/api/user/list' && method === 'GET') {
    return ok(userStore.getUserList(Object.fromEntries(params)))
  }
  if (pathname === '/api/user/create' && method === 'POST') {
    try { return ok(userStore.createUser(body)) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/user/update' && method === 'PUT') {
    try { return ok(userStore.updateUser(body.id, body)) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/user/delete' && method === 'DELETE') {
    try { return ok(userStore.deleteUser(body?.id || params.get('id'))) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/user/change-password' && method === 'POST') {
    try { userStore.changePassword(body.userId, body.oldPassword, body.newPassword); return ok(null) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/user/reset-password' && method === 'POST') {
    try { userStore.resetPassword(body.userId, body.newPassword); return ok(null) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }

  // === Role CRUD ===
  if (pathname === '/api/content/config' && method === 'PUT') {
    try { return ok(captureConfig.update(body)) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/content/cleanup' && method === 'POST') {
    // Manual cleanup: delete records by type or all
    try {
      const { type, before } = body || {}
      let sql = 'DELETE FROM content_records WHERE 1=1'
      const p = []
      if (type) { sql += ' AND content_type = ?'; p.push(type) }
      if (before) { sql += ' AND ts < ?'; p.push(new Date(before).getTime()) }
      const result = storage.db.prepare(sql).run(...p)
      storage._pendingDeletes = (storage._pendingDeletes || 0) + result.changes
      return ok({ deleted: result.changes })
    } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/db/vacuum' && method === 'POST') {
    try {
      const result = storage.vacuum()
      if (!result) return { code: 500, msg: 'VACUUM failed', data: null }
      return ok(result)
    } catch (e) { return { code: 500, msg: e.message, data: null } }
  }
  if (pathname === '/api/db/stats' && method === 'GET') {
    try {
      return ok({
        size: storage.getDbSize(),
        tables: storage.getTableCounts(),
        pendingDeletes: storage._pendingDeletes || 0,
        lastVacuum: storage._lastVacuum || null
      })
    } catch (e) { return { code: 500, msg: e.message, data: null } }
  }

  // IP Intelligence mutations
  if (pathname.startsWith('/api/ip-intel/') && method === 'PUT') {
    const ip = decodeURIComponent(pathname.split('/').pop())
    try { storage.updateIpKnowledge(ip, body); return ok(null) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname.startsWith('/api/ip-intel/') && method === 'DELETE') {
    const ip = decodeURIComponent(pathname.split('/').pop())
    try { storage.deleteIpKnowledge(ip); return ok(null) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/ip-intel/refresh' && method === 'POST') {
    try { const r = await ipIntelligence.refresh(); return ok(r) } catch (e) { return { code: 500, msg: e.message, data: null } }
  }

  // LLM custom analysis prompt
  if (pathname === '/api/llm/analyze' && method === 'POST') {
    const { prompt, minutes = 60 } = body || {}
    if (!prompt) return { code: 400, msg: 'Missing prompt', data: null }
    try {
      const result = await llmAnalyzer.analyze(prompt, minutes)
      return ok(result)
    } catch (e) { return { code: 500, msg: e.message, data: null } }
  }

  // === Role CRUD ===
  if (pathname === '/api/role/list' && method === 'GET') {
    return ok(userStore.getRoleList(Object.fromEntries(params)))
  }
  if (pathname === '/api/role/create' && method === 'POST') {
    try { return ok(userStore.createRole(body)) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/role/update' && method === 'PUT') {
    try { return ok(userStore.updateRole(body.roleId, body)) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname === '/api/role/delete' && method === 'DELETE') {
    try { return ok(userStore.deleteRole(body?.roleId || params.get('roleId'))) } catch (e) { return { code: 400, msg: e.message, data: null } }
  }

  // === Menu API ===
  if (pathname === '/api/v3/system/menus' && method === 'GET') {
    return ok([
      {
        name: 'Monitor', path: '/monitor', component: '/index/index',
        meta: { title: '智能监控', icon: 'ri:monitor-line', roles: ['R_SUPER', 'R_ADMIN'] },
        children: [
          { path: 'dashboard', name: 'MonitorDashboard', component: '/monitor/dashboard/index', meta: { title: '监控总览', icon: 'ri:dashboard-line', keepAlive: false, fixedTab: true } },
          { path: 'system', name: 'MonitorSystem', component: '/monitor/system/index', meta: { title: '系统详情', icon: 'ri:cpu-line', keepAlive: true } },
          { path: 'network', name: 'MonitorNetwork', component: '/monitor/network/index', meta: { title: '网络流量', icon: 'ri:network-line', keepAlive: true } },
          { path: 'connections', name: 'MonitorConnections', component: '/monitor/analysis/index', meta: { title: '连接分析', icon: 'ri:links-line', keepAlive: true } },
          { path: 'user-traffic', name: 'MonitorUserTraffic', component: '/monitor/user-traffic/index', meta: { title: '用户流量', icon: 'ri:bar-chart-box-line', keepAlive: true } },
          { path: 'access-records', name: 'MonitorAccessRecords', component: '/monitor/access-records/index', meta: { title: '访问记录', icon: 'ri:history-line', keepAlive: true } },
          { path: 'security', name: 'MonitorSecurity', component: '/monitor/security/index', meta: { title: '安全中心', icon: 'ri:shield-check-line', keepAlive: true } },
          { path: 'alerts', name: 'MonitorAlerts', component: '/monitor/alerts/index', meta: { title: '告警中心', icon: 'ri:alert-line', keepAlive: true } },
          { path: 'topology', name: 'MonitorTopology', component: '/monitor/topology/index', meta: { title: '网络拓扑', icon: 'ri:node-tree', keepAlive: true } },
          { path: 'device-activity', name: 'MonitorDeviceActivity', component: '/monitor/device-activity/index', meta: { title: '设备活动', icon: 'ri:device-line', keepAlive: true } }
        ]
      },
      {
        name: 'System', path: '/system', component: '/index/index',
        meta: { title: '系统管理', icon: 'ri:settings-3-line', roles: ['R_SUPER', 'R_ADMIN'] },
        children: [
          { path: 'user', name: 'SystemUser', component: '/system/user/index', meta: { title: '用户管理', icon: 'ri:user-line', keepAlive: true } },
          { path: 'role', name: 'SystemRole', component: '/system/role/index', meta: { title: '角色管理', icon: 'ri:team-line', keepAlive: true } },
          { path: 'menu', name: 'SystemMenu', component: '/system/menu/index', meta: { title: '菜单管理', icon: 'ri:menu-line', keepAlive: true } },
          { path: 'user-center', name: 'SystemUserCenter', component: '/system/user-center/index', meta: { title: '个人中心', icon: 'ri:user-settings-line', keepAlive: true } }
        ]
      }
    ])
  }

  // === Notification channels ===
  if (pathname === '/api/notify/channels' && method === 'GET') {
    return ok(notifier.getChannels())
  }
  if (pathname === '/api/notify/channels' && method === 'PUT') {
    try {
      const channels = (body.channels || body || []).map(ch => ({
        ...ch,
        id: ch.id || crypto.randomBytes(4).toString('hex'),
      }))
      notifier.saveConfig(channels)
      return ok(notifier.getChannels())
    } catch (e) { return { code: 400, msg: e.message, data: null } }
  }
  if (pathname.startsWith('/api/notify/test/') && method === 'POST') {
    const channelId = pathname.split('/').pop()
    try {
      const result = await notifier.testChannel(channelId)
      return ok(result)
    } catch (e) { return { code: 500, msg: e.message, data: null } }
  }

  // === Anomaly detection ===
  if (pathname === '/api/anomaly/status' && method === 'GET') {
    return ok(anomalyDetector.getStatus())
  }
  if (pathname === '/api/anomaly/current' && method === 'GET') {
    return ok(anomalyDetector.getAnomalies())
  }
  if (pathname === '/api/anomaly/baselines' && method === 'GET') {
    const ip = params.get('ip') || undefined
    return ok(baselineManager.getBaselines(ip))
  }
  if (pathname === '/api/anomaly/profile' && method === 'GET') {
    const ip = params.get('ip')
    if (!ip) return { code: 400, msg: 'Missing ip', data: null }
    return ok(baselineManager.getDeviceSummary(ip))
  }

  // === Device Activity ===
  if (pathname === '/api/device-activity/devices' && method === 'GET') {
    return ok(deviceActivity.getDevices())
  }
  if (pathname === '/api/device-activity/timeline' && method === 'GET') {
    const ip = params.get('ip')
    const hours = parseInt(params.get('hours') || '24', 10)
    if (!ip) return { code: 400, msg: 'Missing ip', data: null }
    return ok(deviceActivity.getTimeline(ip, hours))
  }
  if (pathname === '/api/device-activity/apps' && method === 'GET') {
    const ip = params.get('ip')
    const hours = parseInt(params.get('hours') || '24', 10)
    if (!ip) return { code: 400, msg: 'Missing ip', data: null }
    return ok(deviceActivity.getApps(ip, Date.now() - hours * 3600000, Date.now()))
  }

  // === Monitor APIs ===
  switch (pathname) {
    case '/api/system/overview': return ok(systemCollector.getLatest())
    case '/api/system/cpu': return ok(systemCollector.getCpuDetail())
    case '/api/system/temperature': return ok(systemCollector.getTemperature())
    case '/api/system/memory': return ok(systemCollector.getMemoryDetail())
    case '/api/system/disk': return ok(systemCollector.getDiskDetail())
    case '/api/network/interfaces': return ok(networkCollector.getInterfaces())
    case '/api/network/traffic': return ok(networkCollector.getTrafficByDevice(conntrackCollector.getLatest(), dhcpCollector.getDevices()))
    case '/api/network/connections': {
      const all = conntrackCollector.getLatest()
      return ok({ list: all.slice(0, 200), total: all.length })
    }
    case '/api/network/devices': return ok(dhcpCollector.getDevices())
    case '/api/topology': {
      const devices = dhcpCollector.getDevices() || []
      const conns = conntrackCollector.getLatest() || []
      const lanIps = new Set(devices.map(d => d.ip))
      const deviceMap = new Map()
      for (const d of devices) deviceMap.set(d.ip, d)

      // Aggregate traffic per (srcIp → dstIp)
      const edgeMap = new Map()
      for (const c of conns) {
        if (!lanIps.has(c.srcIp)) continue
        const dstIp = c.dstIp
        if (lanIps.has(dstIp)) continue // skip LAN-to-LAN for clarity
        const key = `${c.srcIp}|${dstIp}`
        const e = edgeMap.get(key) || { srcIp: c.srcIp, dstIp, bytes: 0, connections: 0, protocol: c.protocol }
        e.bytes += c.bytes || 0
        e.connections++
        edgeMap.set(key, e)
      }

      // Top 30 external destinations by total bytes
      const dstBytes = {}
      for (const e of edgeMap.values()) {
        dstBytes[e.dstIp] = (dstBytes[e.dstIp] || 0) + e.bytes
      }
      const topDsts = Object.entries(dstBytes).sort((a, b) => b[1] - a[1]).slice(0, 30)
      const topDstIps = new Set(topDsts.map(d => d[0]))

      // Resolve names for destinations
      const resolvedNames = await ipResolver.resolveBatch([...topDstIps])

      // Build nodes
      const nodes = []
      // Router node
      nodes.push({ id: 'router', name: '路由器', symbolSize: 50, category: 0,
        detail: { type: 'router', ip: '192.168.1.1' } })

      // LAN device nodes
      for (const d of devices) {
        const edges = [...edgeMap.values()].filter(e => e.srcIp === d.ip && topDstIps.has(e.dstIp))
        const totalBytes = edges.reduce((s, e) => s + e.bytes, 0)
        nodes.push({
          id: d.ip, name: d.hostname || d.ip, symbolSize: Math.max(18, Math.min(35, 10 + Math.log10(totalBytes + 1) * 4)),
          category: 1,
          detail: { type: 'device', ip: d.ip, mac: d.mac, hostname: d.hostname, source: d.source, totalBytes },
        })
      }

      // External destination nodes
      for (const [ip, bytes] of topDsts) {
        const name = resolvedNames[ip] || ip
        nodes.push({
          id: ip, name: name.length > 18 ? name.substring(0, 16) + '…' : name,
          symbolSize: Math.max(12, Math.min(25, 8 + Math.log10(bytes + 1) * 3)),
          category: 2,
          detail: { type: 'external', ip, name, bytes },
        })
      }

      // Build edges
      const links = []
      // Router → each LAN device
      for (const d of devices) {
        const total = [...edgeMap.values()].filter(e => e.srcIp === d.ip).reduce((s, e) => s + e.bytes, 0)
        links.push({ source: 'router', target: d.ip, value: total, lineStyle: { width: Math.max(1, Math.min(4, Math.log10(total + 1) * 1.2)) } })
      }
      // LAN device → external destinations (only top ones)
      for (const e of edgeMap.values()) {
        if (!topDstIps.has(e.dstIp)) continue
        links.push({ source: e.srcIp, target: e.dstIp, value: e.bytes, lineStyle: { width: Math.max(0.5, Math.min(3, Math.log10(e.bytes + 1) * 1.5)) } })
      }

      return ok({
        nodes, links,
        categories: [
          { name: '路由器', color: '#409eff' },
          { name: '局域网设备', color: '#67c23a' },
          { name: '外部服务', color: '#909399' },
        ],
        stats: { devices: devices.length, connections: conns.length, externalTargets: topDsts.length },
      })
    }
    case '/api/analysis/protocols': return ok(conntrackCollector.getProtocolStats())
    case '/api/analysis/dns': return ok(conntrackCollector.getDnsQueries())
    case '/api/analysis/top-domains': return ok(conntrackCollector.getTopDomains())
    case '/api/security/threats': return ok(threatDetector.getThreats())
    case '/api/security/rules': return ok(threatDetector.getRules())
    case '/api/dpi/stats': return ok(dpiEngine.getStats())
    case '/api/dpi/protocols': return ok(dpiEngine.getProtocolDistribution())
    case '/api/dpi/dns': return ok(dpiEngine.getDnsQueries())
    case '/api/dpi/http': return ok(dpiEngine.getHttpHosts())
    case '/api/dpi/tls': return ok(dpiEngine.getTlsSnis())
    case '/api/alerts': return ok(alertManager.getAlerts(params.get('status')))
    case '/api/alerts/unread': return ok({ count: alertManager.getUnreadCount() })
    case '/api/history/system': return ok(storage.getSystemHistory(parseInt(params.get('minutes') || '60')))
    case '/api/history/network': return ok(storage.getNetworkHistory(params.get('iface') || 'eth1', parseInt(params.get('minutes') || '60')))
    case '/api/history/connections': return ok(storage.getConnectionHistory(parseInt(params.get('minutes') || '60')))
    case '/api/history/dpi': return ok(storage.getDpiHistory(parseInt(params.get('minutes') || '60')))
    case '/api/user-traffic': return ok(storage.getDeviceTrafficHistory(parseInt(params.get('minutes') || '60')))
    case '/api/user-traffic/ip': return ok(storage.getDeviceTrafficByIp(params.get('ip') || '', parseInt(params.get('minutes') || '60')))
    case '/api/access-records': {
      const records = storage.getDeviceDestinations(params.get('srcIp') || '', parseInt(params.get('minutes') || '60'))
      // Add resolved names for each destination IP
      const resolved = await ipResolver.resolveBatch([...new Set(records.map(r => r.dst_ip))])
      const enriched = records.map(r => ({
        ...r,
        resolvedName: resolved[r.dst_ip] || null,
        serviceName: getServiceName(r.dst_ip, r.dst_port)
      }))
      return ok(enriched)
    }
    // Content inspection
    case '/api/content/list': {
      const records = storage.getContentRecords({
        limit: Math.min(parseInt(params.get('limit') || '100'), 500),
        offset: parseInt(params.get('offset') || '0'),
        contentType: params.get('type') || undefined,
        srcIp: params.get('srcIp') || undefined,
        dstIp: params.get('dstIp') || undefined,
        keyword: params.get('keyword') || undefined,
        minutes: parseInt(params.get('minutes') || '60'),
        encrypted: params.has('encrypted') ? params.get('encrypted') === 'true' : undefined,
        minSize: params.has('minSize') ? parseInt(params.get('minSize')) : undefined,
        maxSize: params.has('maxSize') ? parseInt(params.get('maxSize')) : undefined,
      })
      return ok(records.map(r => ({
        ...r,
        detail: tryParseJson(r.detail),
      })))
    }
    case '/api/content/detail': {
      const id = parseInt(params.get('id') || '0')
      if (!id) return { code: 400, msg: 'Missing id', data: null }
      const record = storage.getContentRecord(id)
      if (!record) return { code: 404, msg: 'Not found', data: null }
      return ok({ ...record, detail: tryParseJson(record.detail) })
    }
    case '/api/content/stats': {
      const minutes = parseInt(params.get('minutes') || '60')
      return ok(storage.getContentStats(minutes))
    }
    case '/api/content/realtime': {
      return ok(packetCapture.getSnapshots(parseInt(params.get('limit') || '50')))
    }
    case '/api/content/capture-stats': {
      return ok(packetCapture.getStats())
    }

    // Capture config management
    case '/api/content/config': {
      return ok(captureConfig.get())
    }

    // User behavior analytics
    case '/api/analytics/devices': {
      const minutes = parseInt(params.get('minutes') || '60')
      return ok(getDeviceAnalytics(minutes))
    }
    case '/api/analytics/device': {
      const ip = params.get('ip') || ''
      const minutes = parseInt(params.get('minutes') || '60')
      if (!ip) return { code: 400, msg: 'Missing ip', data: null }
      return ok(getDeviceDetail(ip, minutes))
    }
    case '/api/analytics/categories': {
      const minutes = parseInt(params.get('minutes') || '60')
      return ok(getCategorySummary(minutes))
    }
    case '/api/analytics/hourly': {
      const minutes = parseInt(params.get('minutes') || '1440')
      return ok(getHourlyDistribution(minutes))
    }
    case '/api/analytics/trend': {
      const minutes = parseInt(params.get('minutes') || '60')
      const window = parseInt(params.get('window') || '10')
      return ok(getTrendAnalysis(minutes, window))
    }
    case '/api/analytics/cross-device': {
      const minutes = parseInt(params.get('minutes') || '60')
      return ok(getCrossDeviceAnalysis(minutes))
    }
    case '/api/analytics/report': {
      const minutes = parseInt(params.get('minutes') || '60')
      const html = generateReport(minutes)
      return { code: 200, msg: 'success', data: { html, generatedAt: Date.now(), minutes } }
    }

    // LLM analysis
    case '/api/llm/status': {
      const status = await llmAnalyzer.checkAvailability()
      return ok(status)
    }
    case '/api/llm/summary': {
      const minutes = parseInt(params.get('minutes') || '60')
      try {
        const result = await llmAnalyzer.quickSummary(minutes)
        return ok(result)
      } catch (e) { return { code: 500, msg: e.message, data: null } }
    }
    case '/api/llm/security': {
      const minutes = parseInt(params.get('minutes') || '60')
      try {
        const result = await llmAnalyzer.securityAnalysis(minutes)
        return ok(result)
      } catch (e) { return { code: 500, msg: e.message, data: null } }
    }
    case '/api/llm/device': {
      const ip = params.get('ip') || ''
      const minutes = parseInt(params.get('minutes') || '60')
      try {
        const result = await llmAnalyzer.analyzeDevice(ip, minutes)
        return ok(result)
      } catch (e) { return { code: 500, msg: e.message, data: null } }
    }

    // IP Intelligence
    case '/api/ip-intel/list': {
      const limit = Math.min(parseInt(params.get('limit') || '50'), 200)
      const offset = parseInt(params.get('offset') || '0')
      const keyword = params.get('keyword') || undefined
      const app = params.get('app') || undefined
      const category = params.get('category') || undefined
      const country = params.get('country') || undefined
      const source = params.get('source') || undefined
      const items = storage.listIpKnowledge({ limit, offset, keyword, app, category, country, source })
      const total = storage.countIpKnowledge({ keyword, app, category, country, source })
      return ok({ items, total, limit, offset })
    }
    case '/api/ip-intel/stats': return ok(storage.getIpKnowledgeStats())
    case '/api/ip-intel/geo': return ok(storage.getIpKnowledgeGeo())

    default: return { code: 404, msg: 'Not found', data: null }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Monitor running at http://0.0.0.0:${PORT}`)
  console.log(`Serving frontend from: ${DIST_DIR}`)
})
