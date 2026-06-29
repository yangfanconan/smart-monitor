import http from 'node:http'
import { identifyService } from './user-analytics.js'

const GEO_API = 'http://ip-api.com/batch'
const GEO_BATCH_SIZE = 50
const MAX_GEO_QUEUE = 500
const MAX_GEO_RETRIES = 3
const PRIVATE_RANGES = [
  /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^127\./, /^0\./,
  /^169\.254\./, /^224\./, /^240\./, /^ff/i, /^fe80/i, /^::1$/, /^fc/i, /^fd/i
]

export class IpIntelligence {
  #storage = null
  #timer = null
  #lastProcessedId = 0
  #geoQueue = []
  #geoRetries = new Map()  // Track retry counts per IP
  #geoTimer = null
  #processing = false

  start(storage) {
    this.#storage = storage
    // Track last processed content_record id
    const last = storage.db.prepare('SELECT MAX(id) as maxId FROM content_records WHERE content_type = ?').get('DNS')
    this.#lastProcessedId = last?.maxId || 0

    // Initial full scan of existing DNS records
    this.#mineExistingRecords()

    // Periodic incremental mining every 10 minutes (reduced from 5)
    this.#timer = setInterval(() => this.#incrementalMine(), 600000)

    // GeoIP batch flush every 2 minutes (reduced from 30 seconds)
    this.#geoTimer = setInterval(() => this.#flushGeoQueue(), 120000)

    console.log(`IpIntelligence: started, last DNS id=${this.#lastProcessedId}`)
  }

  stop() {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = null }
    if (this.#geoTimer) { clearInterval(this.#geoTimer); this.#geoTimer = null }
  }

  // Scan existing DNS records on startup
  #mineExistingRecords() {
    try {
      const rows = this.#storage.db.prepare(
        "SELECT id, detail, dst_ip FROM content_records WHERE content_type = 'DNS' AND detail IS NOT NULL ORDER BY id DESC LIMIT 2000"
      ).all()

      let newIps = 0
      for (const row of rows) {
        const mappings = this.#extractDnsMappings(row)
        for (const m of mappings) {
          const inserted = this.#upsertFromDns(m.ip, m.domains, row.id <= this.#lastProcessedId ? row.ts : Date.now())
          if (inserted) newIps++
        }
      }
      console.log(`IpIntelligence: initial scan processed ${rows.length} DNS records, ${newIps} new IPs`)

