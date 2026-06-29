import axios from 'axios'
import { useUserStore } from '@/store/modules/user'

const api = axios.create({ baseURL: '/api', timeout: 10000 })

// Auth interceptor — attach token to every request
api.interceptors.request.use((config) => {
  const { accessToken } = useUserStore()
  if (accessToken) config.headers.set('Authorization', accessToken)
  return config
})

// Response interceptor — handle 401 with token refresh
let isRefreshing = false
let pendingQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retried) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingQueue.push((token: string) => {
            original.headers.set('Authorization', token)
            original._retried = true
            resolve(api(original))
          })
        })
      }

      original._retried = true
      isRefreshing = true

      try {
        const { refreshToken } = useUserStore()
        const res = await axios.post('/api/auth/refresh', { refreshToken })
        const { token, refreshToken: newRefresh } = res.data?.data || {}
        if (token) {
          const userStore = useUserStore()
          userStore.setToken(token, newRefresh)
          pendingQueue.forEach((cb) => cb(token))
          pendingQueue = []
          original.headers.set('Authorization', token)
          return api(original)
        }
      } catch {
        // refresh failed
      } finally {
        isRefreshing = false
      }

      useUserStore().logOut()
      return Promise.reject(error)
    }
    return Promise.reject(error)
  }
)

// Extract data from { code: 200, data: ... } wrapper
async function get(path: string, config?: Record<string, any>) {
  const res = await api.get(path, config)
  return res.data?.data ?? res.data
}

export const monitorApi = {
  getSystemOverview: () => get('/system/overview'),
  getCpuDetail: () => get('/system/cpu'),
  getTemperature: () => get('/system/temperature'),
  getMemoryDetail: () => get('/system/memory'),
  getSystemDisk: () => get('/system/disk'),
  getIpIntelList: (params?: Record<string, any>) => get('/ip-intel/list', { params }),
  getIpIntelStats: () => get('/ip-intel/stats'),
  getIpIntelGeo: () => get('/ip-intel/geo'),
  updateIpIntel: (ip: string, data: Record<string, any>) => api.put(`/ip-intel/${encodeURIComponent(ip)}`, data).then(r => r.data?.data ?? r.data),
  deleteIpIntel: (ip: string) => api.delete(`/ip-intel/${encodeURIComponent(ip)}`).then(r => r.data?.data ?? r.data),
  refreshIpIntel: () => api.post('/ip-intel/refresh').then(r => r.data?.data ?? r.data),
  getNetworkInterfaces: () => get('/network/interfaces'),
  getNetworkTraffic: () => get('/network/traffic'),
  getConnections: () => get('/network/connections'),
  getDevices: () => get('/network/devices'),
  getTopology: () => get('/topology'),
  getProtocolStats: () => get('/analysis/protocols'),
  getDnsQueries: () => get('/analysis/dns'),
  getTopDomains: () => get('/analysis/top-domains'),
  getThreats: () => get('/security/threats'),
  getRules: () => get('/security/rules'),
  getAlerts: (status?: string) => get(`/alerts${status ? `?status=${status}` : ''}`),
  getUnreadCount: () => get('/alerts/unread'),
  getUserTraffic: (minutes?: number) => get(`/user-traffic${minutes ? `?minutes=${minutes}` : ''}`),
  getUserTrafficByIp: (ip: string, minutes?: number) => get(`/user-traffic/ip?ip=${ip}${minutes ? `&minutes=${minutes}` : ''}`),
  getAccessRecords: (srcIp: string, minutes?: number) => get(`/access-records?srcIp=${srcIp}${minutes ? `&minutes=${minutes}` : ''}`),
  getDpiProtocols: () => get('/dpi/protocols'),
  getDpiStats: () => get('/dpi/stats'),
  getContentList: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)) })
    return get(`/content/list?${qs}`)
  },
  getContentDetail: (id: number) => get(`/content/detail?id=${id}`),
  getContentStats: (minutes?: number) => get(`/content/stats${minutes ? `?minutes=${minutes}` : ''}`),
  getContentRealtime: (limit?: number) => get(`/content/realtime?limit=${limit || 50}`),
  getCaptureStats: () => get('/content/capture-stats'),
  getCaptureConfig: () => get('/content/config'),
  updateCaptureConfig: (config: any) => api.put('/content/config', config).then(r => r.data?.data ?? r.data),
  cleanupContent: (params: { type?: string; before?: string }) => api.post('/content/cleanup', params).then(r => r.data?.data ?? r.data),
  getAnalyticsDevices: (minutes?: number) => get(`/analytics/devices${minutes ? `?minutes=${minutes}` : ''}`),
  getAnalyticsDevice: (ip: string, minutes?: number) => get(`/analytics/device?ip=${ip}${minutes ? `&minutes=${minutes}` : ''}`),
  getAnalyticsCategories: (minutes?: number) => get(`/analytics/categories${minutes ? `?minutes=${minutes}` : ''}`),
  getAnalyticsHourly: (minutes?: number) => get(`/analytics/hourly${minutes ? `?minutes=${minutes}` : ''}`),
  getAnalyticsTrend: (minutes?: number, window?: number) => get(`/analytics/trend?minutes=${minutes || 60}&window=${window || 10}`),
  getAnalyticsCrossDevice: (minutes?: number) => get(`/analytics/cross-device${minutes ? `?minutes=${minutes}` : ''}`),
  getAnalyticsReport: (minutes?: number) => get(`/analytics/report${minutes ? `?minutes=${minutes}` : ''}`),
  getLlmStatus: () => get('/llm/status'),
  getLlmSummary: (minutes?: number) => api.get(`/llm/summary${minutes ? `?minutes=${minutes}` : ''}`, { timeout: 120000 }).then(r => r.data?.data ?? r.data),
  getLlmSecurity: (minutes?: number) => api.get(`/llm/security${minutes ? `?minutes=${minutes}` : ''}`, { timeout: 120000 }).then(r => r.data?.data ?? r.data),
  getLlmDevice: (ip: string, minutes?: number) => api.get(`/llm/device?ip=${ip}${minutes ? `&minutes=${minutes}` : ''}`, { timeout: 120000 }).then(r => r.data?.data ?? r.data),
  llmAnalyze: (prompt: string, minutes?: number) => api.post('/llm/analyze', { prompt, minutes }, { timeout: 120000 }).then(r => r.data?.data ?? r.data),
}

export function createMonitorWebSocket(onMessage: (event: string, data: any) => void): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const { accessToken } = useUserStore()
  const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''
  const ws = new WebSocket(`${protocol}//${location.host}/ws${tokenParam}`)

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      onMessage(msg.event, msg.data)
    } catch {}
  }

  ws.onclose = () => {
    setTimeout(() => createMonitorWebSocket(onMessage), 3000)
  }

  return ws
}
