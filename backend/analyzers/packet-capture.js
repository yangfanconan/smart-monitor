import { spawn } from 'node:child_process'

const LINKTYPE_ETHERNET = 1
const ETHERTYPE_IPV4 = 0x0800
const IP_PROTO_TCP = 6
const IP_PROTO_UDP = 17
const TLS_CONTENT_TYPES = { 0x14: 'ChangeCipherSpec', 0x15: 'Alert', 0x16: 'Handshake', 0x17: 'ApplicationData' }
const TLS_HANDSHAKE_TYPES = { 0: 'HelloRequest', 1: 'ClientHello', 2: 'ServerHello', 11: 'Certificate', 16: 'ClientKeyExchange' }
const TLS_VERSIONS = { 0x0300: 'SSLv3', 0x0301: 'TLSv1.0', 0x0302: 'TLSv1.1', 0x0303: 'TLSv1.2', 0x0304: 'TLSv1.3' }

export class PacketCapture {
  #process = null
  #buffer = Buffer.alloc(0)
  #headerParsed = false
  #bigEndian = true
  #snaplen = 65535
  #onContent = null
  #running = false
  #stats = { packets: 0, parsed: 0, errors: 0, contentExtracted: 0 }
  #iface = 'br-lan'
  #snapshots = []
  #maxSnapshots = 2000
  #tcpStreams = new Map()
  #tcpStreamCleanup = null

