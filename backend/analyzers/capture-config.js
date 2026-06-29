import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../config.json')

const DEFAULT_CONFIG = {
  capture: {
    enabled: true,
    // 设备规则: mode = 'all' | 'whitelist' | 'blacklist'
    deviceRules: {
      mode: 'all',
      // whitelist: 只捕获这些 IP 的报文
      whitelist: [],
      // blacklist: 不捕获这些 IP 的报文
      blacklist: [],
    },
    // 类型规则: 哪些类型的数据需要保存
    typeRules: {
      HTTP: { enabled: true, description: 'HTTP 明文请求/响应' },
      DNS: { enabled: true, description: 'DNS 查询/响应' },
      TLS: { enabled: true, description: 'TLS/HTTPS 加密握手元数据' },
      Plaintext: { enabled: true, description: 'TCP/UDP 明文报文' },
      Telnet: { enabled: true, description: 'Telnet 明文会话' },
      FTP: { enabled: true, description: 'FTP 明文传输' },
      SMTP: { enabled: true, description: 'SMTP 邮件协议' },
    },
    // 报文大小过滤 (bytes), 0 = 不限
    sizeFilter: {
      minSize: 0,
      maxSize: 0,
    },
    // 自动清理策略: 每种类型的数据保留多久 (小时), 0 = 永不清理
    retention: {
      HTTP: 24,
      DNS: 48,
      TLS: 168,       // 7 天
      Plaintext: 72,
      Telnet: 168,    // 7 天
      FTP: 168,
      SMTP: 168,
      _default: 48,   // 未指定类型的默认保留时间
    },
  }
}

export class CaptureConfig {
  #config = null
  #watcher = null

  constructor() {
    this.#load()
  }

  #load() {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      this.#config = { ...DEFAULT_CONFIG, ...raw }
      if (!this.#config.capture) this.#config.capture = DEFAULT_CONFIG.capture
      // Merge defaults for missing nested keys
      this.#config.capture = { ...DEFAULT_CONFIG.capture, ...this.#config.capture }
      this.#config.capture.deviceRules = { ...DEFAULT_CONFIG.capture.deviceRules, ...this.#config.capture.deviceRules }
      this.#config.capture.typeRules = { ...DEFAULT_CONFIG.capture.typeRules, ...this.#config.capture.typeRules }
      this.#config.capture.sizeFilter = { ...DEFAULT_CONFIG.capture.sizeFilter, ...this.#config.capture.sizeFilter }
      this.#config.capture.retention = { ...DEFAULT_CONFIG.capture.retention, ...this.#config.capture.retention }
    } catch {
      this.#config = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    }
  }

  #save() {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      raw.capture = this.#config.capture
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2))
    } catch (e) {
      console.error('CaptureConfig: save failed:', e.message)
    }
  }

  get() { return this.#config.capture }

  update(partial) {
    const c = this.#config.capture
    if (partial.enabled !== undefined) c.enabled = partial.enabled
    if (partial.deviceRules) c.deviceRules = { ...c.deviceRules, ...partial.deviceRules }
    if (partial.typeRules) c.typeRules = { ...c.typeRules, ...partial.typeRules }
    if (partial.sizeFilter) c.sizeFilter = { ...c.sizeFilter, ...partial.sizeFilter }
    if (partial.retention) c.retention = { ...c.retention, ...partial.retention }
    this.#save()
    return c
  }

  // Check if a packet from this IP should be captured
  shouldCaptureIp(ip) {
    const rules = this.#config.capture.deviceRules
    if (rules.mode === 'blacklist') {
      return !rules.blacklist.includes(ip)
    }
    if (rules.mode === 'whitelist') {
      return rules.whitelist.includes(ip)
    }
    return true // mode === 'all'
  }

  // Check if this content type should be saved
  shouldSaveType(contentType) {
    const rule = this.#config.capture.typeRules[contentType]
    if (rule) return rule.enabled
    return true // default: save
  }

  // Check if payload size passes filter
  shouldCaptureSize(payloadLen) {
    const { minSize, maxSize } = this.#config.capture.sizeFilter
    if (minSize > 0 && payloadLen < minSize) return false
    if (maxSize > 0 && payloadLen > maxSize) return false
    return true
  }

  // Get retention hours for a content type
  getRetentionHours(contentType) {
    return this.#config.capture.retention[contentType] ?? this.#config.capture.retention._default ?? 48
  }

  // Get all retention policies with metadata
  getRetentionPolicies() {
    const ret = this.#config.capture.retention
    const typeRules = this.#config.capture.typeRules
    return Object.entries(ret)
      .filter(([k]) => k !== '_default')
      .map(([type, hours]) => ({
        type,
        retentionHours: hours,
        description: typeRules[type]?.description || type,
        enabled: typeRules[type]?.enabled !== false,
      }))
  }
}

export const captureConfig = new CaptureConfig()
