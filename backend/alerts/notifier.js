import fs from 'node:fs'
import crypto from 'node:crypto'

const CONFIG_PATH = new URL('../../config.json', import.meta.url).pathname
const LEVEL_PRIORITY = { critical: 3, warning: 2, info: 1 }
const MIN_INTERVAL = 60000 // 1 min between pushes per channel

class Notifier {
  #channels = []
  #lastPush = new Map()
  #configPath

  constructor() {
    this.#configPath = CONFIG_PATH
    this.loadConfig()
  }

  loadConfig() {
    try {
      const config = JSON.parse(fs.readFileSync(this.#configPath, 'utf-8'))
      this.#channels = (config.notify?.channels || []).map(ch => ({
        ...ch,
        id: ch.id || crypto.randomBytes(4).toString('hex'),
        enabled: ch.enabled !== false,
        minInterval: ch.minInterval || MIN_INTERVAL,
        levelFilter: ch.levelFilter || 'warning',
      }))
    } catch {
      this.#channels = []
    }
  }

  saveConfig(channels) {
    const config = JSON.parse(fs.readFileSync(this.#configPath, 'utf-8'))
    config.notify = { ...(config.notify || {}), channels }
    fs.writeFileSync(this.#configPath, JSON.stringify(config, null, 2))
    this.#channels = channels.map(ch => ({
      ...ch,
      enabled: ch.enabled !== false,
      minInterval: ch.minInterval || MIN_INTERVAL,
      levelFilter: ch.levelFilter || 'warning',
    }))
  }

  getChannels() {
    return this.#channels.map(ch => ({
      ...ch,
      // Mask sensitive fields
      botToken: ch.botToken ? '****' + ch.botToken.slice(-4) : undefined,
      webhookUrl: ch.webhookUrl ? ch.webhookUrl.replace(/key=[^&]+/, 'key=****') : undefined,
    }))
  }

  getChannelsRaw() {
    return this.#channels
  }

  async notify(alert) {
    if (!alert) return
    const alertLevel = LEVEL_PRIORITY[alert.level] || 0

    const results = []
    for (const ch of this.#channels) {
      if (!ch.enabled) continue
      if (LEVEL_PRIORITY[ch.levelFilter] > alertLevel) continue

      // Rate limit
      const lastTime = this.#lastPush.get(ch.id) || 0
      if (Date.now() - lastTime < ch.minInterval) continue

      this.#lastPush.set(ch.id, Date.now())

      try {
        const ok = await this.#send(ch, alert)
        results.push({ channel: ch.id, type: ch.type, ok })
      } catch (e) {
        console.warn(`Notify ${ch.type}/${ch.id} failed:`, e.message)
        results.push({ channel: ch.id, type: ch.type, ok: false, error: e.message })
      }
    }
    return results
  }

  async #send(ch, alert) {
    switch (ch.type) {
      case 'telegram': return this.#sendTelegram(ch, alert)
      case 'wechat':   return this.#sendWechat(ch, alert)
      case 'dingtalk': return this.#sendDingtalk(ch, alert)
      case 'webhook':  return this.#sendWebhook(ch, alert)
      default: return false
    }
  }

  #formatAlert(alert) {
    const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵'
    const time = new Date(alert.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const lines = [
      `${icon} **${alert.title}**`,
      ``,
      alert.message,
    ]
    if (alert.srcIp) lines.push(`\n来源 IP: \`${alert.srcIp}\``)
    lines.push(`\n⏰ ${time}`)
    return lines.join('\n')
  }

  async #sendTelegram(ch, alert) {
    const text = this.#formatAlert(alert)
    const url = `https://api.telegram.org/bot${ch.botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ch.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) throw new Error(`Telegram API ${res.status}`)
    return true
  }

  async #sendWechat(ch, alert) {
    const text = this.#formatAlert(alert).replace(/\*\*/g, '').replace(/`/g, '')
    // Server酱 (sctapi.ftqq.com) or PushPlus
    const url = ch.provider === 'pushplus'
      ? 'http://www.pushplus.plus/send'
      : 'https://sctapi.ftqq.com/send'

    const body = ch.provider === 'pushplus'
      ? { token: ch.botToken, title: alert.title, content: text, template: 'txt' }
      : { key: ch.botToken, title: alert.title, desp: text }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`WeChat API ${res.status}`)
    return true
  }

  async #sendDingtalk(ch, alert) {
    const text = this.#formatAlert(alert)
    const body = {
      msgtype: 'markdown',
      markdown: { title: alert.title, text },
    }

    let url = ch.webhookUrl

    // Optional sign
    if (ch.secret) {
      const timestamp = Date.now()
      const stringToSign = `${timestamp}\n${ch.secret}`
      const hmac = crypto.createHmac('sha256', ch.secret).update(stringToSign).digest('base64')
      url += `&timestamp=${timestamp}&sign=${encodeURIComponent(hmac)}`
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`DingTalk API ${res.status}`)
    return true
  }

  async #sendWebhook(ch, alert) {
    const payload = {
      event: 'alert',
      level: alert.level,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      srcIp: alert.srcIp || null,
      dstIp: alert.dstIp || null,
      timestamp: alert.ts,
      details: alert.details || {},
    }
    const res = await fetch(ch.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Webhook ${res.status}`)
    return true
  }

  async testChannel(channelId) {
    const ch = this.#channels.find(c => c.id === channelId)
    if (!ch) throw new Error('Channel not found')

    const testAlert = {
      level: 'warning',
      type: 'test',
      title: '🔔 推送测试',
      message: `这是一条来自 Smart Monitor 的测试消息。\n渠道: ${ch.type}\n时间: ${new Date().toLocaleString('zh-CN')}`,
      ts: Date.now(),
    }

    try {
      await this.#send(ch, testAlert)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }
}

export const notifier = new Notifier()
