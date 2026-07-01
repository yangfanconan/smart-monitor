<template>
  <div class="device-activity-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h3>设备活动</h3>
        <p class="page-desc">查看设备在线状态、活动时段和访问的应用</p>
      </div>
      <div class="header-actions">
        <el-radio-group v-model="timeRange" size="small" @change="onTimeRangeChange">
          <el-radio-button :value="6">6h</el-radio-button>
          <el-radio-button :value="24">24h</el-radio-button>
          <el-radio-button :value="72">3天</el-radio-button>
          <el-radio-button :value="168">7天</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" circle size="small" @click="refresh" :loading="loading" style="margin-left: 8px" />
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row" v-if="devices.length">
      <div class="stat-item">
        <div class="stat-icon" style="background: linear-gradient(135deg, #409eff, #79bbff)">
          <el-icon :size="20"><Monitor /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-val">{{ devices.length }}</div>
          <div class="stat-lbl">总设备</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background: linear-gradient(135deg, #67c23a, #95d475)">
          <el-icon :size="20"><CircleCheck /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-val" style="color: #67c23a">{{ devices.filter(d => d.online).length }}</div>
          <div class="stat-lbl">当前在线</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background: linear-gradient(135deg, #e6a23c, #f3d19e)">
          <el-icon :size="20"><Connection /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-val" style="color: #e6a23c">{{ fmtBytes(totalTraffic) }}</div>
          <div class="stat-lbl">总流量</div>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="main-content">
      <!-- Device list -->
      <div class="device-panel">
        <div class="panel-hd">
          <span class="panel-title">设备列表</span>
          <el-input v-model="searchText" placeholder="搜索..." size="small" style="width: 140px" :prefix-icon="Search" clearable />
        </div>
        <div class="device-list">
          <div v-for="d in filteredDevices" :key="d.ip"
            class="device-item" :class="{ active: selectedDevice?.ip === d.ip }"
            @click="selectDevice(d)">
            <div class="device-avatar" :style="{ background: deviceColor(d.ip) }">
              {{ (d.hostname || d.ip).charAt(0).toUpperCase() }}
            </div>
            <div class="device-info">
              <div class="device-name">
                {{ d.hostname || d.ip }}
                <span :class="['dot', d.online ? 'on' : 'off']"></span>
              </div>
              <div class="device-meta">
                <span v-if="d.hostname" class="device-ip">{{ d.ip }}</span>
                <span class="device-traffic">{{ fmtBytes(d.totalRx + d.totalTx) }}</span>
              </div>
            </div>
          </div>
          <div v-if="!filteredDevices.length" class="empty-hint">无匹配设备</div>
        </div>
      </div>

      <!-- Detail panel -->
      <div class="detail-panel" v-if="selectedDevice">
        <!-- Device header -->
        <div class="detail-hd">
          <div class="detail-avatar" :style="{ background: deviceColor(selectedDevice.ip) }">
            {{ (selectedDevice.hostname || selectedDevice.ip).charAt(0).toUpperCase() }}
          </div>
          <div class="detail-title">
            <h4>{{ selectedDevice.hostname || selectedDevice.ip }}</h4>
            <div class="detail-meta">
              <span>{{ selectedDevice.ip }}</span>
              <span class="sep">·</span>
              <span>{{ selectedDevice.mac || '未知 MAC' }}</span>
              <span class="sep">·</span>
              <span :class="selectedDevice.online ? 'text-success' : 'text-muted'">
                {{ selectedDevice.online ? '在线' : '离线' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Visual timeline bar -->
        <div class="timeline-section" v-if="timeline" v-loading="timelineLoading">
          <div class="section-title">活动时间线</div>
          <div class="timeline-bar-wrap">
            <div class="timeline-hours">
              <span v-for="h in hourLabels" :key="h" class="hour-label">{{ h }}</span>
            </div>
            <div class="timeline-bar">
              <div v-for="(seg, i) in timelineSegments" :key="i"
                class="timeline-seg"
                :style="seg.style"
                :title="seg.tooltip">
              </div>
            </div>
          </div>
          <div class="timeline-stats">
            <span>{{ timeline.totalSessions }} 次上线</span>
            <span>共 {{ fmtDuration(timeline.totalOnlineTime) }}</span>
          </div>

          <!-- Session list -->
          <div class="session-list" v-if="timeline.sessions?.length">
            <div v-for="(s, i) in timeline.sessions" :key="i" class="session-item">
              <div class="session-dot"></div>
              <div class="session-line" v-if="i < timeline.sessions.length - 1"></div>
              <div class="session-body" @click="s.expanded = !s.expanded">
                <div class="session-top">
                  <span class="session-time">{{ fmtDateTime(s.start) }} — {{ fmtDateTime(s.end) }}</span>
                  <div class="session-tags">
                    <span class="stag dur">{{ fmtDuration(s.duration) }}</span>
                    <span class="stag traffic">{{ fmtBytes(s.totalRx + s.totalTx) }}</span>
                    <span class="stag apps">{{ (s.apps || []).length }} 应用</span>
                  </div>
                </div>
                <!-- App bars -->
                <div class="session-app-bars" v-if="s.expanded && s.apps?.length">
                  <div v-for="app in (s.apps || []).slice(0, 8)" :key="app.name" class="app-bar-row">
                    <span class="app-bar-name">{{ app.name }}</span>
                    <div class="app-bar-track">
                      <div class="app-bar-fill" :style="{ width: appBarWidth(app.totalBytes, s.apps), background: appColor(app.name) }"></div>
                    </div>
                    <span class="app-bar-val">{{ fmtBytes(app.totalBytes) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无活动记录" :image-size="50" />

          <!-- App summary -->
          <div class="app-summary" v-if="timeline.apps?.length">
            <div class="section-title">应用访问排行</div>
            <div class="app-rank-list">
              <div v-for="(app, idx) in timeline.apps.slice(0, 12)" :key="app.name" class="app-rank-row">
                <span class="rank-num" :class="'rank-' + (idx < 3 ? idx : 'other')">{{ idx + 1 }}</span>
                <span class="app-rank-name">{{ app.name }}</span>
                <div class="app-rank-bar-track">
                  <div class="app-rank-bar-fill" :style="{ width: appRankWidth(app.totalBytes), background: appColor(app.name) }"></div>
                </div>
                <span class="app-rank-val">{{ fmtBytes(app.totalBytes) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div class="detail-panel empty-detail" v-else>
        <el-empty description="选择一个设备查看详情" :image-size="80" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh, Search, Monitor, CircleCheck, Connection } from '@element-plus/icons-vue'
import { monitorApi } from '@/api/monitor'

const loading = ref(false)
const timelineLoading = ref(false)
const devices = ref<any[]>([])
const selectedDevice = ref<any>(null)
const timeline = ref<any>(null)
const timeRange = ref(24)
const searchText = ref('')

const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#9b59b6', '#1abc9c', '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#8e44ad']

function deviceColor(ip: string) {
  let h = 0
  for (let i = 0; i < ip.length; i++) h = ((h << 5) - h + ip.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

function appColor(name: string) {
  const map: Record<string, string> = {
    '微信': '#07c160', 'QQ': '#12b7f5', '抖音': '#161823', 'B站': '#fb7299',
    '淘宝': '#ff5000', '京东': '#e2231a', '百度': '#2932e1', '飞书': '#3370ff',
    '钉钉': '#3296fa', '小红书': '#fe2c55', 'GitHub': '#24292e', 'Google': '#4285f4',
    'Apple': '#555', 'Microsoft': '#00a4ef', '阿里云': '#ff6a00', '腾讯云': '#0052d9',
  }
  return map[name] || colors[name.length % colors.length]
}

const filteredDevices = computed(() => {
  if (!searchText.value) return devices.value
  const q = searchText.value.toLowerCase()
  return devices.value.filter(d =>
    (d.hostname || '').toLowerCase().includes(q) ||
    d.ip.includes(q) || (d.mac || '').toLowerCase().includes(q)
  )
})

const totalTraffic = computed(() => devices.value.reduce((s, d) => s + d.totalRx + d.totalTx, 0))

const hourLabels = computed(() => {
  const now = new Date()
  const labels = []
  for (let i = 0; i < 24; i++) {
    const h = (now.getHours() - 23 + i + 24) % 24
    labels.push(i % 3 === 0 ? `${h}:00` : '')
  }
  return labels
})

const timelineSegments = computed(() => {
  if (!timeline.value?.sessions?.length) return []
  const now = Date.now()
  const startTime = now - timeRange.value * 3600000
  const totalMs = now - startTime
  const segs = []
  for (const s of timeline.value.sessions) {
    const left = Math.max(0, ((s.start - startTime) / totalMs) * 100)
    const width = Math.max(0.3, ((Math.min(s.end, now) - s.start) / totalMs) * 100)
    segs.push({
      style: { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` },
      tooltip: `${fmtDateTime(s.start)} — ${fmtDateTime(s.end)} (${fmtDuration(s.duration)})`,
    })
  }
  return segs
})

function appBarWidth(bytes: number, apps: any[]) {
  const max = Math.max(...apps.map((a: any) => a.totalBytes))
  return max > 0 ? `${(bytes / max) * 100}%` : '0%'
}

function appRankWidth(bytes: number) {
  if (!timeline.value?.apps?.length) return '0%'
  const max = timeline.value.apps[0]?.totalBytes || 1
  return `${(bytes / max) * 100}%`
}

async function refresh() {
  loading.value = true
  try {
    devices.value = await monitorApi.getDeviceActivityDevices() as any
    if (selectedDevice.value) await loadTimeline(selectedDevice.value.ip)
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

function onTimeRangeChange() {
  if (selectedDevice.value) loadTimeline(selectedDevice.value.ip)
}

async function selectDevice(d: any) {
  selectedDevice.value = d
  await loadTimeline(d.ip)
}

async function loadTimeline(ip: string) {
  timelineLoading.value = true
  try {
    const data = await monitorApi.getDeviceActivityTimeline(ip, timeRange.value) as any
    if (data?.sessions) data.sessions.forEach((s: any) => { s.expanded = false })
    timeline.value = data
  } catch (e) { console.error(e); timeline.value = null }
  finally { timelineLoading.value = false }
}

function fmtBytes(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

function fmtDuration(ms: number) {
  if (ms < 60000) return '<1分钟'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}分钟`
  return `${Math.floor(m / 60)}小时${m % 60}分钟`
}

onMounted(() => refresh())
</script>

<style scoped lang="scss">
.device-activity-page { padding: 20px; min-height: 100%; }

.page-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;
  h3 { margin: 0; font-size: 18px; font-weight: 600; }
  .page-desc { margin: 4px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }
  .header-actions { display: flex; align-items: center; }
}

.stats-row {
  display: flex; gap: 16px; margin-bottom: 20px;
  .stat-item {
    flex: 1; display: flex; align-items: center; gap: 14px;
    background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px; padding: 16px 20px;
    .stat-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff;
    }
    .stat-val { font-size: 24px; font-weight: 700; line-height: 1.2; }
    .stat-lbl { font-size: 12px; color: var(--el-text-color-secondary); }
  }
}

.main-content { display: flex; gap: 16px; min-height: 600px; }

/* Device panel */
.device-panel {
  width: 280px; min-width: 280px;
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
  .panel-hd {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; border-bottom: 1px solid var(--el-border-color-lighter);
    .panel-title { font-weight: 600; font-size: 14px; }
  }
  .device-list { overflow-y: auto; max-height: calc(100vh - 320px); padding: 8px; }
}

.device-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  border-radius: 10px; cursor: pointer; transition: all 0.2s;
  &:hover { background: var(--el-fill-color-light); }
  &.active { background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-5); }
  .device-avatar {
    width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 15px; flex-shrink: 0;
  }
  .device-info { flex: 1; min-width: 0; }
  .device-name {
    font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .device-meta { font-size: 11px; color: var(--el-text-color-secondary); display: flex; gap: 6px; margin-top: 2px; }
  .device-ip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .device-traffic { flex-shrink: 0; }
}

.dot {
  width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0;
  &.on { background: #67c23a; box-shadow: 0 0 6px rgba(103, 194, 58, 0.5); }
  &.off { background: #dcdfe6; }
}

.empty-hint { text-align: center; padding: 30px; color: var(--el-text-color-secondary); font-size: 13px; }

/* Detail panel */
.detail-panel {
  flex: 1; background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px; overflow: hidden; overflow-y: auto; max-height: calc(100vh - 260px);
  &.empty-detail { display: flex; align-items: center; justify-content: center; }
}

.detail-hd {
  display: flex; align-items: center; gap: 16px; padding: 20px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  .detail-avatar {
    width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 20px;
  }
  .detail-title {
    h4 { margin: 0; font-size: 16px; font-weight: 600; }
    .detail-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; display: flex; gap: 6px; align-items: center; }
    .sep { color: var(--el-border-color); }
    .text-success { color: #67c23a; }
  }
}

.timeline-section { padding: 20px 24px; }

.section-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; }

/* Timeline bar */
.timeline-bar-wrap { margin-bottom: 12px; }
.timeline-hours {
  display: flex; justify-content: space-between; margin-bottom: 4px;
  .hour-label { font-size: 10px; color: var(--el-text-color-placeholder); width: calc(100% / 8); text-align: left; }
}
.timeline-bar {
  height: 28px; background: var(--el-fill-color); border-radius: 6px; position: relative; overflow: hidden;
  .timeline-seg {
    position: absolute; top: 3px; bottom: 3px; border-radius: 4px;
    background: linear-gradient(90deg, #409eff, #79bbff);
    min-width: 3px; transition: opacity 0.2s;
    &:hover { opacity: 0.8; }
  }
}
.timeline-stats {
  display: flex; gap: 16px; font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 20px;
}

/* Session list */
.session-list { position: relative; }
.session-item {
  display: flex; gap: 12px; position: relative; padding-bottom: 12px;
  .session-dot {
    width: 10px; height: 10px; border-radius: 50%; background: #409eff; margin-top: 6px; flex-shrink: 0; z-index: 1;
    box-shadow: 0 0 0 3px var(--el-bg-color);
  }
  .session-line {
    position: absolute; left: 4px; top: 16px; bottom: 0; width: 2px; background: var(--el-border-color-lighter);
  }
  .session-body {
    flex: 1; background: var(--el-fill-color-lighter); border-radius: 10px; padding: 12px 16px;
    cursor: pointer; transition: background 0.2s;
    &:hover { background: var(--el-fill-color); }
  }
}

.session-top { display: flex; justify-content: space-between; align-items: center; }
.session-time { font-size: 13px; font-weight: 500; }
.session-tags { display: flex; gap: 6px; }
.stag {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  &.dur { background: #409eff15; color: #409eff; }
  &.traffic { background: #67c23a15; color: #67c23a; }
  &.apps { background: #e6a23c15; color: #e6a23c; }
}

/* App bars in session */
.session-app-bars { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--el-border-color-lighter); }
.app-bar-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  .app-bar-name { font-size: 12px; width: 60px; flex-shrink: 0; font-weight: 500; }
  .app-bar-track { flex: 1; height: 14px; background: var(--el-fill-color); border-radius: 7px; overflow: hidden; }
  .app-bar-fill { height: 100%; border-radius: 7px; transition: width 0.3s; min-width: 2px; }
  .app-bar-val { font-size: 11px; color: var(--el-text-color-secondary); width: 60px; text-align: right; flex-shrink: 0; }
}

/* App rank */
.app-summary { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--el-border-color-lighter); }
.app-rank-list { }
.app-rank-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  .rank-num {
    width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
    &.rank-0 { background: #f56c6c; color: #fff; }
    &.rank-1 { background: #e6a23c; color: #fff; }
    &.rank-2 { background: #409eff; color: #fff; }
    &.rank-other { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
  }
  .app-rank-name { font-size: 13px; width: 70px; flex-shrink: 0; font-weight: 500; }
  .app-rank-bar-track { flex: 1; height: 16px; background: var(--el-fill-color); border-radius: 8px; overflow: hidden; }
  .app-rank-bar-fill { height: 100%; border-radius: 8px; transition: width 0.3s; min-width: 2px; }
  .app-rank-val { font-size: 12px; color: var(--el-text-color-secondary); width: 65px; text-align: right; flex-shrink: 0; }
}

@media (max-width: 768px) {
  .main-content { flex-direction: column; }
  .device-panel { width: 100%; min-width: 0; }
  .stats-row { flex-wrap: wrap; }
  .stat-item { min-width: calc(50% - 8px); }
}
</style>
