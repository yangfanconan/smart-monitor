import { getDeviceAnalytics, getCategorySummary, getHourlyDistribution, getCrossDeviceAnalysis } from './user-analytics.js'
import fs from 'node:fs'
import path from 'node:path'

// Load DashScope config from qwen settings
function loadDashScopeConfig() {
  try {
    const settingsPath = path.join(process.env.HOME || '/root', '.qwen/settings.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const apiKey = settings.env?.BAILIAN_CODING_PLAN_API_KEY || process.env.DASHSCOPE_API_KEY || ''
    const provider = settings.modelProviders?.openai?.[0]
    return {
      apiKey,
      baseUrl: provider?.baseUrl || 'https://coding.dashscope.aliyuncs.com/v1',
      model: provider?.id || 'qwen-plus',
    }
  } catch {
    return {
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    }
  }
}

export class LlmAnalyzer {
  #config = null
  #timeout = 120000

  constructor(opts = {}) {
    if (opts.timeout) this.#timeout = opts.timeout
  }

  #getConfig() {
    if (!this.#config) this.#config = loadDashScopeConfig()
    return this.#config
  }

  // Build context data for LLM analysis
  #buildContext(minutes = 60) {
    const devices = getDeviceAnalytics(minutes)
    const categories = getCategorySummary(minutes)

    // Compact device summary - top 8 devices, top 5 services each
    const deviceSummary = devices.slice(0, 8).map(d =>
      `${d.hostname || d.ip}: ${d.totalVisits}次访问, ${fmtBytes(d.totalBytes)}, Top: ${d.services.slice(0, 5).map(s => `${s.name}(${s.visitCount})`).join('/')}`
    ).join('\n')

    const catSummary = categories.slice(0, 10).map(c => `${c.category}(${c.visitCount}次/${c.deviceCount}设备)`).join(', ')

    return `网络数据(最近${minutes}分钟): ${devices.length}台设备, 总访问${devices.reduce((s, d) => s + d.totalVisits, 0)}次
分类: ${catSummary}
设备:
${deviceSummary}`
  }

  // Call DashScope API (OpenAI-compatible)
  async #callApi(messages) {
    const config = this.#getConfig()
    if (!config.apiKey) throw new Error('未配置 API Key，请在设置中配置 DashScope API Key')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeout)

    try {
      const resp = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
          extra_body: { enable_thinking: false },
        }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 200)}`)
      }

      const data = await resp.json()
      const text = data.choices?.[0]?.message?.content || ''
      return { text, model: config.model, partial: false }
    } finally {
      clearTimeout(timer)
    }
  }

  // Custom prompt analysis
  async analyze(prompt, minutes = 60) {
    const context = this.#buildContext(minutes)
    const messages = [
      { role: 'system', content: '你是一个网络流量分析专家。请基于提供的网络监控数据进行分析，用中文回答，给出清晰、有条理的分析结果。如果数据中有异常行为或安全风险，请特别指出。' },
      { role: 'user', content: `${context}\n\n---\n用户问题: ${prompt}` },
    ]
    return this.#callApi(messages)
  }

  // Quick summary
  async quickSummary(minutes = 60) {
    const context = this.#buildContext(minutes)
    const messages = [
      { role: 'system', content: '你是一个网络流量分析专家。请对网络监控数据做简明扼要的总结分析。' },
      { role: 'user', content: `${context}\n\n---\n请从以下角度分析：\n1. 整体网络使用概况\n2. 各设备的使用特征和偏好\n3. 发现的异常或值得关注的安全风险\n4. 建议的优化措施` },
    ]
    return this.#callApi(messages)
  }

  // Device-specific analysis
  async analyzeDevice(ip, minutes = 60) {
    const devices = getDeviceAnalytics(minutes)
    const device = devices.find(d => d.ip === ip)
    if (!device) return { text: `设备 ${ip} 未找到`, partial: false }

    const serviceList = device.services.map(s =>
      `- ${s.name} (${s.category}): ${s.visitCount}次访问, 时长${Math.round(s.duration / 60000)}分钟, 流量${fmtBytes(s.totalBytes)}, 域名: ${s.domains.join(', ')}`
    ).join('\n')

    const messages = [
      { role: 'system', content: '你是一个网络行为分析专家，请对单个设备的网络行为进行详细分析。' },
      { role: 'user', content: `设备: ${device.hostname || device.ip} (${device.ip}), MAC: ${device.mac}\n统计周期: 最近${minutes}分钟\n站点/APP数: ${device.siteCount}\n总访问次数: ${device.totalVisits}\n总流量: ${fmtBytes(device.totalBytes)}\n\n访问的服务:\n${serviceList}\n\n请分析：\n1. 该设备的使用模式和偏好\n2. 是否存在异常访问行为\n3. 可能的安全风险\n4. 使用时长是否合理` },
    ]
    return this.#callApi(messages)
  }

  // Security analysis
  async securityAnalysis(minutes = 60) {
    const context = this.#buildContext(minutes)
    const messages = [
      { role: 'system', content: '你是一个网络安全专家。请分析网络数据中的安全隐患。' },
      { role: 'user', content: `${context}\n\n---\n请重点关注：\n1. 是否有设备访问了可疑或高风险网站\n2. 是否存在异常的连接模式\n3. 是否有潜在的数据泄露风险\n4. 是否有设备可能被恶意软件感染\n5. 建议的安全加固措施` },
    ]
    return this.#callApi(messages)
  }

  // Check availability
  async checkAvailability() {
    const config = this.#getConfig()
    if (!config.apiKey) return { available: false, version: '', error: '未配置 API Key' }
    try {
      // Quick test with minimal request
      const resp = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(10000),
      })
      return { available: resp.ok, version: config.model, baseUrl: config.baseUrl }
    } catch (e) {
      return { available: false, version: config.model, error: e.message }
    }
  }
}

function fmtBytes(b) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

export const llmAnalyzer = new LlmAnalyzer()
