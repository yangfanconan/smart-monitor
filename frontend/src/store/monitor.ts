import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { monitorApi } from '@/api/monitor'
import { useUserStore } from '@/store/modules/user'

export const useMonitorStore = defineStore('monitor', () => {
  const system = reactive<any>({ cpu: 0, memory: {}, load: {}, temperature: [], uptime: 0 })
  const network = reactive<any>({ interfaces: [], summary: {} })
  const connections = ref<any[]>([])
  const devices = ref<any[]>([])
  const protocols = ref<any>({ total: 0, protocols: [], topPorts: [] })
  const threats = ref<any[]>([])
  const alerts = ref<any[]>([])
  const unreadCount = ref(0)
  const wsConnected = ref(false)

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchInitial() {
    try {
      const [sys, net, conn, dev, proto, thr, alertData, unread] = await Promise.all([
        monitorApi.getSystemOverview(),
        monitorApi.getNetworkInterfaces(),
        monitorApi.getConnections(),
        monitorApi.getDevices(),
        monitorApi.getProtocolStats(),
        monitorApi.getThreats(),
        monitorApi.getAlerts(),
        monitorApi.getUnreadCount(),
      ])
      Object.assign(system, sys)
      Object.assign(network, net)
      connections.value = conn.list || conn
      devices.value = dev
      protocols.value = proto
      threats.value = thr
      alerts.value = alertData
      unreadCount.value = unread.count
    } catch (e) { console.error('Fetch initial data failed:', e) }
  }

  function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const { accessToken } = useUserStore()
    const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''
    ws = new WebSocket(`${protocol}//${location.host}/ws${tokenParam}`)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        wsConnected.value = true
        switch (msg.event) {
          case 'init':
            Object.assign(system, msg.data.system || {})
            Object.assign(network, msg.data.network || {})
            connections.value = msg.data.connections || []
            devices.value = msg.data.devices || []
            break
          case 'system:update':
            Object.assign(system, msg.data)
            break
          case 'network:update':
            Object.assign(network, msg.data)
            break
          case 'connection:update':
            connections.value = msg.data
            break
          case 'alert:new':
            if (msg.data) { alerts.value.unshift(msg.data); unreadCount.value++ }
            break
          case 'threat:detected':
            if (msg.data) threats.value.unshift(msg.data)
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      wsConnected.value = false
      ws = null
      // Reconnect with backoff, only if not already scheduled
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connectWebSocket()
        }, 5000)
      }
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { ws.onclose = null; ws.close(); ws = null }
    wsConnected.value = false
  }

  return { system, network, connections, devices, protocols, threats, alerts, unreadCount, wsConnected, fetchInitial, connectWebSocket, disconnect }
})
