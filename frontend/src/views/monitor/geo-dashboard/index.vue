<template>
  <div class="geo-dashboard">
    <div class="dashboard-header">
      <div class="header-title">
        <span class="title-icon">🌐</span>
        <span>全球网络流量态势</span>
      </div>
      <div class="header-stats">
        <div class="header-stat" v-for="s in headerStats" :key="s.label">
          <span class="hs-value">{{ s.value }}</span>
          <span class="hs-label">{{ s.label }}</span>
        </div>
      </div>
    </div>

    <div class="dashboard-body">
      <div class="map-container">
        <div ref="mapRef" class="map-chart"></div>
        <div class="map-overlay-title">REAL-TIME GLOBAL NETWORK</div>
      </div>

      <div class="side-panel">
        <div class="panel-section">
          <div class="panel-title">🏆 国家/地区流量 TOP 10</div>
          <div class="rank-list">
            <div class="rank-item" v-for="(item, idx) in countryRank" :key="item.country">
              <span class="rank-idx" :class="'top-' + (idx + 1)">{{ idx + 1 }}</span>
              <span class="rank-name">{{ item.country }}</span>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :style="{ width: item.pct + '%' }"></div>
              </div>
              <span class="rank-val">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-title">📱 应用/服务 TOP 10</div>
          <div class="rank-list">
            <div class="rank-item" v-for="(item, idx) in appRank" :key="item.app_name">
              <span class="rank-idx" :class="'top-' + (idx + 1)">{{ idx + 1 }}</span>
              <span class="rank-name">{{ item.app_name }}</span>
              <el-tag size="small" :type="catColor(item.category)" style="margin-left:4px">{{ item.category }}</el-tag>
              <span class="rank-val">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-title">📡 最近连接</div>
          <div class="recent-list">
            <div class="recent-item" v-for="item in recentItems" :key="item.ip">
              <span class="recent-ip">{{ item.ip }}</span>
              <span class="recent-info">{{ item.app_name || item.country || '未知' }}</span>
              <span class="recent-time">{{ fmtTime(item.last_seen) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import worldMapJson from '@/mock/json/worldMap.json'
import { monitorApi } from '@/api/monitor'

const mapRef = ref<HTMLElement>()
let mapChart: echarts.ECharts | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

const stats = ref<any>({})
const geoData = ref<any[]>([])

const headerStats = computed(() => [
  { label: 'IP 总数', value: stats.value.total || 0 },
  { label: '已识别', value: stats.value.withApp || 0 },
  { label: '国家/地区', value: (stats.value.countries || []).length },
  { label: '今日新增', value: stats.value.newToday || 0 },
])

const countryRank = computed(() => {
  const countries = stats.value.countries || []
  const max = countries[0]?.count || 1
  return countries.slice(0, 10).map((c: any) => ({ ...c, pct: Math.round(c.count / max * 100) }))
})

const appRank = computed(() => (stats.value.apps || []).slice(0, 10))

const recentItems = computed(() => {
  return [...geoData.value].sort((a: any, b: any) => (b.last_seen || 0) - (a.last_seen || 0)).slice(0, 15)
})

function catColor(cat: string) {
  const m: Record<string, string> = { '社交': 'success', '视频': 'danger', '搜索': 'warning', '电商': '', '邮件': 'info', '开发': '', '办公': 'warning', '云服务': '', 'CDN': 'info', '网站': '', '系统': 'info', '游戏': 'danger', '音乐': 'success', '金融': 'warning', 'IoT': 'info' }
  return (m[cat] || '') as any
}

function fmtTime(ts: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// Router location (approximate: China, Beijing)
const ROUTER_LAT = 39.9
const ROUTER_LNG = 116.4

function initMap() {
  if (!mapRef.value) return
  echarts.registerMap('world', worldMapJson as any)
  mapChart = echarts.init(mapRef.value, 'dark')

  window.addEventListener('resize', () => mapChart?.resize())
  updateMap()
}

function updateMap() {
  if (!mapChart) return
  const data = geoData.value.filter((d: any) => d.latitude && d.longitude)

  // Scatter points on map
  const scatterData = data.map((d: any) => ({
    name: d.app_name || d.ip,
    value: [d.longitude, d.latitude, d.query_count || 1],
    ip: d.ip,
    app: d.app_name,
    country: d.country,
    category: d.category
  }))

  // Connection lines from router to each IP
  const linesData = data.map((d: any) => ({
    coords: [[ROUTER_LNG, ROUTER_LAT], [d.longitude, d.latitude]],
    value: d.query_count || 1,
    ip: d.ip,
    app: d.app_name
  }))

  mapChart.setOption({
    backgroundColor: '#0a0e27',
    geo: {
      map: 'world',
      roam: true,
      zoom: 1.3,
      center: [40, 30],
      silent: false,
      itemStyle: {
        areaColor: '#1a2040',
        borderColor: '#2a3a6a',
        borderWidth: 0.5,
      },
      emphasis: {
        itemStyle: { areaColor: '#2a3a6a' },
        label: { show: false }
      },
      label: { show: false },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10, 14, 39, 0.9)',
      borderColor: '#409eff',
      textStyle: { color: '#e0e0e0', fontSize: 12 },
      formatter: (params: any) => {
        if (params.seriesType === 'effectScatter' || params.seriesType === 'scatter') {
          const d = params.data
          return `<b>${d.app || d.ip}</b><br/>IP: ${d.ip}<br/>国家: ${d.country || '未知'}<br/>查询: ${d.value?.[2] || 0} 次`
        }
        if (params.seriesType === 'lines') {
          return `→ ${params.data.app || params.data.ip}`
        }
        return ''
      }
    },
    series: [
      // Connection lines with trail effect
      {
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 1,
        effect: {
          show: true,
          period: 4,
          trailLength: 0.5,
          symbol: 'arrow',
          symbolSize: 5,
          color: '#409eff'
        },
        lineStyle: {
          color: (params: any) => {
            const cat = params.data?.category || ''
            const colorMap: Record<string, string> = { '社交': '#67c23a', '视频': '#f56c6c', '游戏': '#e6a23c', 'CDN': '#409eff' }
            return colorMap[cat] || 'rgba(64, 158, 255, 0.3)'
          },
          width: 1,
          opacity: 0.4,
          curveness: 0.2
        },
        data: linesData
      },
      // Ripple effect scatter at destinations
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 2,
        rippleEffect: { brushType: 'stroke', scale: 4, period: 3 },
        symbol: 'circle',
        symbolSize: (val: number[]) => Math.max(4, Math.min(15, Math.log2(val[2] + 1) * 3)),
        itemStyle: {
          color: (params: any) => {
            const cat = params.data?.category || ''
            const colorMap: Record<string, string> = { '社交': '#67c23a', '视频': '#f56c6c', '搜索': '#e6a23c', '电商': '#ff6b6b', 'CDN': '#409eff', '云服务': '#9b59b6' }
            return colorMap[cat] || '#409eff'
          },
          shadowBlur: 10,
          shadowColor: 'rgba(64, 158, 255, 0.5)'
        },
        data: scatterData
      },
      // Router location (center beacon)
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        rippleEffect: { brushType: 'fill', scale: 8, period: 2 },
        symbol: 'circle',
        symbolSize: 10,
        itemStyle: { color: '#00ff88', shadowBlur: 20, shadowColor: 'rgba(0, 255, 136, 0.8)' },
        data: [{ name: '路由器', value: [ROUTER_LNG, ROUTER_LAT, 0] }]
      }
    ]
  })
}

