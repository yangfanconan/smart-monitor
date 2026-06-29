import fs from 'node:fs'

export class DhcpCollector {
  #devices = []
  #timer = null

  start() {
    this.#collect()
    this.#timer = setInterval(() => this.#collect(), 30000)
  }

  stop() { clearInterval(this.#timer) }

  #collect() {
    const devices = []

    // Parse DHCP leases
    try {
      const leases = fs.readFileSync('/tmp/dhcp.leases', 'utf-8').trim()
      for (const line of leases.split('\n')) {
        if (!line) continue
        const parts = line.split(/\s+/)
        // Format: timestamp mac ip hostname clientid
        if (parts.length >= 4) {
          devices.push({
            ip: parts[2],
            mac: parts[1],
            hostname: parts[3] === '*' ? '' : parts[3],
            leaseExpiry: parseInt(parts[0]) || 0,
            source: 'dhcp'
          })
        }
      }
    } catch { /* no leases file */ }

    // Parse ARP table for additional devices
    try {
      const arp = fs.readFileSync('/proc/net/arp', 'utf-8').trim()
      const lines = arp.split('\n').slice(1) // skip header
      const existingIps = new Set(devices.map(d => d.ip))

      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 6) {
          const ip = parts[0]
          const mac = parts[3]
          const iface = parts[5]
          if (!existingIps.has(ip) && mac !== '00:00:00:00:00:00') {
            devices.push({ ip, mac, hostname: '', iface, source: 'arp' })
          }
        }
      }
    } catch { /* no arp table */ }

    this.#devices = devices
  }

  getDevices() { return this.#devices }
}
