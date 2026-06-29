import fs from 'node:fs'

export class NetworkCollector {
  #prevStats = {}
  #latest = {}
  #timer = null
  #onUpdate = null
  #history = []
  #uplinkOverride = null
  #lanIfaces = new Set(['eth0', 'br-lan', 'lo'])

  setUplinkOverride(name) { this.#uplinkOverride = name }
  setLanIfaces(names) { this.#lanIfaces = new Set(names) }

  start(onUpdate) {
    this.#onUpdate = onUpdate
    this.#collect()
    this.#timer = setInterval(() => this.#collect(), 2000)
  }

  stop() { clearInterval(this.#timer) }

  #readFile(path) {
    try { return fs.readFileSync(path, 'utf-8').trim() } catch { return '' }
  }

  #collect() {
    const devData = this.#readFile('/proc/net/dev')
    const lines = devData.split('\n').slice(2) // skip headers
    const interfaces = []
    const now = Date.now()
    const interval = 2 // seconds

    for (const line of lines) {
      const parts = line.trim().split(/[\s:]+/)
      if (parts.length < 17) continue
      const name = parts[0]
      const rx = { bytes: parseInt(parts[1]), packets: parseInt(parts[2]), errors: parseInt(parts[3]), drop: parseInt(parts[4]) }
      const tx = { bytes: parseInt(parts[9]), packets: parseInt(parts[11]), errors: parseInt(parts[12]), drop: parseInt(parts[13]) }

      let rxSpeed = 0, txSpeed = 0
      if (this.#prevStats[name]) {
        rxSpeed = Math.max(0, (rx.bytes - this.#prevStats[name].rx.bytes) / interval)
        txSpeed = Math.max(0, (tx.bytes - this.#prevStats[name].tx.bytes) / interval)
      }

      const iface = { name, rx, tx, rxSpeed, txSpeed }
      interfaces.push(iface)
      this.#prevStats[name] = { rx, tx }
    }

    // Calculate totals for key interfaces
    const lan = interfaces.find(i => i.name === 'eth0') || interfaces.find(i => i.name === 'lan')
    const wifi = interfaces.find(i => i.name.startsWith('phy') || i.name.startsWith('wlan'))
    const brlan = interfaces.find(i => i.name === 'br-lan')

    // Detect uplink: configured override > highest TX speed among non-LAN interfaces
    let uplink = null
    if (this.#uplinkOverride) {
      uplink = interfaces.find(i => i.name === this.#uplinkOverride)
    }
    if (!uplink) {
      const candidates = interfaces.filter(i =>
        !this.#lanIfaces.has(i.name) &&
        !i.name.startsWith('phy') &&
        !i.name.startsWith('wlan') &&
        i.name !== 'lo' &&
        (i.txSpeed > 0 || i.rxSpeed > 0)
      )
      uplink = candidates.sort((a, b) => (b.txSpeed + b.rxSpeed) - (a.txSpeed + a.rxSpeed))[0] || null
    }

    this.#latest = {
      interfaces,
      summary: {
        uplink: uplink ? { name: uplink.name, rxSpeed: uplink.rxSpeed, txSpeed: uplink.txSpeed, rxTotal: uplink.rx.bytes, txTotal: uplink.tx.bytes } : null,
        wan: uplink ? { name: uplink.name, rxSpeed: uplink.rxSpeed, txSpeed: uplink.txSpeed, rxTotal: uplink.rx.bytes, txTotal: uplink.tx.bytes } : null,
        lan: lan ? { rxSpeed: lan.rxSpeed, txSpeed: lan.txSpeed, rxTotal: lan.rx.bytes, txTotal: lan.tx.bytes } : null,
        wifi: wifi ? { rxSpeed: wifi.rxSpeed, txSpeed: wifi.txSpeed, rxTotal: wifi.rx.bytes, txTotal: wifi.tx.bytes } : null,
        brlan: brlan ? { rxSpeed: brlan.rxSpeed, txSpeed: brlan.txSpeed } : null
      },
      ts: now
    }

    this.#history.push({ ts: now, wan: this.#latest.summary.wan, brlan: this.#latest.summary.brlan })
    if (this.#history.length > 1800) this.#history.shift()

    this.#onUpdate?.(this.#latest)
  }

  getLatest() { return this.#latest }
  getInterfaces() { return { interfaces: this.#latest.interfaces || [], summary: this.#latest.summary || {}, history: this.#history } }

  getTrafficByDevice(connections, devices) {
    if (!connections?.length) return []
    const deviceMap = new Map()
    for (const d of devices || []) deviceMap.set(d.ip, d)

    const traffic = {}
    for (const conn of connections) {
      const srcIp = conn.srcIp
      const key = srcIp
      if (!traffic[key]) {
        const dev = deviceMap.get(key)
        traffic[key] = { ip: key, mac: dev?.mac || '', name: dev?.hostname || key, connections: 0, rxBytes: 0, txBytes: 0 }
      }
      traffic[key].connections++
      traffic[key].rxBytes += conn.replyBytes || 0
      traffic[key].txBytes += conn.origBytes || 0
    }

    return Object.values(traffic).sort((a, b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes))
  }
}