      // Queue GeoIP lookups for IPs without country
      this.#queueUnknownForGeo()
    } catch (e) {
      console.warn('IpIntelligence: initial scan error:', e.message)
    }
  }

  // Incremental mining of new DNS records
  #incrementalMine() {
    if (this.#processing) return
    this.#processing = true
    try {
      const rows = this.#storage.db.prepare(
        "SELECT id, ts, detail, dst_ip FROM content_records WHERE content_type = 'DNS' AND id > ? AND detail IS NOT NULL ORDER BY id ASC LIMIT 1000"
      ).all(this.#lastProcessedId)

      if (rows.length === 0) { this.#processing = false; return }

      let newIps = 0
      for (const row of rows) {
        const mappings = this.#extractDnsMappings(row)
        for (const m of mappings) {
          const inserted = this.#upsertFromDns(m.ip, m.domains, row.ts)
          if (inserted) newIps++
        }
        this.#lastProcessedId = row.id
      }

      if (newIps > 0 || rows.length > 0) {
        console.log(`IpIntelligence: mined ${rows.length} new DNS records, ${newIps} new IPs`)
        this.#queueUnknownForGeo()
      }
    } catch (e) {
      console.warn('IpIntelligence: incremental mine error:', e.message)
    } finally {
      this.#processing = false
    }
  }

  // Extract IP-domain mappings from a DNS response record
  #extractDnsMappings(row) {
    const mappings = []
    try {
      const detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail
      if (!detail || !detail.isResponse || !detail.answers?.length) return mappings

      const domains = detail.questions || []
      for (const ans of detail.answers) {
        if ((ans.type === 'A' || ans.type === 'AAAA') && ans.value && !this.#isPrivateIp(ans.value)) {
          mappings.push({ ip: ans.value, domains })
        }
      }
    } catch {}
    return mappings
  }

  // Upsert IP knowledge from DNS data
  #upsertFromDns(ip, domains, ts) {
    const existing = this.#storage.getIpKnowledge(ip)
    if (existing) {
      // Merge domains
      const existingDomains = existing.domains ? JSON.parse(existing.domains) : []
      const merged = [...new Set([...existingDomains, ...domains])]
      const primaryDomain = merged[0]
      const svc = identifyService(primaryDomain, ip)
      this.#storage.upsertIpKnowledge(ip, {
        domains: JSON.stringify(merged.slice(0, 20)),
        app_name: svc.name !== ip ? svc.name : existing.app_name,
        category: svc.category !== '未知' ? svc.category : existing.category,
        last_seen: ts,
        query_count: 1,
        source: existing.source || 'dns'
      })
      return false
    }

    const primaryDomain = domains[0]
    const svc = identifyService(primaryDomain, ip)
    this.#storage.upsertIpKnowledge(ip, {
      domains: JSON.stringify(domains.slice(0, 20)),
      app_name: svc.name !== ip ? svc.name : null,
      category: svc.category !== '未知' ? svc.category : null,
      first_seen: ts,
      last_seen: ts,
      query_count: 1,
      source: 'dns'
    })
    return true
  }

  // Queue IPs without geo data for batch lookup
  #queueUnknownForGeo() {
    if (this.#geoQueue.length >= MAX_GEO_QUEUE) return
    try {
      const queuedSet = new Set(this.#geoQueue)
      const limit = MAX_GEO_QUEUE - this.#geoQueue.length
      const ips = this.#storage.db.prepare(
        "SELECT ip FROM ip_knowledge WHERE country IS NULL AND manual = 0 AND ip NOT LIKE '192.168.%' AND ip NOT LIKE '10.%' AND ip NOT LIKE '172.16%' LIMIT ?"
      ).all(limit)
      for (const row of ips) {
        if (!queuedSet.has(row.ip)) {
          this.#geoQueue.push(row.ip)
          queuedSet.add(row.ip)
        }
      }
    } catch {}
  }

  // Flush geo queue via batch API
  async #flushGeoQueue() {
    if (this.#geoQueue.length === 0) return
    const batch = this.#geoQueue.splice(0, GEO_BATCH_SIZE)
    try {
      const results = await this.#geoipLookup(batch)
      for (const r of results) {
        if (r.status === 'success') {
          this.#storage.updateIpKnowledge(r.query, {
            country: r.country,
            region: r.regionName,
            city: r.city,
            isp: r.isp,
            latitude: r.lat,
            longitude: r.lon
          })
          this.#geoRetries.delete(r.query)  // Reset retry count on success
        }
      }
      if (results.length > 0) console.log(`IpIntelligence: geo-updated ${results.length} IPs`)
    } catch (e) {
      console.warn('IpIntelligence: geo lookup error:', e.message)
      // Re-queue failed IPs only if under retry limit
      for (const ip of batch) {
        const retries = (this.#geoRetries.get(ip) || 0) + 1
        if (retries < MAX_GEO_RETRIES) {
          this.#geoRetries.set(ip, retries)
          this.#geoQueue.push(ip)
        } else {
          this.#geoRetries.delete(ip)  // Give up on this IP
        }
      }
    }
  }

  // GeoIP batch lookup via ip-api.com (free: 45 req/min, HTTP only)
  #geoipLookup(ips) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(ips.map(ip => ({ query: ip, fields: 'query,status,country,regionName,city,lat,lon,isp' })))
      const req = http.request({
        hostname: 'ip-api.com',
        path: '/batch',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 10000
      }, (res) => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid geo response')) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Geo API timeout')) })
      req.write(data)
      req.end()
    })
  }

  #isPrivateIp(ip) {
    return PRIVATE_RANGES.some(r => r.test(ip))
  }

  // Manual refresh: re-scan all DNS records
  async refresh() {
    this.#lastProcessedId = 0
    this.#mineExistingRecords()
    return { message: 'Refresh completed' }
  }

  // Process a single DNS record in real-time (called from content ingestion)
  processDnsRecord(record) {
    try {
      if (!record.detail) return
      const detail = typeof record.detail === 'string' ? JSON.parse(record.detail) : record.detail
      if (!detail?.isResponse || !detail.answers?.length) return

      const domains = detail.questions || []
      for (const ans of detail.answers) {
        if ((ans.type === 'A' || ans.type === 'AAAA') && ans.value && !this.#isPrivateIp(ans.value)) {
          this.#upsertFromDns(ans.value, domains, record.ts || Date.now())
        }
      }
    } catch {}
  }
}
