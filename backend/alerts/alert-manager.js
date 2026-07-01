import { storage } from '../storage/db.js'
import { notifier } from './notifier.js'

export class AlertManager {
  #alerts = []
  #config = {}
  #idCounter = 0
  #cooldowns = new Map()

  constructor(config = {}) {
    this.#config = config
    this.#loadFromDb()
    // Clean expired cooldowns every 10 min
    setInterval(() => {
      const now = Date.now()
      for (const [key, expiry] of this.#cooldowns) {
        if (now > expiry) this.#cooldowns.delete(key)
      }
    }, 600000).unref?.()
  }

  #loadFromDb() {
    try {
      const rows = storage.getAlertHistory(500)
      this.#alerts = rows.map(r => ({
        id: r.id, ts: r.ts, level: r.level, type: r.type, title: r.title,
        message: r.message, srcIp: r.src_ip, details: JSON.parse(r.details || '{}'),
        status: r.status || 'unread'
      }))
      this.#idCounter = this.#alerts.length ? Math.max(...this.#alerts.map(a => a.id)) : 0
    } catch { /* ignore if table empty */ }
  }

  addAlert(threat) {
    const key = `${threat.type}:${threat.srcIp || ''}`
    const now = Date.now()
    const cooldown = this.#cooldowns.get(key) || 0

    if (now < cooldown) return null

    const alert = {
      id: ++this.#idCounter,
      level: threat.level || 'warning',
      type: threat.type,
      title: threat.title || threat.type,
      message: threat.message || '',
      srcIp: threat.srcIp || '',
      dstIp: threat.dstIp || '',
      details: threat.details || {},
      status: 'unread',
      ts: now
    }

    this.#alerts.unshift(alert)
    if (this.#alerts.length > 500) this.#alerts.pop()

    try { storage.saveAlert(alert) } catch { /* ignore */ }

    // Push notification (async, don't block)
    notifier.notify(alert).catch(e => console.warn('Notify error:', e.message))

    // Set cooldown (5 minutes)
    this.#cooldowns.set(key, now + 300000)
    return alert
  }

  checkSystemThresholds(sys) {
    const alerts = []
    if (!sys) return alerts

    // Temperature check
    const tempConfig = this.#config.temperature || { critical: 85, warning: 70 }
    if (sys.temperature) {
      for (const zone of sys.temperature) {
        if (zone.temp >= tempConfig.critical) {
          alerts.push(this.addAlert({
            level: 'critical', type: 'temperature', title: '温度过高',
            message: `${zone.type} 温度 ${zone.temp}°C 超过临界值 ${tempConfig.critical}°C`,
            details: { zone: zone.zone, type: zone.type, temp: zone.temp }
          }))
        } else if (zone.temp >= tempConfig.warning) {
          alerts.push(this.addAlert({
            level: 'warning', type: 'temperature', title: '温度偏高',
            message: `${zone.type} 温度 ${zone.temp}°C 超过警告值 ${tempConfig.warning}°C`,
            details: { zone: zone.zone, type: zone.type, temp: zone.temp }
          }))
        }
      }
    }

    // CPU check
    const cpuConfig = this.#config.cpu || { critical: 95, warning: 80 }
    if (sys.cpu >= cpuConfig.critical) {
      alerts.push(this.addAlert({
        level: 'critical', type: 'cpu', title: 'CPU 使用率过高',
        message: `CPU 使用率 ${sys.cpu}% 超过临界值 ${cpuConfig.critical}%`
      }))
    } else if (sys.cpu >= cpuConfig.warning) {
      alerts.push(this.addAlert({
        level: 'warning', type: 'cpu', title: 'CPU 使用率偏高',
        message: `CPU 使用率 ${sys.cpu}% 超过警告值 ${cpuConfig.warning}%`
      }))
    }

    // Memory check
    const memConfig = this.#config.memory || { critical: 95, warning: 80 }
    if (sys.memory?.usagePercent >= memConfig.critical) {
      alerts.push(this.addAlert({
        level: 'critical', type: 'memory', title: '内存使用率过高',
        message: `内存使用率 ${sys.memory.usagePercent}% 超过临界值 ${memConfig.critical}%`
      }))
    } else if (sys.memory?.usagePercent >= memConfig.warning) {
      alerts.push(this.addAlert({
        level: 'warning', type: 'memory', title: '内存使用率偏高',
        message: `内存使用率 ${sys.memory.usagePercent}% 超过警告值 ${memConfig.warning}%`
      }))
    }

    return alerts.filter(Boolean)
  }

  getAlerts(status) {
    if (status && status !== 'all') return this.#alerts.filter(a => a.status === status)
    return this.#alerts
  }

  getUnreadCount() {
    return this.#alerts.filter(a => a.status === 'unread').length
  }
}
