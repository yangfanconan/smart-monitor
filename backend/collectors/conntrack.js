import fs from 'node:fs'

export class ConntrackCollector {
  #latest = []
  #timer = null
  #onUpdate = null
  #prevRaw = ''

  start(onUpdate) {
    this.#onUpdate = onUpdate
    this.#collect()
    this.#timer = setInterval(() => this.#collect(), 5000)
  }

  stop() { clearInterval(this.#timer) }

  #collect() {
    try {
      const raw = fs.readFileSync('/proc/net/nf_conntrack', 'utf-8')
      if (raw === this.#prevRaw) return
      this.#prevRaw = raw

      const lines = raw.split('\n').filter(Boolean)
      const connections = []

      for (const line of lines) {
        const conn = this.#parseLine(line)
        if (conn) connections.push(conn)
      }

      this.#latest = connections
      this.#onUpdate?.(connections)
    } catch { /* conntrack may not be available */ }
  }

  #parseLine(line) {
    // Extract protocol
    let protocol = ''
    if (line.includes('tcp')) protocol = 'tcp'
    else if (line.includes('udp')) protocol = 'udp'
    else if (line.includes('icmp')) protocol = 'icmp'
    else protocol = 'other'

    // Extract state for TCP
    let state = ''
    const stateMatch = line.match(/\d+\s+(tcp|udp|icmp)\s+\d+\s+(?:\d+\s+)?(\w+)/)
    if (protocol === 'tcp' && stateMatch) state = stateMatch[2] || ''
    if (!['ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT', 'SYN_SENT', 'SYN_RECV'].includes(state)) {
      state = ''
    }

    // Split line into original and reply halves at the second src=
    const secondSrcIdx = line.indexOf('src=', line.indexOf('src=') + 1)
    const origHalf = secondSrcIdx > 0 ? line.substring(0, secondSrcIdx) : line
    const replyHalf = secondSrcIdx > 0 ? line.substring(secondSrcIdx) : ''

    // Original direction: srcIp (inner device), dstIp (remote), srcPort, dport
    const srcMatches = [...line.matchAll(/src=([^\s]+)/g)]
    const dstMatches = [...line.matchAll(/dst=([^\s]+)/g)]
    const sportMatches = [...line.matchAll(/sport=(\d+)/g)]
    const dportMatches = [...line.matchAll(/dport=(\d+)/g)]

    if (srcMatches.length < 1 || dstMatches.length < 1) return null

    const srcIp = srcMatches[0][1]
    const dstIp = dstMatches[0][1]
    const srcPort = sportMatches.length > 0 ? parseInt(sportMatches[0][1]) : 0
    const dport = dportMatches.length > 0 ? parseInt(dportMatches[0][1]) : 0

    // Per-direction bytes/packets
    // Original direction = inner device → outside (upload / tx)
    // Reply direction = outside → inner device (download / rx)
    const origBytesMatch = origHalf.match(/bytes=(\d+)/)
    const replyBytesMatch = replyHalf.match(/bytes=(\d+)/)
    const origPacketsMatch = origHalf.match(/packets=(\d+)/)
    const replyPacketsMatch = replyHalf.match(/packets=(\d+)/)

    const origBytes = origBytesMatch ? parseInt(origBytesMatch[1]) : 0
    const replyBytes = replyBytesMatch ? parseInt(replyBytesMatch[1]) : 0
    const origPackets = origPacketsMatch ? parseInt(origPacketsMatch[1]) : 0
    const replyPackets = replyPacketsMatch ? parseInt(replyPacketsMatch[1]) : 0

    // Check for offload/assured flags
    const offload = line.includes('[OFFLOAD]')
    const assured = line.includes('[ASSURED]')

    return {
      protocol,
      srcIp,
      dstIp,
      srcPort,
      dport,
      state,
      packets: origPackets + replyPackets,
      bytes: origBytes + replyBytes,
      origBytes,
      replyBytes,
      offload,
      assured
    }
  }

  getLatest() { return this.#latest }

  getProtocolStats() {
    const stats = { tcp: 0, udp: 0, icmp: 0, other: 0 }
    const portStats = {}
    const total = this.#latest.length

    for (const conn of this.#latest) {
      stats[conn.protocol] = (stats[conn.protocol] || 0) + 1
      if (conn.dport > 0) {
        const port = conn.dport
        portStats[port] = (portStats[port] || 0) + 1
      }
    }

    // Top ports
    const topPorts = Object.entries(portStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([port, count]) => ({ port: parseInt(port), count, percent: Math.round(count / total * 10000) / 100 }))

    // Well-known port labels
    const portLabels = { 22: 'SSH', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 25: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB' }

    return {
      total,
      protocols: Object.entries(stats).map(([name, count]) => ({ name, count, percent: Math.round(count / total * 10000) / 100 })),
      topPorts: topPorts.map(p => ({ ...p, label: portLabels[p.port] || '' }))
    }
  }

  getDnsQueries() {
    // DNS connections (port 53)
    return this.#latest
      .filter(c => c.dport === 53 || c.srcPort === 53)
      .map(c => ({
        srcIp: c.dport === 53 ? c.srcIp : c.dstIp,
        dnsServer: c.dport === 53 ? c.dstIp : c.srcIp,
        protocol: c.protocol,
        ts: Date.now()
      }))
      .slice(-100)
  }

  getTopDomains() {
    // Aggregate by destination IP for DNS servers
    const dnsServers = {}
    for (const conn of this.#latest) {
      if (conn.dport === 53) {
        if (!dnsServers[conn.dstIp]) dnsServers[conn.dstIp] = { ip: conn.dstIp, queryCount: 0, bytes: 0 }
        dnsServers[conn.dstIp].queryCount++
        dnsServers[conn.dstIp].bytes += conn.bytes
      }
    }
    return Object.values(dnsServers).sort((a, b) => b.queryCount - a.queryCount)
  }
}
