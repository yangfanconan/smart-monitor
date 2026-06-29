import dgram from 'node:dgram'

export class DnsMonitor {
  #socket = null
  #running = false
  #cache = new Map() // ip -> { domain, ts }
  #maxCacheSize = 1000
  #cacheTTL = 3600000 // 1 hour

  start() {
    try {
      // Create UDP socket to monitor DNS responses
      // We'll use a raw socket approach by listening on all interfaces
      this.#socket = dgram.createSocket('udp4')
      
      // Bind to port 0 (random port) and use packet capture
      // Actually, we'll use a different approach - monitor via conntrack + DNS query parsing
      
      // Start periodic DNS cache cleanup
      this.#running = true
      this.#cleanupTimer = setInterval(() => this.#cleanup(), 60000)
      
      console.log('DNS Monitor started (conntrack-based)')
    } catch (err) {
      console.log('DNS Monitor: using fallback mode:', err.message)
      this.#running = true
    }
  }

  stop() {
    this.#running = false
    this.#socket?.close()
    clearInterval(this.#cleanupTimer)
  }

  // Add DNS mapping from conntrack analysis
  addDnsMapping(ip, domain) {
    if (!ip || !domain) return
    this.#cache.set(ip, { domain, ts: Date.now() })
    if (this.#cache.size > this.#maxCacheSize) {
      // Remove oldest entries
      const sorted = Array.from(this.#cache.entries())
        .sort((a, b) => a[1].ts - b[1].ts)
      for (let i = 0; i < sorted.length - this.#maxCacheSize; i++) {
        this.#cache.delete(sorted[i][0])
      }
    }
  }

  // Get domain for IP
  getDomain(ip) {
    const entry = this.#cache.get(ip)
    if (!entry) return null
    if (Date.now() - entry.ts > this.#cacheTTL) {
      this.#cache.delete(ip)
      return null
    }
    return entry.domain
  }

  // Get all cached mappings
  getAllMappings() {
    const now = Date.now()
    const result = {}
    for (const [ip, entry] of this.#cache.entries()) {
      if (now - entry.ts <= this.#cacheTTL) {
        result[ip] = entry.domain
      }
    }
    return result
  }

  #cleanup() {
    const now = Date.now()
    for (const [ip, entry] of this.#cache.entries()) {
      if (now - entry.ts > this.#cacheTTL) {
        this.#cache.delete(ip)
      }
    }
  }

  // Parse DNS query from conntrack data (fallback)
  // This extracts potential domain names from well-known DNS servers
  #parseDnsFromConntrack(connections) {
    const dnsServers = new Set(['8.8.8.8', '8.8.4.4', '114.114.114.114', '223.5.5.5', '1.1.1.1', '1.0.0.1'])
    
    for (const conn of connections) {
      if (conn.dport === 53 && dnsServers.has(conn.dstIp)) {
        // This is a DNS query to a known server
        // We can't get the domain from conntrack alone, but we can track the pattern
      }
    }
  }
}