  start(onContent, opts = {}) {
    this.#onContent = onContent
    this.#iface = opts.iface || 'br-lan'
    const snaplen = opts.snaplen || 1600

    const args = [
      '-i', this.#iface,
      '-n',        // no DNS resolution
      '-l',        // line-buffered stdout
      '-w', '-',   // write pcap to stdout
      '-s', String(snaplen),
      '-U',        // packet-buffered output
      '--immediate-mode',
    ]

    // Optional BPF filter
    if (opts.filter) args.push(opts.filter)

    try {
      this.#process = spawn('tcpdump', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (err) {
      console.error('PacketCapture: failed to spawn tcpdump:', err.message)
      return
    }

    this.#process.stdout.on('data', (chunk) => this.#onData(chunk))
    this.#process.on('error', (err) => console.error('PacketCapture:', err.message))
    this.#process.on('exit', (code) => {
      if (this.#running) {
        console.log('PacketCapture: tcpdump exited (code %d), restarting...', code)
        setTimeout(() => { if (this.#running) this.start(onContent, opts) }, 3000)
      }
    })

    this.#running = true
    this.#tcpStreamCleanup = setInterval(() => this.#cleanTcpStreams(), 30000)
    console.log(`PacketCapture: started on ${this.#iface}`)
  }

  stop() {
    this.#running = false
    if (this.#tcpStreamCleanup) { clearInterval(this.#tcpStreamCleanup); this.#tcpStreamCleanup = null }
    if (this.#process) {
      this.#process.kill('SIGTERM')
      this.#process = null
    }
  }

  getStats() { return { ...this.#stats } }
  getSnapshots(limit = 50) { return this.#snapshots.slice(-limit) }

  // ---- pcap stream parsing ----

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])

    // Parse global header (24 bytes)
    if (!this.#headerParsed) {
      if (this.#buffer.length < 24) return
      const magic = this.#buffer.readUInt32BE(0)
      if (magic === 0xa1b2c3d4) {
        this.#bigEndian = true
      } else if (magic === 0xd4c3b2a1) {
        this.#bigEndian = false
      } else {
        console.error('PacketCapture: invalid pcap magic:', magic.toString(16))
        this.stop()
        return
      }
      const linktype = this.#read32(20)
      if (linktype !== LINKTYPE_ETHERNET) {
        console.error('PacketCapture: unsupported link type:', linktype)
        this.stop()
        return
      }
      this.#snaplen = this.#read32(16)
      this.#buffer = this.#buffer.subarray(24)
      this.#headerParsed = true
    }

    // Parse packet records
    while (this.#buffer.length >= 16) {
      const inclLen = this.#read32(8)
      const origLen = this.#read32(12)
      if (this.#buffer.length < 16 + inclLen) break

      const pktData = this.#buffer.subarray(16, 16 + inclLen)
      this.#buffer = this.#buffer.subarray(16 + inclLen)
      this.#stats.packets++

      try {
        this.#processPacket(pktData, origLen)
        this.#stats.parsed++
      } catch {
        this.#stats.errors++
      }
    }
  }

  #read32(offset) {
    return this.#bigEndian ? this.#buffer.readUInt32BE(offset) : this.#buffer.readUInt32LE(offset)
  }

  // ---- Packet parsing ----

  #processPacket(data, origLen) {
    if (data.length < 14) return // Ethernet header minimum

    // Ethernet header
    const ethertype = data.readUInt16BE(12)
    if (ethertype !== ETHERTYPE_IPV4) return

    // IPv4 header
    const ipStart = 14
    if (data.length < ipStart + 20) return
    const ihl = (data[ipStart] & 0x0f) * 4
    const totalLen = data.readUInt16BE(ipStart + 2)
    const protocol = data[ipStart + 9]
    const srcIp = `${data[ipStart + 12]}.${data[ipStart + 13]}.${data[ipStart + 14]}.${data[ipStart + 15]}`
    const dstIp = `${data[ipStart + 16]}.${data[ipStart + 17]}.${data[ipStart + 18]}.${data[ipStart + 19]}`

    const payloadStart = ipStart + ihl
    const ipEnd = ipStart + Math.min(totalLen, data.length)

    if (protocol === IP_PROTO_TCP) {
      this.#processTcp(data, payloadStart, ipEnd, srcIp, dstIp)
    } else if (protocol === IP_PROTO_UDP) {
      this.#processUdp(data, payloadStart, ipEnd, srcIp, dstIp)
    }
  }

  #processTcp(data, start, end, srcIp, dstIp) {
    if (start + 20 > end) return
    const srcPort = data.readUInt16BE(start)
    const dstPort = data.readUInt16BE(start + 2)
    const dataOffset = ((data[start + 12] >> 4) & 0x0f) * 4
    const payloadStart = start + dataOffset

    if (payloadStart >= end) return
    const payload = data.subarray(payloadStart, end)
    if (payload.length < 1) return

    // TCP stream reassembly for HTTP
    const streamKey = `${srcIp}:${srcPort}->${dstIp}:${dstPort}`
    let stream = this.#tcpStreams.get(streamKey)
    if (!stream) {
      stream = { buf: Buffer.alloc(0), ts: Date.now(), classified: false }
      this.#tcpStreams.set(streamKey, stream)
    }
    stream.buf = Buffer.concat([stream.buf, payload], stream.buf.length + payload.length)
    stream.ts = Date.now()

    // Limit buffer size to 64KB per stream
    if (stream.buf.length > 65536) {
      stream.buf = stream.buf.subarray(-4096)
      stream.classified = false
    }

    const buf = stream.buf
    const firstByte = buf[0]

    // TLS detection — can be detected from first fragment
    if (!stream.classified && firstByte >= 0x14 && firstByte <= 0x17 && buf.length > 5) {
      stream.classified = true
      const record = { ts: Date.now(), protocol: 'tcp', srcIp, dstIp, srcPort, dstPort, payloadLen: payload.length, content: null, contentType: null, encrypted: false }
      this.#classifyTcpPayload(buf, record)
      if (record.content) { this.#stats.contentExtracted++; this.#emit(record) }
      return
    }

    // HTTP reassembly — need complete headers + body
    const headerEndIdx = this.#findHeaderEnd(buf)
    if (headerEndIdx >= 0) {
      const headerStr = buf.subarray(0, headerEndIdx).toString('ascii', 0, Math.min(headerEndIdx, 4096))
      const isReq = this.#isHttpRequest(headerStr)
      const isRes = this.#isHttpResponse(headerStr)

      if (isReq || isRes) {
        // Parse Content-Length to know when body is complete
        const clMatch = headerStr.match(/[Cc]ontent-[Ll]ength:\s*(\d+)/)
        const contentLength = clMatch ? parseInt(clMatch[1]) : 0
        const bodyStart = headerEndIdx + 4
        const bodyReceived = buf.length - bodyStart

        // If no Content-Length, emit on first detection (headers only)
        // If Content-Length present, wait until we have enough body data (or timeout via cleanup)
        if (contentLength === 0 || bodyReceived >= contentLength || bodyReceived >= 8192) {
          stream.classified = true
          const record = { ts: stream.ts, protocol: 'tcp', srcIp, dstIp, srcPort, dstPort, payloadLen: buf.length, content: null, contentType: null, encrypted: false }
          const str = buf.toString('ascii', 0, Math.min(buf.length, 4096))
          record.contentType = 'HTTP'
          record.content = isReq ? this.#parseHttpRequest(str, buf) : this.#parseHttpResponse(str, buf)
          this.#stats.contentExtracted++
          this.#emit(record)
          // Reset stream buffer after emitting complete HTTP message
          stream.buf = Buffer.alloc(0)
          return
        }
        // Body not yet complete — wait for next packet
        return
      }
    }

    // Non-HTTP: classify normally on first data
    if (!stream.classified && buf.length >= 2) {
      stream.classified = true
      const record = { ts: Date.now(), protocol: 'tcp', srcIp, dstIp, srcPort, dstPort, payloadLen: payload.length, content: null, contentType: null, encrypted: false }
      this.#classifyTcpPayload(buf, record)
      if (record.content) { this.#stats.contentExtracted++; this.#emit(record) }
    }
  }

  #findHeaderEnd(buf) {
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) return i
    }
    return -1
  }