async function loadData() {
  try {
    const [st, geo] = await Promise.all([
      monitorApi.getIpIntelStats(),
      monitorApi.getIpIntelGeo()
    ])
    stats.value = st || {}
    geoData.value = geo || []
    updateMap()
  } catch {}
}

onMounted(async () => {
  await nextTick()
  initMap()
  await loadData()
  refreshTimer = setInterval(loadData, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  mapChart?.dispose()
})
</script>

<style scoped lang="scss">
.geo-dashboard {
  padding: 16px;
  background: #0a0e27;
  min-height: calc(100vh - 60px);
  color: #e0e0e0;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(26, 32, 64, 0.8), rgba(10, 14, 39, 0.9));
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
}

.header-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(90deg, #409eff, #00ff88);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  .title-icon { font-size: 24px; -webkit-text-fill-color: initial; }
}

.header-stats {
  display: flex;
  gap: 24px;
}

.header-stat {
  text-align: center;
  .hs-value { display: block; font-size: 22px; font-weight: 700; color: #409eff; }
  .hs-label { font-size: 11px; color: #8890a0; }
}

.dashboard-body {
  display: flex;
  gap: 16px;
  height: calc(100vh - 160px);
  min-height: 500px;
}

.map-container {
  flex: 1;
  position: relative;
  border: 1px solid rgba(64, 158, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  background: #0a0e27;
}

.map-chart {
  width: 100%;
  height: 100%;
}

.map-overlay-title {
  position: absolute;
  top: 12px;
  left: 16px;
  font-size: 11px;
  letter-spacing: 3px;
  color: rgba(64, 158, 255, 0.5);
  font-weight: 600;
  pointer-events: none;
}

.side-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.panel-section {
  background: linear-gradient(135deg, rgba(26, 32, 64, 0.6), rgba(10, 14, 39, 0.8));
  border: 1px solid rgba(64, 158, 255, 0.12);
  border-radius: 8px;
  padding: 12px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #b0b8d0;
}

.rank-list { display: flex; flex-direction: column; gap: 6px; }

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.rank-idx {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.06);
  color: #8890a0;
  &.top-1 { background: linear-gradient(135deg, #f5af19, #f12711); color: #fff; }
  &.top-2 { background: linear-gradient(135deg, #409eff, #2980b9); color: #fff; }
  &.top-3 { background: linear-gradient(135deg, #00ff88, #00b894); color: #0a0e27; }
}

.rank-name { flex: 0 0 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c0c8e0; }
.rank-bar-wrap { flex: 1; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden; }
.rank-bar { height: 100%; background: linear-gradient(90deg, #409eff, #00ff88); border-radius: 3px; transition: width 0.5s ease; }
.rank-val { flex: 0 0 36px; text-align: right; font-weight: 600; color: #409eff; font-size: 11px; }

.recent-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }

.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.recent-ip { font-family: monospace; color: #409eff; flex: 0 0 120px; }
.recent-info { flex: 1; color: #8890a0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-time { color: #5a6080; font-size: 10px; }

@media (max-width: 768px) {
  .dashboard-body { flex-direction: column; height: auto; }
  .map-container { height: 400px; }
  .side-panel { width: 100%; }
  .header-stats { gap: 12px; }
}
</style>
