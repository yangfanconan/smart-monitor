import type { AppRouteRecord } from '@/types/router'

export const monitorRoutes: AppRouteRecord = {
  name: 'Monitor',
  path: '/monitor',
  component: '/index/index',
  meta: {
    title: '智能监控',
    icon: 'ri:monitor-line',
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'dashboard',
      name: 'MonitorDashboard',
      component: '/monitor/dashboard/index',
      meta: { title: '监控总览', icon: 'ri:dashboard-line', keepAlive: false, fixedTab: true }
    },
    {
      path: 'system',
      name: 'MonitorSystem',
      component: '/monitor/system/index',
      meta: { title: '系统详情', icon: 'ri:cpu-line', keepAlive: true }
    },
    {
      path: 'network',
      name: 'MonitorNetwork',
      component: '/monitor/network/index',
      meta: { title: '网络流量', icon: 'ri:network-line', keepAlive: true }
    },
    {
      path: 'connections',
      name: 'MonitorConnections',
      component: '/monitor/analysis/index',
      meta: { title: '连接分析', icon: 'ri:links-line', keepAlive: true }
    },
    {
      path: 'user-traffic',
      name: 'MonitorUserTraffic',
      component: '/monitor/user-traffic/index',
      meta: { title: '用户流量', icon: 'ri:bar-chart-box-line', keepAlive: true }
    },
    {
      path: 'access-records',
      name: 'MonitorAccessRecords',
      component: '/monitor/access-records/index',
      meta: { title: '访问记录', icon: 'ri:history-line', keepAlive: true }
    },
    {
      path: 'security',
      name: 'MonitorSecurity',
      component: '/monitor/security/index',
      meta: { title: '安全中心', icon: 'ri:shield-check-line', keepAlive: true }
    },
    {
      path: 'alerts',
      name: 'MonitorAlerts',
      component: '/monitor/alerts/index',
      meta: { title: '告警中心', icon: 'ri:alert-line', keepAlive: true }
    },
    {
      path: 'user-analytics',
      name: 'MonitorUserAnalytics',
      component: '/monitor/user-analytics/index',
      meta: { title: '行为分析', icon: 'ri:user-search-line', keepAlive: true }
    },
    {
      path: 'content-inspection',
      name: 'MonitorContentInspection',
      component: '/monitor/content-inspection/index',
      meta: { title: '报文检测', icon: 'ri:radar-line', keepAlive: true }
    },
    {
      path: 'content-management',
      name: 'MonitorContentManagement',
      component: '/monitor/content-management/index',
      meta: { title: '数据管理', icon: 'ri:database-2-line', keepAlive: true }
    },
    {
      path: 'ip-intelligence',
      name: 'MonitorIpIntel',
      component: '/monitor/ip-intelligence/index',
      meta: { title: 'IP 情报库', icon: 'ri:global-line', keepAlive: true }
    },
    {
      path: 'geo-dashboard',
      name: 'MonitorGeoDashboard',
      component: '/monitor/geo-dashboard/index',
      meta: { title: '全球流量面板', icon: 'ri:earth-line', keepAlive: true }
    },
    {
      path: 'topology',
      name: 'MonitorTopology',
      component: '/monitor/topology/index',
      meta: { title: '网络拓扑', icon: 'ri:node-tree', keepAlive: true }
    },
    {
      path: 'device-activity',
      name: 'MonitorDeviceActivity',
      component: '/monitor/device-activity/index',
      meta: { title: '设备活动', icon: 'ri:device-line', keepAlive: true }
    }
  ]
}