  #cleanTcpStreams() {
    const now = Date.now()
    for (const [key, stream] of this.#tcpStreams) {
      // Flush incomplete HTTP streams older than 10s
      if (now - stream.ts > 10000 && stream.buf.length > 0 && !stream.classified) {
        this.#tcpStreams.delete(key)
      }
      // Clean old classified streams
      if (now - stream.ts > 60000) {
        this.#tcpStreams.delete(key)
      }
    }
  }

  #processUdp(data, start, end, srcIp, dstIp) {
    if (start + 8 > end) return
    const srcPort = data.readUInt16BE(start)
    const dstPort = data.readUInt16BE(start + 2)
    const payloadStart = start + 8

    if (payloadStart >= end) return
    const payload = data.subarray(payloadStart, end)
    if (payload.length < 1) return

    const record = {
      ts: Date.now(),
      protocol: 'udp',
      srcIp, dstIp, srcPort, dstPort,
      payloadLen: payload.length,
      content: null,
      contentType: null,
      encrypted: false,
    }

    // Classify UDP payload
    if (dstPort === 53 || srcPort === 53) {
      const dns = this.#parseDns(payload)
      if (dns) {
        record.contentType = 'DNS'
        record.content = dns
      }
    } else {
      // Check for plaintext
      const text = this.#tryExtractPlaintext(payload)
      if (text) {
        record.contentType = 'Plaintext'
        record.content = { text, raw: this.#safeRaw(payload, 512) }
      }
    }

    if (record.content) {
      this.#stats.contentExtracted++
      this.#emit(record)
    }
  }

  // ---- TCP payload classification ----

  #classifyTcpPayload(payload, record) {
    const firstByte = payload[0]

    // TLS detection (ContentType 0x14-0x17)
    if (firstByte >= 0x14 && firstByte <= 0x17 && payload.length > 5) {
      const tlsVersion = payload.readUInt16BE(1)
      const recordLen = payload.readUInt16BE(3)
      record.encrypted = true
      record.contentType = 'TLS'

      const tlsInfo = {
        tlsVersion: TLS_VERSIONS[tlsVersion] || `0x${tlsVersion.toString(16)}`,
        contentType: TLS_CONTENT_TYPES[firstByte] || `Unknown(0x${firstByte.toString(16)})`,
        recordLength: recordLen,
      }

      // Try to extract SNI from ClientHello
      if (firstByte === 0x16 && payload.length > 10 && payload[5] === 0x01) {
        const sni = this.#extractSni(payload)
        if (sni) tlsInfo.serverName = sni
        tlsInfo.handshakeType = 'ClientHello'
      }

      // Try to extract certificate CN/SAN
      if (firstByte === 0x16 && payload.length > 10 && payload[5] === 0x02) {
        tlsInfo.handshakeType = 'ServerHello'
      }
      if (firstByte === 0x16 && payload.length > 10 && payload[5] === 0x0b) {
        tlsInfo.handshakeType = 'Certificate'
      }

      // JA3 fingerprint (simplified)
      if (firstByte === 0x16 && payload[5] === 0x01) {
        tlsInfo.ja3Hash = this.#computeJa3Fingerprint(payload)
      }

      record.content = tlsInfo
      return
    }

    // HTTP detection
    const str = payload.toString('ascii', 0, Math.min(payload.length, 512))
    if (this.#isHttpRequest(str)) {
      record.contentType = 'HTTP'
      record.content = this.#parseHttpRequest(str, payload)
      return
    }
    if (this.#isHttpResponse(str)) {
      record.contentType = 'HTTP'
      record.content = this.#parseHttpResponse(str, payload)
      return
    }

    // Common plaintext protocols
    const port = record.dstPort
    if ([21, 23, 25, 110, 143, 587, 995, 80, 8080, 8443].includes(port) ||
        [21, 23, 25, 110, 143, 587, 995, 80, 8080, 8443].includes(record.srcPort)) {
      const text = this.#tryExtractPlaintext(payload)
      if (text) {
        record.contentType = this.#portToProtocol(port, record.srcPort)
        record.content = { text, raw: this.#safeRaw(payload, 1024) }
      }
    }
  }

  // ---- HTTP parsing ----

  #isHttpRequest(str) {
    return /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)\s+\S+\s+HTTP\//.test(str)
  }

  #isHttpResponse(str) {
    return /^HTTP\/\d\.\d\s+\d{3}/.test(str)
  }

  #parseHttpRequest(str, raw) {
    const lines = str.split('\r\n')
    const requestLine = lines[0] || ''
    const [method, uri, version] = requestLine.split(/\s+/)

    const headers = {}
    let bodyStart = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') { bodyStart = i + 1; break }
      const colon = lines[i].indexOf(':')
      if (colon > 0) {
        headers[lines[i].substring(0, colon).trim().toLowerCase()] = lines[i].substring(colon + 1).trim()
      }
    }

    const result = {
      type: 'request',
      method: method || '',
      uri: uri || '',
      version: version || '',
      host: headers['host'] || '',
      headers,
    }

    // Extract body (for POST/PUT with small bodies)
    if (bodyStart > 0 && bodyStart < lines.length) {
      const headerEnd = raw.indexOf('\r\n\r\n')
      if (headerEnd >= 0 && headerEnd + 4 < raw.length) {
        const body = raw.subarray(headerEnd + 4)
        const ct = headers['content-type'] || ''
        if (ct.includes('text') || ct.includes('json') || ct.includes('xml') || ct.includes('form') || ct.includes('javascript')) {
          result.body = body.toString('utf8', 0, Math.min(body.length, 2048))
        } else {
          const text = body.toString('utf8', 0, Math.min(body.length, 2048))
          if (this.#isLikelyText(text)) {
            result.body = text
          } else {
            result.body = `[Binary data: ${body.length} bytes]`
          }
        }
      }
    }

    // Reconstruct full URL
    if (result.host && result.uri) {
      result.fullUrl = `http://${result.host}${result.uri.startsWith('/') ? '' : '/'}${result.uri}`
    }

    return result
  }

  #parseHttpResponse(str, raw) {
    const lines = str.split('\r\n')
    const statusLine = lines[0] || ''
    const match = statusLine.match(/^(HTTP\/\d\.\d)\s+(\d+)\s*(.*)/)

    const headers = {}
    let bodyStart = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') { bodyStart = i + 1; break }
      const colon = lines[i].indexOf(':')
      if (colon > 0) {
        headers[lines[i].substring(0, colon).trim().toLowerCase()] = lines[i].substring(colon + 1).trim()
      }
    }

    const result = {
      type: 'response',
      version: match?.[1] || '',
      statusCode: parseInt(match?.[2]) || 0,
      statusText: match?.[3] || '',
      headers,
    }

    // Extract body preview
    if (bodyStart > 0 && bodyStart < lines.length) {
      const headerEnd = raw.indexOf('\r\n\r\n')
      if (headerEnd >= 0 && headerEnd + 4 < raw.length) {
        const body = raw.subarray(headerEnd + 4)
        const ct = headers['content-type'] || ''
        if (ct.includes('text') || ct.includes('json') || ct.includes('xml') || ct.includes('javascript')) {
          result.body = body.toString('utf8', 0, Math.min(body.length, 4096))
        } else if (ct.includes('image')) {
          result.body = `[Image: ${ct}, ${body.length} bytes]`
        } else {
          const text = body.toString('utf8', 0, Math.min(body.length, 4096))
          if (this.#isLikelyText(text)) {
            result.body = text
          } else {
            result.body = `[Binary data: ${body.length} bytes]`
          }
        }
      }
    }

    return result
  }

  // ---- DNS parsing ----

  #parseDns(buf) {
    try {
      if (buf.length < 12) return null
      const id = buf.readUInt16BE(0)
      const flags = buf.readUInt16BE(2)
      const qr = (flags >> 15) & 1
      const rcode = flags & 0x0f
      const qdcount = buf.readUInt16BE(4)
      const ancount = buf.readUInt16BE(6)

      if (qdcount === 0) return null

      let offset = 12
      const questions = []
      for (let i = 0; i < qdcount && offset < buf.length; i++) {
        const { name, newOffset } = this.#readDnsName(buf, offset)
        offset = newOffset + 4 // skip qtype + qclass
        questions.push(name)
      }

      const answers = []
      if (qr === 1) {
        for (let i = 0; i < Math.min(ancount, 20) && offset < buf.length; i++) {
          const { name, newOffset } = this.#readDnsName(buf, offset)
          offset = newOffset
          if (offset + 10 > buf.length) break
          const atype = buf.readUInt16BE(offset)
          const rdLen = buf.readUInt16BE(offset + 8)
          offset += 10
          if (offset + rdLen > buf.length) break

          if (atype === 1 && rdLen === 4) {
            answers.push({ type: 'A', name, value: `${buf[offset]}.${buf[offset+1]}.${buf[offset+2]}.${buf[offset+3]}` })
          } else if (atype === 5) {
            const { name: cname } = this.#readDnsName(buf, offset)
            answers.push({ type: 'CNAME', name, value: cname })
          } else if (atype === 28 && rdLen === 16) {
            const parts = []
            for (let j = 0; j < 16; j += 2) parts.push(buf.readUInt16BE(offset + j).toString(16))
            answers.push({ type: 'AAAA', name, value: parts.join(':') })
          }
          offset += rdLen
        }
      }

      return {
        id, isResponse: qr === 1, rcode,
        questions, answers,
        summary: questions.join(', ') + (answers.length ? ` → ${answers.map(a => a.value).join(', ')}` : ''),
      }
    } catch {
      return null
    }
  }

  #readDnsName(buf, offset) {
    const labels = []
    let jumped = false
    let newOffset = offset
    let pos = offset

    while (pos < buf.length) {
      const len = buf[pos]
      if (len === 0) { pos++; if (!jumped) newOffset = pos; break }
      if ((len & 0xc0) === 0xc0) {
        if (pos + 1 >= buf.length) break
        const ptr = ((len & 0x3f) << 8) | buf[pos + 1]
        if (!jumped) newOffset = pos + 2
        jumped = true
        pos = ptr
        continue
      }
      pos++
      if (pos + len > buf.length) break
      labels.push(buf.toString('ascii', pos, pos + len))
      pos += len
    }
    if (!jumped) newOffset = pos

    return { name: labels.join('.'), newOffset }
  }

  // ---- TLS SNI extraction ----

  #extractSni(buf) {
    try {
      if (buf.length < 43 || buf[0] !== 0x16) return null
      let offset = 5
      if (buf[offset] !== 0x01) return null
      offset += 4 + 34 // handshake header + version + random

      if (offset >= buf.length) return null
      const sessionIdLen = buf[offset]
      offset += 1 + sessionIdLen

      if (offset + 2 > buf.length) return null
      const csLen = buf.readUInt16BE(offset)
      offset += 2 + csLen

      if (offset >= buf.length) return null
      const compLen = buf[offset]
      offset += 1 + compLen

      if (offset + 2 > buf.length) return null
      const extLen = buf.readUInt16BE(offset)
      offset += 2
      const extEnd = Math.min(offset + extLen, buf.length)

      while (offset + 4 <= extEnd) {
        const extType = buf.readUInt16BE(offset)
        const extDataLen = buf.readUInt16BE(offset + 2)
        offset += 4

        if (extType === 0x0000) { // SNI
          if (offset + 5 <= extEnd) {
            const sniLen = buf.readUInt16BE(offset + 3)
            const sniStart = offset + 5
            if (sniStart + sniLen <= buf.length) {
              return buf.toString('ascii', sniStart, sniStart + sniLen)
            }
          }
        }
        offset += extDataLen
      }
    } catch {}
    return null
  }

  #computeJa3Fingerprint(buf) {
    try {
      if (buf.length < 50 || buf[0] !== 0x16 || buf[5] !== 0x01) return null
      let offset = 5 + 4 + 2 + 32 // handshake header + version + random

      const sessionIdLen = buf[offset]
      offset += 1 + sessionIdLen

      if (offset + 2 > buf.length) return null
      const csLen = buf.readUInt16BE(offset)
      offset += 2
      const ciphers = []
      const csEnd = Math.min(offset + csLen, buf.length)
      while (offset + 2 <= csEnd) {
        ciphers.push(buf.readUInt16BE(offset).toString(16).padStart(4, '0'))
        offset += 2
      }
      offset = csEnd

      // Skip compression methods
      if (offset >= buf.length) return null
      const compLen = buf[offset]
      offset += 1 + compLen

      return ciphers.join('-')
    } catch {
      return null
    }
  }

  // ---- Plaintext extraction ----

  #tryExtractPlaintext(buf) {
    if (buf.length < 2) return null
    // Check if mostly printable ASCII
    const sample = buf.subarray(0, Math.min(buf.length, 64))
    let printable = 0
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i]
      if ((b >= 0x20 && b <= 0x7e) || b === 0x0a || b === 0x0d || b === 0x09) printable++
    }
    if (printable / sample.length < 0.7) return null
    return buf.toString('utf8', 0, Math.min(buf.length, 4096))
  }

  #isLikelyText(str) {
    if (!str || str.length === 0) return false
    const sample = str.slice(0, 128)
    let printable = 0
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i)
      if ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x0d || c === 0x09 || c > 0x7f) printable++
    }
    return printable / sample.length >= 0.7
  }

  #safeRaw(buf, maxLen) {
    const slice = buf.subarray(0, Math.min(buf.length, maxLen))
    // Return hex string for binary data
    return slice.toString('hex').match(/.{2}/g).join(' ')
  }

  #portToProtocol(dstPort, srcPort) {
    const port = dstPort < 1024 ? dstPort : srcPort
    const map = { 21: 'FTP', 23: 'Telnet', 25: 'SMTP', 110: 'POP3', 143: 'IMAP', 587: 'SMTP', 995: 'POP3S', 80: 'HTTP', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt' }
    return map[port] || 'Plaintext'
  }

  #emit(record) {
    // Store snapshot for real-time viewing
    this.#snapshots.push(record)
    if (this.#snapshots.length > this.#maxSnapshots) {
      this.#snapshots = this.#snapshots.slice(-this.#maxSnapshots / 2)
    }
    this.#onContent?.(record)
  }
}
