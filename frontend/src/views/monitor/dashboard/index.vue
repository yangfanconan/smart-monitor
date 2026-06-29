<template>
  <div class="monitor-dashboard" v-loading="!loaded" element-loading-text="加载监控数据...">
    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-left">
        <el-tag :type="wsConnected ? 'success' : 'danger'" size="small" effect="dark" round>
          <el-icon class="mr-1" :size="12"><Connection /></el-icon>
          {{ wsConnected ? '实时连接' : '已断开' }}
        </el-tag>
        <span class="device-name">Orange Pi 5 Plus</span>
      </div>
      <div class="status-right">
        <el-icon :size="14"><Timer /></el-icon>
        <span>运行 {{ formatUptime(system.uptime) }}</span>
        <el-button text size="small" @click="showEditDialog = true" style="margin-left: 8px">
          <el-icon :size="14"><Setting /></el-icon>
          布局
        </el-button>
      </div>
    </div>

    <!-- 概览卡片 -->
    <el-row :gutter="16" class="overview-cards" v-if="isVisible('overview')">
      <el-col :xs="12" :sm="6" v-for="card in overviewCards" :key="card.key">
        <div class="stat-card" :class="card.key">
          <div class="card-top">
            <div class="stat-icon" :style="{ background: card.gradient }">
              <el-icon :size="22"><component :is="card.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">
                <span class="num">{{ card.value }}</span>
                <span class="unit">{{ card.unit }}</span>
              </div>
              <div class="stat-label">{{ card.label }}</div>
            </div>
          </div>
          <el-progress :percentage="card.percent" :stroke-width="3" :show-text="false" :color="card.color" />
        </div>
      </el-col>
    </el-row>

    <!-- 图表行 -->
    <el-row :gutter="16" class="charts-row" v-if="isVisible('bandwidth') || isVisible('protocols')">
      <el-col :xs="24" :sm="14" v-if="isVisible('bandwidth')">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-hd">
              <span><el-icon class="mr-1"><Upload /></el-icon>实时带宽 ({{ uplinkName }})</span>
              <div class="speed-now">
                <span class="rx"><el-icon><Bottom /></el-icon> {{ fmtSpd(wanRx) }}</span>
                <span class="tx"><el-icon><Top /></el-icon> {{ fmtSpd(wanTx) }}</span>
              </div>
            </div>
          </template>
          <div ref="bwRef" style="height:260px" v-loading="!bwReady" element-loading-text="初始化图表..."></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="10" v-if="isVisible('protocols')">
        <el-card shadow="hover" class="chart-card">
          <template #header><span><el-icon class="mr-1"><PieChart /></el-icon>协议分布</span></template>
          <div ref="protoRef" style="height:260px" v-loading="!protoReady"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 设备 + 告警 -->
    <el-row :gutter="16" class="bottom-row" v-if="isVisible('devices') || isVisible('alerts')">
      <el-col :xs="24" :sm="12" v-if="isVisible('devices')">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-hd">
              <span><el-icon class="mr-1"><Monitor /></el-icon>在线设备</span>
              <el-tag size="small" type="success" effect="plain" round>{{ devices.length }} 台</el-tag>
            </div>
          </template>
          <el-table :data="devices" size="small" max-height="240" stripe :empty-text="'暂无设备'">
            <el-table-column prop="hostname" label="设备" min-width="100">
              <template #default="{ row }">
                <div class="device-cell">
                  <el-icon :size="14" color="#409eff"><Monitor /></el-icon>
                  <span>{{ row.hostname || row.ip }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="130" />
            <el-table-column prop="mac" label="MAC" width="155" />
            <el-table-column prop="source" label="来源" width="72">
              <template #default="{ row }">
                <el-tag size="small" :type="row.source === 'dhcp' ? 'success' : 'info'" effect="plain">{{ row.source }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" v-if="isVisible('alerts')">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-hd">
              <span><el-icon class="mr-1"><Bell /></el-icon>最新告警</span>
              <el-badge :value="unreadCount" :hidden="unreadCount === 0" :max="99" />
            </div>
          </template>
          <div class="alert-list" v-if="alerts.length">
            <div v-for="a in alerts.slice(0, 5)" :key="a.id" class="alert-item" :class="a.level">
              <div class="alert-dot"></div>
              <div class="alert-body">
                <div class="alert-title">{{ a.title }}</div>
                <div class="alert-msg">{{ a.message }}</div>
              </div>
              <div class="alert-time">{{ fmtTime(a.ts) }}</div>
            </div>
          </div>
          <el-empty v-else description="系统运行正常，暂无告警" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 温度 -->
    <el-row :gutter="16" v-if="isVisible('temperature')">
      <el-col :span="24">
        <el-card shadow="hover" class="chart-card">
          <template #header><span><el-icon class="mr-1"><Sunny /></el-icon>温度传感器</span></template>
          <div ref="tempRef" style="height:180px" v-loading="!tempReady"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 布局编辑对话框 -->
    <el-dialog v-model="showEditDialog" title="自定义布局" width="420px" :close-on-click-modal="true">
      <div class="widget-list">
        <div v-for="w in dashWidgets" :key="w.id" class="widget-item">
          <el-switch :model-value="w.enabled" @change="toggleWidget(w.id)" size="small" />
          <span class="widget-label">{{ w.label }}</span>
          <div class="widget-actions">
            <el-button text size="small" :disabled="w.row <= 0" @click="moveWidget(w.id, 'up')">
              <el-icon><Top /></el-icon>
            </el-button>
            <el-button text size="small" :disabled="w.row >= 5" @click="moveWidget(w.id, 'down')">
              <el-icon><Bottom /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button text type="info" @click="resetLayout">恢复默认</el-button>
        <el-button type="primary" @click="showEditDialog = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import { Cpu, Coin, Sunny, TrendCharts, Connection, Timer, Upload, Bottom, Top, PieChart, Monitor, Bell, Setting } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useMonitorStore } from '@/store/monitor'
import { useDashboardConfig } from './dashboard-config'

const { widgets: dashWidgets, isVisible, toggleWidget, moveWidget, resetLayout } = useDashboardConfig()
const showEditDialog = ref(false)

const store = useMonitorStore()
const { system, network, devices, protocols, alerts, unreadCount, wsConnected } = store

const loaded = ref(false)
const bwReady = ref(false)
const protoReady = ref(false)
const tempReady = ref(false)

const bwRef = ref<HTMLElement>()
const protoRef = ref<HTMLElement>()
const tempRef = ref<HTMLElement>()

let bwChart: echarts.ECharts | null = null
let protoChart: echarts.ECharts | null = null
let tempChart: echarts.ECharts | null = null
let bwHistory: { rx: number; tx: number }[] = []
let updateTimer: ReturnType<typeof setInterval> | null = null

const uplinkName = computed(() => network.summary?.uplink?.name || network.summary?.wan?.name || 'WAN')
const wanRx = computed(() => network.summary?.uplink?.rxSpeed || network.summary?.wan?.rxSpeed || 0)
const wanTx = computed(() => network.summary?.uplink?.txSpeed || network.summary?.wan?.txSpeed || 0)

const overviewCards = computed(() => {
  const cpu = system.cpu || 0
  const mem = system.memory?.usagePercent || 0
  const temps = system.temperature || []
  const temp = temps.length ? Math.max(...temps.map((t: any) => t.temp)) : 0
  const load = system.load?.load1 || 0
  return [
    { key: 'cpu', icon: markRaw(Cpu), label: 'CPU 使用率', value: cpu.toFixed(1), unit: '%', percent: cpu, color: cpu > 90 ? '#f56c6c' : cpu > 70 ? '#e6a23c' : '#409eff', gradient: 'linear-gradient(135deg,#409eff,#79bbff)' },
    { key: 'mem', icon: markRaw(Coin), label: '内存使用率', value: mem.toFixed(1), unit: '%', percent: mem, color: mem > 90 ? '#f56c6c' : mem > 70 ? '#e6a23c' : '#67c23a', gradient: 'linear-gradient(135deg,#67c23a,#95d475)' },
    { key: 'temp', icon: markRaw(Sunny), label: '最高温度', value: temp.toFixed(1), unit: '°C', percent: Math.min(temp, 100), color: temp > 80 ? '#f56c6c' : temp > 60 ? '#e6a23c' : '#e6a23c', gradient: 'linear-gradient(135deg,#e6a23c,#eebe77)' },
    { key: 'load', icon: markRaw(TrendCharts), label: '系统负载', value: load.toFixed(2), unit: '', percent: Math.min(load / 8 * 100, 100), color: load > 6 ? '#f56c6c' : load > 4 ? '#e6a23c' : '#f56c6c', gradient: 'linear-gradient(135deg,#f56c6c,#fab6b6)' }
  ]
})

function formatUptime(s: number) { if (!s) return '-'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}h ${m}m` }
function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function fmtB(b: number) { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB']; const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1)); return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i] }
function fmtSpd(b: number) { return fmtB(b) + '/s' }

function initBwChart() {
  if (!bwRef.value) return
  bwChart = echarts.init(bwRef.value)
  bwChart.setOption({
    tooltip: { trigger: 'axis', formatter: (p: any) => p.map((x: any) => `${x.seriesName}: ${fmtSpd(x.value)}`).join('<br/>') },
    legend: { data: ['下载', '上传'], bottom: 0, itemWidth: 16, itemHeight: 3, textStyle: { fontSize: 11 } },
    grid: { top: 12, right: 12, bottom: 30, left: 58 },
    xAxis: { type: 'category', show: false, data: [] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtSpd(v), fontSize: 10, color: '#909399' }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [
      { name: '下载', type: 'line', smooth: true, showSymbol: false, data: [], areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(64,158,255,0.25)' }, { offset: 1, color: 'rgba(64,158,255,0.02)' }]) }, lineStyle: { width: 2, color: '#409eff' }, itemStyle: { color: '#409eff' } },
      { name: '上传', type: 'line', smooth: true, showSymbol: false, data: [], areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(103,194,58,0.25)' }, { offset: 1, color: 'rgba(103,194,58,0.02)' }]) }, lineStyle: { width: 2, color: '#67c23a' }, itemStyle: { color: '#67c23a' } }
    ]
  })
  bwReady.value = true
}

function updateBw() {
  if (!bwChart) return
  const uplink = network.summary?.uplink || network.summary?.wan
  bwHistory.push({ rx: uplink?.rxSpeed || 0, tx: uplink?.txSpeed || 0 })
  if (bwHistory.length > 60) bwHistory.shift()
  bwChart.setOption({ xAxis: { data: bwHistory.map(() => '') }, series: [{ data: bwHistory.map(h => h.rx) }, { data: bwHistory.map(h => h.tx) }] })
}

function updateProto() {
  if (!protoRef.value) return
  if (!protoChart) protoChart = echarts.init(protoRef.value)
  const p = protocols.value?.protocols || []
  if (!p.length) return
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#b37feb', '#36cfc9', '#ff85c0']
  protoChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11 } },
    color: colors,
    series: [{ type: 'pie', radius: ['38%', '68%'], center: ['50%', '42%'], label: { formatter: '{b}\n{d}%', fontSize: 11, lineHeight: 16 }, emphasis: { scaleSize: 6 }, data: p.map((x: any) => ({ name: x.name.toUpperCase(), value: x.count })) }]
  })
  protoReady.value = true
}

function updateTemp() {
  if (!tempRef.value) return
  if (!tempChart) tempChart = echarts.init(tempRef.value)
  const t = system.temperature || []
  if (!t.length) return
  tempChart.setOption({
    tooltip: { trigger: 'axis', formatter: (p: any) => p.map((x: any) => `${x.name}: ${x.value}°C`).join('') },
    grid: { top: 12, right: 20, bottom: 28, left: 45 },
    xAxis: { type: 'category', data: t.map((x: any) => x.type.replace('-thermal', '')), axisLabel: { fontSize: 10, color: '#909399' } },
    yAxis: { type: 'value', min: (v: any) => Math.floor(Math.min(...t.map((x: any) => x.temp)) / 5) * 5 - 5, max: (v: any) => Math.ceil(Math.max(...t.map((x: any) => x.temp)) / 5) * 5 + 5, axisLabel: { formatter: '{value}°C', fontSize: 10, color: '#909399' }, splitLine: { lineStyle: { type: 'dashed', color: '#eee' } } },
    series: [{ type: 'bar', data: t.map((x: any) => ({ value: x.temp.toFixed(1), itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: x.temp > 80 ? '#f56c6c' : x.temp > 60 ? '#e6a23c' : '#67c23a' }, { offset: 1, color: x.temp > 80 ? '#fab6b6' : x.temp > 60 ? '#eebe77' : '#95d475' }]), borderRadius: [4, 4, 0, 0] } })), barWidth: '45%', label: { show: true, position: 'top', formatter: '{c}°C', fontSize: 10, color: '#606266' } }]
  })
  tempReady.value = true
}

onMounted(async () => {
  await store.fetchInitial()
  store.connectWebSocket()
  loaded.value = true
  await nextTick()
  initBwChart()
  updateProto()
  updateTemp()
  updateTimer = setInterval(updateBw, 2000)
})

onUnmounted(() => {
  if (updateTimer) { clearInterval(updateTimer); updateTimer = null }
  bwChart?.dispose(); bwChart = null
  protoChart?.dispose(); protoChart = null
  tempChart?.dispose(); tempChart = null
})

watch(() => protocols.value, updateProto, { deep: false })
watch(() => system.temperature, updateTemp, { deep: false })
</script>

<style scoped lang="scss">
.monitor-dashboard { padding: 16px; min-height: 100%; }

.status-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; padding: 8px 16px;
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  .status-left { display: flex; align-items: center; gap: 12px; }
  .device-name { font-weight: 600; font-size: 14px; }
  .status-right { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #909399; }
}

.overview-cards { margin-bottom: 16px; }

.stat-card {
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px; padding: 16px; transition: all 0.3s;
  &:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); }
  .card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .stat-icon {
    width: 42px; height: 42px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;
  }
  .stat-info { flex: 1; }
  .stat-value { display: flex; align-items: baseline; gap: 2px; }
  .num { font-size: 24px; font-weight: 700; line-height: 1.2; }
  .unit { font-size: 13px; color: #909399; }
  .stat-label { font-size: 12px; color: #909399; margin-top: 2px; }
}

.charts-row { margin-bottom: 16px; }
.bottom-row { margin-bottom: 16px; }

.chart-card {
  :deep(.el-card__header) {
    padding: 10px 16px; font-weight: 600; font-size: 13px;
    border-bottom: 1px solid var(--el-border-color-extra-light);
  }
}

.card-hd {
  display: flex; justify-content: space-between; align-items: center;
  span { display: flex; align-items: center; }
}

.speed-now {
  display: flex; gap: 16px; font-size: 13px; font-weight: 400;
  .rx { color: #409eff; display: flex; align-items: center; gap: 2px; }
  .tx { color: #67c23a; display: flex; align-items: center; gap: 2px; }
}

.device-cell { display: flex; align-items: center; gap: 6px; }

.alert-list { max-height: 240px; overflow-y: auto; }
.alert-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  &:last-child { border-bottom: none; }
  .alert-dot {
    width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
  }
  &.critical .alert-dot { background: #f56c6c; }
  &.warning .alert-dot { background: #e6a23c; }
  &.info .alert-dot { background: #909399; }
  .alert-body { flex: 1; min-width: 0; }
  .alert-title { font-size: 13px; font-weight: 500; }
  .alert-msg { font-size: 12px; color: #909399; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alert-time { font-size: 11px; color: #c0c4cc; flex-shrink: 0; }
}

.mr-1 { margin-right: 4px; }

.widget-list { display: flex; flex-direction: column; gap: 4px; }
.widget-item {
  display: flex; align-items: center; gap: 12px; padding: 8px 12px;
  border-radius: 6px; transition: background 0.2s;
  &:hover { background: var(--el-fill-color-light); }
  .widget-label { flex: 1; font-size: 14px; }
  .widget-actions { display: flex; gap: 2px; }
}
</style>
