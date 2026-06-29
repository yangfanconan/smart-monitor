export class ThreatDetector {
  #threats = []
  #portScanTracker = new Map()
  #connectionRateTracker = new Map()
  #knownDevices = new Set()
  #initPhase = true // First 2 minutes: learning phase, no alerts
  #initTimer = null
  #rules = [
    { id: 'port_scan', name: '端口扫描检测', enabled: true, threshold: 30, window: 120, level: 'warning' },
    { id: 'ddos', name: 'DDoS 异常检测', enabled: true, threshold: 10, level: 'critical' },
    { id: 'dns_anomaly', name: 'DNS 异常检测', enabled: true, threshold: 200, window: 120, level: 'warning' },
    { id: 'brute_force', name: '暴力破解检测', enabled: true, threshold: 20, window: 300, level: 'warning' },
    { id: 'new_device', name: '新设备接入', enabled: true, level: 'info' },
    { id: 'blacklist', name: '黑名单匹配', enabled: true, level: 'critical' }
  ]
  #cooldowns = new Map()
  #COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes cooldown per alert type+source

  constructor() {
    // Learning phase: don't alert for first 2 minutes
    this.#initTimer = setTimeout(() => { this.#initPhase = false }, 120000)
  }

  analyze(connections) {
    if (this.#initPhase) return [] // Skip during learning phase

    const alerts = []
    const now = Date.now()

    alerts.push(...this.#detectPortScan(connections, now))
    alerts.push(...this.#detectBruteForce(connections, now))
    alerts.push(...this.#detectDnsAnomaly(connections, now))
    alerts.push(...this.#detectConnectionRate(connections, now))

    if (alerts.length > 0) {
      this.#threats.unshift(...alerts)
      if (this.#threats.length > 100) this.#threats.length = 100
    }

    return alerts
  }

  #isCoolingDown(key) {
    const cd = this.#cooldowns.get(key) || 0
    if (Date.now() < cd) return true
    this.#cooldowns.set(key, Date.now() + this.#COOLDOWN_MS)
    return false
  }

  #detectPortScan(connections, now) {
    const rule = this.#rules.find(r => r.id === 'port_scan')
    if (!rule?.enabled) return []
    const alerts = []

    for (const conn of connections) {
      if (conn.protocol !== 'tcp' || !conn.srcIp) continue
      const tracker = this.#portScanTracker.get(conn.srcIp) || { ports: new Set(), firstSeen: now }
      tracker.ports.add(conn.dport)

      if (now - tracker.firstSeen > rule.window * 1000) {
        tracker.ports.clear()
        tracker.firstSeen = now
      }
      this.#portScanTracker.set(conn.srcIp, tracker)

      if (tracker.ports.size >= rule.threshold && !this.#isCoolingDown(`port_scan:${conn.srcIp}`)) {
        alerts.push({
          type: 'port_scan', level: rule.level, title: '端口扫描',
          message: `${conn.srcIp} 扫描了 ${tracker.ports.size} 个端口`,
          srcIp: conn.srcIp, details: { portsScanned: tracker.ports.size }
        })
        tracker.ports.clear()
        tracker.firstSeen = now
      }
    }
    return alerts
  }

  #detectBruteForce(connections, now) {
    const rule = this.#rules.find(r => r.id === 'brute_force')
    if (!rule?.enabled) return []
    const alerts = []
    const sensitivePorts = new Set([22, 23])

    for (const conn of connections) {
      if (!sensitivePorts.has(conn.dport) || conn.protocol !== 'tcp') continue
      const key = `${conn.srcIp}:${conn.dport}`
      const tracker = this.#connectionRateTracker.get(key) || { count: 0, firstSeen: now }
      tracker.count++

      if (now - tracker.firstSeen > rule.window * 1000) {
        tracker.count = 1
        tracker.firstSeen = now
      }
      this.#connectionRateTracker.set(key, tracker)

      if (tracker.count >= rule.threshold && !this.#isCoolingDown(`brute_force:${key}`)) {
        alerts.push({
          type: 'brute_force', level: rule.level, title: '暴力破解嫌疑',
          message: `${conn.srcIp} 对 ${conn.dport} 端口尝试 ${tracker.count} 次`,
          srcIp: conn.srcIp, details: { port: conn.dport, attempts: tracker.count }
        })
        tracker.count = 0
        tracker.firstSeen = now
      }
    }
    return alerts
  }

  #detectDnsAnomaly(connections, now) {
    const rule = this.#rules.find(r => r.id === 'dns_anomaly')
    if (!rule?.enabled) return []
    const alerts = []
    const dnsBySrc = {}

    for (const conn of connections) {
      if (conn.dport === 53 && conn.protocol === 'udp') {
        dnsBySrc[conn.srcIp] = (dnsBySrc[conn.srcIp] || 0) + 1
      }
    }

    for (const [srcIp, count] of Object.entries(dnsBySrc)) {
      if (count >= rule.threshold && !this.#isCoolingDown(`dns_anomaly:${srcIp}`)) {
        alerts.push({
          type: 'dns_anomaly', level: rule.level, title: 'DNS 查询异常',
          message: `${srcIp} 发起 ${count} 个 DNS 查询`,
          srcIp, details: { queryCount: count }
        })
      }
    }
    return alerts
  }

  #detectConnectionRate(connections, now) {
    const rule = this.#rules.find(r => r.id === 'ddos')
    if (!rule?.enabled) return []

    // Simple: if total connections > 5000, alert
    if (connections.length > 5000 && !this.#isCoolingDown('ddos')) {
      return [{
        type: 'ddos', level: 'critical', title: '连接数异常',
        message: `当前连接数 ${connections.length} 超过阈值 5000`,
        details: { current: connections.length }
      }]
    }
    return []
  }

  getThreats() { return this.#threats }
  getRules() { return this.#rules }
}
