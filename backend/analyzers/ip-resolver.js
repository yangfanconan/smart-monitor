import dns from 'node:dns'

// Well-known IP to service/domain mappings
const WELL_KNOWN_IPS = {
  // DNS Servers
  '8.8.8.8': 'Google DNS',
  '8.8.4.4': 'Google DNS',
  '8.8.8.4': 'Google DNS',
  '8.8.4.8': 'Google DNS',
  '114.114.114.114': '114 DNS',
  '114.114.115.115': '114 DNS',
  '223.5.5.5': 'AliDNS',
  '223.6.6.6': 'AliDNS',
  '1.1.1.1': 'Cloudflare DNS',
  '1.0.0.1': 'Cloudflare DNS',
  '9.9.9.9': 'Quad9 DNS',
  '149.112.112.112': 'Quad9 DNS',
  '208.67.222.222': 'OpenDNS',
  '208.67.220.220': 'OpenDNS',
  
  // NTP Servers
  '120.25.115.20': '阿里云 NTP',
  'ntp.aliyun.com': '阿里云 NTP',
  
  // Common CDNs and Services
  '13.107.42.14': 'Microsoft',
  '13.107.43.14': 'Microsoft',
  '151.101.1.69': 'Fastly CDN',
  '151.101.65.69': 'Fastly CDN',
  '185.199.108.153': 'GitHub Pages',
  '185.199.109.153': 'GitHub Pages',
  '185.199.110.153': 'GitHub Pages',
  '185.199.111.153': 'GitHub Pages',
  
  // Chinese Services
  '101.226.4.6': '腾讯 CDN',
  '101.227.139.217': '腾讯 CDN',
  '110.242.68.3': '百度 CDN',
  '110.242.68.4': '百度 CDN',
  '111.13.100.91': '新浪 CDN',
  '111.13.100.92': '新浪 CDN',
  '123.125.114.144': '百度',
  '123.125.115.110': '百度',
  '14.215.177.38': '百度',
  '14.215.177.39': '百度',
  '220.181.38.148': '百度',
  '220.181.38.149': '百度',
  '111.206.223.204': '360',
  '111.206.223.205': '360',
  '123.56.175.225': '阿里云',
  '123.57.220.117': '阿里云',
  '47.96.0.1': '阿里云',
  '47.96.0.2': '阿里云',
  '106.11.0.0': '阿里云 CDN',
  '106.11.0.1': '阿里云 CDN',
  
  // Social Media
  '101.226.4.6': '腾讯',
  '101.227.139.217': '腾讯',
  '111.161.64.40': '腾讯',
  '111.161.64.41': '腾讯',
  '111.161.64.48': '腾讯',
  '111.161.64.49': '腾讯',
  '111.161.64.56': '腾讯',
  '111.161.64.57': '腾讯',
  '111.161.64.64': '腾讯',
  '111.161.64.65': '腾讯',
  '111.161.64.72': '腾讯',
  '111.161.64.73': '腾讯',
  '111.161.64.80': '腾讯',
  '111.161.64.81': '腾讯',
  '111.161.64.88': '腾讯',
  '111.161.64.89': '腾讯',
  '111.161.64.96': '腾讯',
  '111.161.64.97': '腾讯',
  
  // Video Services
  '110.242.68.3': '百度/爱奇艺',
  '110.242.68.4': '百度/爱奇艺',
  '119.75.217.109': '爱奇艺',
  '119.75.218.70': '爱奇艺',
  '180.153.32.100': '优酷',
  '180.153.32.101': '优酷',
  '203.119.169.73': '优酷',
  '203.119.169.74': '优酷',
  '101.226.4.6': 'B 站',
  '101.227.139.217': 'B 站',
  
  // Gaming
  '101.226.4.6': '腾讯游戏',
  '111.161.64.40': '腾讯游戏',
  '182.254.116.117': '腾讯游戏',
  '182.254.116.118': '腾讯游戏',
  
  // Private IP ranges (local services)
  '192.168.1.1': '网关/路由器',
  '192.168.1.255': '局域网广播',
  '255.255.255.255': '广播地址',
  '127.0.0.1': '本地回环',
  '0.0.0.0': '默认路由',
}

export class IpResolver {
  #cache = new Map() // ip -> { name, ts }
  #cacheTTL = 3600000 // 1 hour
  #pending = new Set() // IPs currently being resolved

  constructor() {
    // Initialize with well-known IPs
    for (const [ip, name] of Object.entries(WELL_KNOWN_IPS)) {
      this.#cache.set(ip, { name, ts: Date.now(), source: 'well-known' })
    }
  }

  // Resolve IP to name
  async resolve(ip) {
    if (!ip) return null
    
    // Check cache first
    const cached = this.#cache.get(ip)
    if (cached && Date.now() - cached.ts < this.#cacheTTL) {
      return cached.name
    }

    // Skip private IPs
    if (this.#isPrivateIp(ip)) {
      return this.#getPrivateIpName(ip)
    }

    // Skip if already pending
    if (this.#pending.has(ip)) return null
    this.#pending.add(ip)

    try {
      // Try reverse DNS lookup
      const hostname = await this.#reverseDns(ip)
      if (hostname) {
        this.#cache.set(ip, { name: hostname, ts: Date.now(), source: 'dns' })
        return hostname
      }
    } catch {} finally {
      this.#pending.delete(ip)
    }

    return null
  }

  // Batch resolve IPs
  async resolveBatch(ips) {
    const results = {}
    const promises = ips.map(async ip => {
      const name = await this.resolve(ip)
      if (name) results[ip] = name
    })
    await Promise.allSettled(promises)
    return results
  }

  // Get all cached mappings
  getAllMappings() {
    const result = {}
    for (const [ip, entry] of this.#cache.entries()) {
      if (Date.now() - entry.ts < this.#cacheTTL) {
        result[ip] = entry.name
      }
    }
    return result
  }

  // Add custom mapping
  addMapping(ip, name) {
    this.#cache.set(ip, { name, ts: Date.now(), source: 'custom' })
  }

  #reverseDns(ip) {
    return new Promise((resolve, reject) => {
      dns.reverse(ip, (err, hostnames) => {
        if (err || !hostnames || hostnames.length === 0) {
          resolve(null)
        } else {
          // Return the first hostname, clean it up
          let hostname = hostnames[0]
          // Remove trailing dot
          if (hostname.endsWith('.')) hostname = hostname.slice(0, -1)
          resolve(hostname)
        }
      })
    })
  }

  #isPrivateIp(ip) {
    if (!ip) return false
    // IPv4 private ranges
    if (ip.startsWith('10.')) return true
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1])
      if (second >= 16 && second <= 31) return true
    }
    if (ip.startsWith('192.168.')) return true
    if (ip.startsWith('127.')) return true
    if (ip.startsWith('169.254.')) return true
    // IPv6 private
    if (ip.startsWith('fd') || ip.startsWith('fc')) return true
    if (ip.startsWith('fe80')) return true
    return false
  }

  #getPrivateIpName(ip) {
    if (ip === '192.168.1.1') return '网关/路由器'
    if (ip.startsWith('192.168.')) return '局域网设备'
    if (ip.startsWith('10.')) return '局域网设备'
    if (ip.startsWith('172.')) return '局域网设备'
    if (ip.startsWith('127.')) return '本地回环'
    if (ip.startsWith('169.254.')) return '链路本地'
    if (ip.startsWith('fd') || ip.startsWith('fc')) return 'IPv6 本地'
    if (ip.startsWith('fe80')) return 'IPv6 链路本地'
    return '私有地址'
  }
}
