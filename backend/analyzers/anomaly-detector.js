import { baselineManager } from './baseline.js'

const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
const BASELINE_UPDATE_INTERVAL = 10 * 60 * 1000 // 10 minutes
const MIN_DEVICE_CONNECTIONS = 5

class AnomalyDetector {
  #lastAnomalies = []
  #timer = null
  #baselineTimer = null
  #onAlert = null
  #getDevices = null

  start(onAlert, getDevices) {
    this.#onAlert = onAlert
    this.#getDevices = getDevices

    // Initial baseline update after 5 minutes
    setTimeout(() => {
      this.#updateBaselines()
      this.#baselineTimer = setInterval(() => this.#updateBaselines(), BASELINE_UPDATE_INTERVAL)
      this.#baselineTimer.unref?.()
    }, 300000)

    // Start anomaly checks after 10 minutes
    setTimeout(() => {
      this.#runCheck()
      this.#timer = setInterval(() => this.#runCheck(), CHECK_INTERVAL)
      this.#timer.unref?.()
    }, 600000)
  }

  // Called from server.js with current connection data
  update(connections) {
    // Build per-device stats from connections
    const deviceStats = new Map()
    for (const conn of connections) {
      const ip = conn.srcIp
      if (!ip) continue
      const stats = deviceStats.get(ip) || { connections: 0, rxBytes: 0, txBytes: 0 }
      stats.connections++
      stats.rxBytes += conn.replyBytes || 0
      stats.txBytes += conn.origBytes || 0
      deviceStats.set(ip, stats)
    }
    return deviceStats
  }

  #updateBaselines() {
    try {
      const updated = baselineManager.updateBaselines()
      if (updated > 0) console.log(`Baseline: updated ${updated} device profiles`)
    } catch (e) {
      console.warn('Baseline update error:', e.message)
    }
  }

  #runCheck() {
    try {
      if (!this.#getDevices) return
      const deviceStats = this.#getDevices()
      if (!deviceStats?.size) return

      // Resolve device names
      const dhcpDevices = this.#getDevices._dhcpDevices || []
      const ipToName = new Map()
      for (const d of dhcpDevices) ipToName.set(d.ip, d.hostname || d.ip)

      const anomalies = []

      for (const [ip, stats] of deviceStats) {
        if (stats.connections < MIN_DEVICE_CONNECTIONS) continue

        const result = baselineManager.checkAnomaly(ip, stats.connections, stats.rxBytes, stats.txBytes)
        if (result) {
          const hostname = ipToName.get(ip) || ip
          anomalies.push({ ...result, hostname })

          if (this.#onAlert) {
            const metrics = result.anomalies.map(a =>
              `${a.metric}(当前${this.#fmt(a.current)}, 基线${this.#fmt(a.baseline)}, z=${a.zScore})`
            ).join(', ')

            this.#onAlert({
              level: 'warning',
              type: 'anomaly',
              title: `设备行为异常: ${hostname}`,
              message: `${ip} 在 ${result.hour} 时偏离历史基线: ${metrics}`,
              srcIp: ip,
              details: { hostname, anomalies: result.anomalies, hour: result.hour },
            })
          }
        }
      }

      this.#lastAnomalies = anomalies
    } catch (e) {
      console.warn('AnomalyDetector error:', e.message)
    }
  }

  #fmt(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  getAnomalies() { return this.#lastAnomalies }

  getStatus() {
    const baselines = baselineManager.getBaselines()
    const deviceCount = new Set(baselines.map(b => b.ip)).size
    const totalProfiles = baselines.filter(b => b.samples >= 3).length
    return {
      deviceCount,
      totalProfiles,
      lastAnomalyCount: this.#lastAnomalies.length,
      running: !!this.#timer,
    }
  }
}

export const anomalyDetector = new AnomalyDetector()
