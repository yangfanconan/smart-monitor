import { storage } from '../storage/db.js'

const GAP_THRESHOLD = 5 * 60 * 1000 // 5 min gap = new session

// Get all known devices with current online status
function getDevices() {
  const now = Date.now()
  const recentThreshold = now - 120000 // 2 min

  // Get latest activity per device
  const latest = storage.db.prepare(`
    SELECT ip, mac, hostname, MAX(ts) as last_seen,
           SUM(rx_bytes) as total_rx, SUM(tx_bytes) as total_tx,
           SUM(connections) as total_conn
    FROM device_traffic
    WHERE ts > ? AND ip NOT LIKE '%:%' AND ip != '0.0.0.0'
    GROUP BY ip
    ORDER BY last_seen DESC
  `).all(now - 86400000) // last 24h

  return latest.map(d => ({
    ip: d.ip,
    mac: d.mac,
    hostname: d.hostname === d.ip ? '' : d.hostname,
    online: d.last_seen > recentThreshold,
    lastSeen: d.last_seen,
    totalRx: d.total_rx,
    totalTx: d.total_tx,
    totalConnections: d.total_conn,
  }))
}

// Get online sessions for a device within a time range
function getSessions(ip, startTime, endTime) {
  const entries = storage.db.prepare(`
    SELECT ts, connections, rx_bytes, tx_bytes
    FROM device_traffic
    WHERE ip = ? AND ts >= ? AND ts <= ?
    ORDER BY ts ASC
  `).all(ip, startTime, endTime)

  if (!entries.length) return []

  // Group into sessions (continuous activity with < 5min gaps)
  const sessions = []
  let current = { start: entries[0].ts, end: entries[0].ts, entries: [entries[0]] }

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].ts - current.end < GAP_THRESHOLD) {
      current.end = entries[i].ts
      current.entries.push(entries[i])
    } else {
      sessions.push(finalizeSession(current))
      current = { start: entries[i].ts, end: entries[i].ts, entries: [entries[i]] }
    }
  }
  sessions.push(finalizeSession(current))
  return sessions
}

function finalizeSession(session) {
  const totalRx = session.entries.reduce((s, e) => s + e.rx_bytes, 0)
  const totalTx = session.entries.reduce((s, e) => s + e.tx_bytes, 0)
  const totalConn = session.entries.reduce((s, e) => s + e.connections, 0)
  return {
    start: session.start,
    end: session.end,
    duration: session.end - session.start,
    totalRx,
    totalTx,
    totalConnections: totalConn,
    dataPoints: session.entries.length,
  }
}

// Get apps/destinations accessed by a device in a time range
function getApps(ip, startTime, endTime) {
  const dests = storage.db.prepare(`
    SELECT d.dst_ip, d.dst_port, d.protocol,
           SUM(d.bytes) as bytes, SUM(d.connections) as conns,
           MIN(d.ts) as first_seen, MAX(d.ts) as last_seen
    FROM device_destinations d
    WHERE d.src_ip = ? AND d.ts >= ? AND d.ts <= ?
      AND d.dst_ip NOT LIKE '%:%' AND d.dst_ip != '0.0.0.0'
    GROUP BY d.dst_ip
    ORDER BY bytes DESC
    LIMIT 50
  `).all(ip, startTime, endTime)

  // Resolve app names from ip_knowledge
  const apps = new Map()
  for (const d of dests) {
    const knowledge = storage.db.prepare(
      'SELECT domains, app_name, category, country, isp FROM ip_knowledge WHERE ip = ?'
    ).get(d.dst_ip)

    let appName = '未知'
    let category = '其他'
    let domains = []

    if (knowledge) {
      try { domains = JSON.parse(knowledge.domains || '[]') } catch {}
      // Use domain to determine app name
      if (domains.length > 0) {
        appName = guessApp(domains[0])
      } else if (knowledge.app_name && knowledge.app_name !== 'com.cn') {
        appName = knowledge.app_name
      }
      category = knowledge.category || '其他'
    }

    // Group by app
    const key = appName
    if (!apps.has(key)) {
      apps.set(key, { name: appName, category, domains: new Set(), totalBytes: 0, totalConns: 0, firstSeen: d.first_seen, lastSeen: d.last_seen, dstIps: new Set() })
    }
    const app = apps.get(key)
    app.totalBytes += d.bytes
    app.totalConns += d.conns
    app.firstSeen = Math.min(app.firstSeen, d.first_seen)
    app.lastSeen = Math.max(app.lastSeen, d.last_seen)
    app.dstIps.add(d.dst_ip)
    domains.forEach(dom => app.domains.add(dom))
  }

  return [...apps.values()].map(a => ({
    name: a.name,
    category: a.category,
    domains: [...a.domains].slice(0, 5),
    totalBytes: a.totalBytes,
    totalConnections: a.totalConns,
    firstSeen: a.firstSeen,
    lastSeen: a.lastSeen,
    dstIpCount: a.dstIps.size,
  })).sort((a, b) => b.totalBytes - a.totalBytes)
}

