import dgram from 'node:dgram'
import fs from 'node:fs'

// Protocol signatures for DPI
const HTTP_METHODS = ['GET ', 'POST', 'PUT ', 'HEAD', 'DELE', 'OPTI', 'PATC']
const DNS_HEADER_LEN = 12

export class DpiEngine {
  #socket = null
  #running = false
  #conntrackTimer = null
  #stats = { totalPackets: 0, parsedPackets: 0, errors: 0 }
  #protocolStats = {}
  #dnsQueries = []
  #httpHosts = []
  #tlsSnis = []
  #recentPackets = []
  #onUpdate = null
  #maxHistory = 500

  start(onUpdate) {
    this.#onUpdate = onUpdate
    try {
      // Try raw socket capture on br-lan
      this.#socket = dgram.createSocket({ type: 'udp4' })

      // Use SO_REUSEADDR and bind
      this.#socket.on('message', (msg, rinfo) => {
        this.#stats.totalPackets++
        this.#processUdpPacket(msg, rinfo)
      })

      this.#socket.on('error', (err) => {
        console.log('DPI: UDP socket error:', err.message)
      })

      // Also start a periodic conntrack-based DPI analysis
      this.#conntrackTimer = setInterval(() => this.#analyzeFromConntrack(), 5000)

      this.#running = true
      console.log('DPI Engine started (conntrack-based analysis)')
    } catch (err) {
      console.log('DPI: Raw socket not available, using conntrack mode:', err.message)
      this.#conntrackTimer = setInterval(() => this.#analyzeFromConntrack(), 5000)
      this.#running = true
    }
  }

  stop() {
    this.#running = false
    this.#socket?.close()
    clearInterval(this.#conntrackTimer)
  }

  #processUdpPacket(msg, rinfo) {
    try {
      // Try to parse as DNS
      if (rinfo.port === 53 || (msg.length > DNS_HEADER_LEN && this.#isDnsPacket(msg))) {
        const query = this.#parseDnsQuery(msg)
        if (query) {
          this.#dnsQueries.push({ ...query, ts: Date.now(), srcIp: rinfo.address, srcPort: rinfo.port })
          if (this.#dnsQueries.length > this.#maxHistory) this.#dnsQueries.shift()
          this.#protocolStats['DNS'] = (this.#protocolStats['DNS'] || 0) + 1
        }
      }

      // Try to parse as HTTP
      const str = msg.toString('ascii', 0, Math.min(msg.length, 200))
      if (HTTP_METHODS.some(m => str.startsWith(m))) {
        const host = this.#extractHttpHost(str)
        if (host) {
          this.#httpHosts.push({ host, ts: Date.now(), srcIp: rinfo.address })
          if (this.#httpHosts.length > this.#maxHistory) this.#httpHosts.shift()
        }
        this.#protocolStats['HTTP'] = (this.#protocolStats['HTTP'] || 0) + 1
      }

      this.#recordPacket(rinfo.address, rinfo.port, msg.length, 'UDP')
    } catch {
      this.#stats.errors++
    }
  }

  #isDnsPacket(msg) {
    // DNS has specific structure: 2 bytes ID, 2 bytes flags
    if (msg.length < DNS_HEADER_LEN) return false
    const flags = msg.readUInt16BE(2)
    const qr = (flags >> 15) & 1 // 0=query, 1=response
    const opcode = (flags >> 11) & 0xf
    return opcode <= 4 // standard, inverse, status, notify, update
  }

  #parseDnsQuery(msg) {
    try {
      if (msg.length < DNS_HEADER_LEN + 5) return null

      const id = msg.readUInt16BE(0)
      const flags = msg.readUInt16BE(2)
      const qr = (flags >> 15) & 1
      const qdcount = msg.readUInt16BE(4)

      if (qdcount === 0) return null

      // Parse first question
      let offset = DNS_HEADER_LEN
      const labels = []

      while (offset < msg.length) {
        const len = msg[offset]
        if (len === 0) { offset++; break }
        if (len > 63) break // compression pointer

        offset++
        if (offset + len > msg.length) break
        labels.push(msg.toString('ascii', offset, offset + len))
        offset += len
      }

      const domain = labels.join('.')
      if (!domain || domain.length < 2) return null

      // Read query type
      const qtype = offset + 1 < msg.length ? msg.readUInt16BE(offset) : 0
      const typeNames = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 255: 'ANY' }

      return {
        id, domain, type: typeNames[qtype] || `TYPE${qtype}`,
        isResponse: qr === 1
      }
    } catch {
      return null
    }
  }

  #extractHttpHost(httpStr) {
    const match = httpStr.match(/[Hh]ost:\s*([^\r\n]+)/)
    return match ? match[1].trim() : null
  }

  #extractTlsSni(buf) {
    try {
      // TLS Client Hello starts with ContentType=0x16 (Handshake)
      if (buf.length < 43 || buf[0] !== 0x16) return null

      // Skip TLS record header (5 bytes) + handshake header (4 bytes)
      let offset = 5

      // Check handshake type = Client Hello (1)
      if (buf[offset] !== 0x01) return null
      offset += 4 // handshake type + length

      // Skip version (2) + random (32)
      offset += 34

      // Skip session ID
      if (offset >= buf.length) return null
      const sessionIdLen = buf[offset]
      offset += 1 + sessionIdLen

      // Skip cipher suites
      if (offset + 2 > buf.length) return null
      const cipherSuitesLen = buf.readUInt16BE(offset)
      offset += 2 + cipherSuitesLen

      // Skip compression methods
      if (offset >= buf.length) return null
      const compMethodsLen = buf[offset]
      offset += 1 + compMethodsLen

      // Extensions
      if (offset + 2 > buf.length) return null
      const extensionsLen = buf.readUInt16BE(offset)
      offset += 2

      const extensionsEnd = offset + extensionsLen
      while (offset + 4 <= extensionsEnd && offset + 4 <= buf.length) {
        const extType = buf.readUInt16BE(offset)
        const extLen = buf.readUInt16BE(offset + 2)
        offset += 4

        // SNI extension type = 0x0000
        if (extType === 0x0000 && offset + extLen <= buf.length) {
          // Skip SNI list length (2) + SNI type (1) + SNI length (2)
          const sniOffset = offset + 5
          const sniLen = buf.readUInt16BE(offset + 3)
          if (sniOffset + sniLen <= buf.length) {
            return buf.toString('ascii', sniOffset, sniOffset + sniLen)
          }
        }
        offset += extLen
      }
    } catch {}
    return null
  }

  #recordPacket(srcIp, srcPort, length, protocol) {
    this.#recentPackets.push({ srcIp, srcPort, length, protocol, ts: Date.now() })
    if (this.#recentPackets.length > this.#maxHistory) this.#recentPackets.shift()
    this.#stats.parsedPackets++
  }

  // Conntrack-based DPI analysis (fallback/enhancement)
  #analyzeFromConntrack() {
    try {
      // Try multiple conntrack paths for OpenWrt compatibility
      const conntrackPaths = ['/proc/net/nf_conntrack', '/proc/net/conntrack', '/proc/net/stat/nf_conntrack']
      let raw = ''
      for (const p of conntrackPaths) {
        try { raw = fs.readFileSync(p, 'utf-8'); break } catch {}
      }
      if (!raw) return
      const lines = raw.split('\n').filter(Boolean)

      for (const line of lines) {
        // Extract protocol and ports for classification
        const dportMatch = line.match(/dport=(\d+)/)
        const sportMatch = line.match(/sport=(\d+)/)
        if (!dportMatch) continue

        const dport = parseInt(dportMatch[1])
        const sport = sportMatch ? parseInt(sportMatch[1]) : 0

        let appProtocol = 'Unknown'
        if (dport === 53 || sport === 53) appProtocol = 'DNS'
        else if (dport === 80 || sport === 80) appProtocol = 'HTTP'
        else if (dport === 443 || sport === 443) appProtocol = 'TLS/HTTPS'
        else if (dport === 22 || sport === 22) appProtocol = 'SSH'
        else if (dport === 23 || sport === 23) appProtocol = 'Telnet'
        else if (dport === 25 || dport === 587) appProtocol = 'SMTP'
        else if (dport === 110 || dport === 995) appProtocol = 'POP3'
        else if (dport === 143 || dport === 993) appProtocol = 'IMAP'
        else if (dport === 3306) appProtocol = 'MySQL'
        else if (dport === 5432) appProtocol = 'PostgreSQL'
        else if (dport === 6379) appProtocol = 'Redis'
        else if (dport === 8080 || dport === 8443) appProtocol = 'HTTP-Alt'
        else if (dport === 5353) appProtocol = 'mDNS'
        else if (dport === 1900) appProtocol = 'SSDP/UPnP'
        else if (dport === 5683) appProtocol = 'CoAP'
        else if (dport === 1883) appProtocol = 'MQTT'
        else if (dport >= 1024) appProtocol = `Port-${dport}`

        this.#protocolStats[appProtocol] = (this.#protocolStats[appProtocol] || 0) + 1
      }

      this.#onUpdate?.(this.getStats())
    } catch {}
  }

  getStats() {
    const total = Object.values(this.#protocolStats).reduce((a, b) => a + b, 0) || 1
    return {
      stats: this.#stats,
      protocols: Object.entries(this.#protocolStats)
        .map(([name, count]) => ({ name, count, percent: Math.round(count / total * 10000) / 100 }))
        .sort((a, b) => b.count - a.count),
      dnsQueries: this.#dnsQueries.slice(-50),
      httpHosts: this.#httpHosts.slice(-50),
      tlsSnis: this.#tlsSnis.slice(-50),
      recentPackets: this.#recentPackets.slice(-50)
    }
  }

  getDnsQueries() { return this.#dnsQueries.slice(-100) }
  getHttpHosts() { return this.#httpHosts.slice(-100) }
  getTlsSnis() { return this.#tlsSnis.slice(-100) }
  getProtocolDistribution() { return this.getStats().protocols }
}