function guessApp(domain) {
  const d = domain.toLowerCase()
  if (d.includes('weixin') || d.includes('wechat')) return '微信'
  if (d.includes('qq.com') || d.includes('qzone')) return 'QQ'
  if (d.includes('douyin') || d.includes('tiktok') || d.includes('bytedance')) return '抖音'
  if (d.includes('bilibili') || d.includes('bilivideo')) return 'B站'
  if (d.includes('taobao') || d.includes('tmall') || d.includes('alicdn')) return '淘宝'
  if (d.includes('jd.com') || d.includes('360buy')) return '京东'
  if (d.includes('baidu')) return '百度'
  if (d.includes('google')) return 'Google'
  if (d.includes('youtube') || d.includes('ytimg')) return 'YouTube'
  if (d.includes('apple.com') || d.includes('icloud')) return 'Apple'
  if (d.includes('microsoft') || d.includes('live.com') || d.includes('office')) return 'Microsoft'
  if (d.includes('feishu') || d.includes('larksuite')) return '飞书'
  if (d.includes('dingtalk')) return '钉钉'
  if (d.includes('netease') || d.includes('163.com') || d.includes('126.com')) return '网易'
  if (d.includes('weibo')) return '微博'
  if (d.includes('xiaohongshu') || d.includes('xhslink')) return '小红书'
  if (d.includes('pinduoduo') || d.includes('pdd')) return '拼多多'
  if (d.includes('kuaishou')) return '快手'
  if (d.includes('github')) return 'GitHub'
  if (d.includes('cloudflare') || d.includes('cf')) return 'Cloudflare'
  if (d.includes('amazon') || d.includes('aws')) return 'AWS'
  if (d.includes('alibaba') || d.includes('aliyun')) return '阿里云'
  if (d.includes('tencent') || d.includes('myqcloud')) return '腾讯云'
  if (d.includes('spotify')) return 'Spotify'
  if (d.includes('netflix')) return 'Netflix'
  return domain.split('.').slice(-2, -1)[0] || domain
}

// Full timeline: sessions + per-session app access
function getTimeline(ip, hours = 24) {
  const now = Date.now()
  const startTime = now - hours * 3600 * 1000

  const sessions = getSessions(ip, startTime, now)
  const apps = getApps(ip, startTime, now)

  // Per-session app breakdown
  for (const session of sessions) {
    session.apps = getApps(ip, session.start, session.end)
  }

  // Device info
  const info = storage.db.prepare(`
    SELECT mac, hostname FROM device_traffic
    WHERE ip = ? AND mac != '' ORDER BY ts DESC LIMIT 1
  `).get(ip)

  return {
    ip,
    mac: info?.mac || '',
    hostname: info?.hostname === ip ? '' : (info?.hostname || ''),
    sessions,
    apps,
    totalSessions: sessions.length,
    totalOnlineTime: sessions.reduce((s, sess) => s + sess.duration, 0),
  }
}

export const deviceActivity = { getDevices, getSessions, getApps, getTimeline }
