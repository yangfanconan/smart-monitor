<template>
  <div class="user-analytics">
    <!-- Header -->
    <el-row :gutter="16" class="mb-16">
      <el-col :xs="24" :sm="12">
        <div class="page-title">
          <el-icon :size="22"><DataAnalysis /></el-icon>
          <span>用户行为分析</span>
          <el-tag v-if="llmAvailable" type="success" size="small" effect="dark" style="margin-left: 8px">AI 已就绪</el-tag>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" style="text-align: right">
        <el-radio-group v-model="timeRange" size="small" @change="loadData" style="margin-right: 8px">
          <el-radio-button :value="30">30分钟</el-radio-button>
          <el-radio-button :value="60">1小时</el-radio-button>
          <el-radio-button :value="360">6小时</el-radio-button>
          <el-radio-button :value="1440">24小时</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportReport" :loading="exporting"><el-icon><Download /></el-icon> 导出报告</el-button>
      </el-col>
    </el-row>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" type="border-card" class="main-tabs">
      <!-- Tab 1: 设备概览 -->
      <el-tab-pane label="设备概览" name="overview">
        <el-row :gutter="12" class="mb-16" v-if="categories.length">
          <el-col :xs="8" :sm="4" v-for="cat in categories.slice(0, 6)" :key="cat.category">
            <div class="cat-card">
              <div class="cat-icon">{{ catIcon(cat.category) }}</div>
              <div class="cat-name">{{ cat.category }}</div>
              <div class="cat-count">{{ cat.visitCount }} 次</div>
              <div class="cat-devices">{{ cat.deviceCount }} 台设备</div>
            </div>
          </el-col>
        </el-row>
        <el-card shadow="never">
          <template #header>
            <div class="card-hd">
              <span>设备列表 ({{ devices.length }} 台)</span>
              <el-input v-model="deviceFilter" placeholder="搜索设备名/IP" size="small" style="width: 200px" clearable prefix-icon="Search" />
            </div>
          </template>
          <el-table :data="filteredDevices" size="small" stripe v-loading="loading" @row-click="selectDevice" highlight-current-row style="cursor: pointer">
            <el-table-column label="设备" min-width="180">
              <template #default="{ row }">
                <div class="device-cell">
                  <el-icon :size="16" color="#409eff"><Monitor /></el-icon>
                  <div><div class="device-name">{{ row.hostname || row.ip }}</div><div class="device-ip">{{ row.ip }}</div></div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="siteCount" label="站点/APP" width="100" sortable align="center">
              <template #default="{ row }"><span class="num-cell">{{ row.siteCount }}</span></template>
            </el-table-column>
            <el-table-column prop="totalVisits" label="访问次数" width="100" sortable align="center">
              <template #default="{ row }"><span class="num-cell highlight">{{ row.totalVisits }}</span></template>
            </el-table-column>
            <el-table-column label="流量" width="100" align="center">
              <template #default="{ row }">{{ fmtSize(row.totalBytes) }}</template>
            </el-table-column>
            <el-table-column label="Top 3 应用/站点" min-width="280">
              <template #default="{ row }">
                <el-tag v-for="s in row.services?.slice(0, 3)" :key="s.name" size="small" :type="catTagColor(s.category)" style="margin: 1px 3px" effect="plain">
                  {{ s.name }} <span style="opacity: 0.6">{{ s.visitCount }}</span>
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click.stop="viewDevicePackets(row)">报文</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- Tab 2: 跨设备分析 -->
      <el-tab-pane label="跨设备分析" name="cross">
        <el-card shadow="never">
          <template #header><span>跨设备共用服务 (同一服务被多台设备使用)</span></template>
          <el-table :data="crossDeviceData.filter(s => s.devices.length > 1)" size="small" stripe v-loading="loadingCross">
            <el-table-column prop="name" label="服务/站点" width="160">
              <template #default="{ row }"><b>{{ row.name }}</b></template>
            </el-table-column>
            <el-table-column prop="category" label="分类" width="80">
              <template #default="{ row }"><el-tag :type="catTagColor(row.category)" size="small">{{ row.category }}</el-tag></template>
            </el-table-column>
            <el-table-column label="设备数" width="80" align="center">
              <template #default="{ row }"><span class="num-cell highlight">{{ row.devices.length }}</span></template>
            </el-table-column>
            <el-table-column prop="totalVisits" label="总访问" width="90" sortable align="center" />
            <el-table-column label="设备明细" min-width="350">
              <template #default="{ row }">
                <el-tag v-for="d in row.devices" :key="d.ip" size="small" effect="plain" style="margin: 1px 3px">
                  {{ d.hostname || d.ip }} ({{ d.visits }}次)
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- Tab 3: AI 智能分析 -->
      <el-tab-pane name="ai">
        <template #label>
          <span>🤖 AI 智能分析</span>
          <el-tag v-if="!llmAvailable" type="danger" size="small" style="margin-left: 4px">不可用</el-tag>
        </template>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-card shadow="never" class="mb-16">
              <template #header><span>快捷分析</span></template>
              <el-space direction="vertical" fill style="width: 100%">
                <el-button style="width: 100%" @click="runLlm('summary')" :loading="llmLoading" :disabled="!llmAvailable">
                  📊 生成综合分析报告
                </el-button>
                <el-button style="width: 100%" @click="runLlm('security')" :loading="llmLoading" :disabled="!llmAvailable">
                  🛡️ 安全风险评估
                </el-button>
                <el-button style="width: 100%" @click="runLlm('device', selectedDeviceForLlm)" :loading="llmLoading" :disabled="!llmAvailable || !selectedDeviceForLlm">
                  📱 分析选中设备
                </el-button>
                <el-select v-model="selectedDeviceForLlm" size="small" placeholder="选择设备" style="width: 100%">
                  <el-option v-for="d in devices" :key="d.ip" :label="(d.hostname || d.ip)" :value="d.ip" />
                </el-select>
              </el-space>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="16">
            <el-card shadow="never">
              <template #header><span>AI 分析结果</span>
                <el-button v-if="llmResult" size="small" @click="copyLlmResult" style="margin-left: auto">复制</el-button>
              </template>
              <div v-if="llmLoading" class="llm-loading">
                <el-icon class="is-loading" :size="24"><Loading /></el-icon>
                <span>AI 正在分析网络数据，请稍候...</span>
              </div>
              <div v-else-if="llmResult" class="llm-result" v-html="renderMarkdown(llmResult)"></div>
              <el-empty v-else description="选择左侧快捷分析或输入自定义问题" />
              <el-divider v-if="!llmLoading" style="margin: 12px 0" />
              <div style="display: flex; gap: 8px">
                <el-input v-model="customPrompt" placeholder="输入自定义分析问题..." @keyup.enter="runCustomAnalysis" :disabled="!llmAvailable" />
                <el-button type="primary" @click="runCustomAnalysis" :loading="llmLoading" :disabled="!llmAvailable || !customPrompt.trim()">提问</el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <!-- Device detail dialog -->
    <el-dialog v-model="detailVisible" :title="selectedDevice ? `${selectedDevice.hostname || selectedDevice.ip} — 行为详情` : ''" width="1000px" destroy-on-close top="3vh">
      <div v-if="selectedDevice" class="device-detail">
        <el-row :gutter="12" class="mb-16">
          <el-col :span="6"><div class="detail-stat"><div class="val">{{ selectedDevice.siteCount }}</div><div class="lbl">站点/APP</div></div></el-col>
          <el-col :span="6"><div class="detail-stat"><div class="val">{{ selectedDevice.totalVisits }}</div><div class="lbl">总访问次数</div></div></el-col>
          <el-col :span="6"><div class="detail-stat"><div class="val">{{ fmtSize(selectedDevice.totalBytes) }}</div><div class="lbl">总流量</div></div></el-col>
          <el-col :span="6"><div class="detail-stat"><div class="val">{{ fmtDuration(selectedDevice.lastActivity - selectedDevice.firstActivity) }}</div><div class="lbl">活跃时长</div></div></el-col>
        </el-row>
        <div ref="chartRef" style="height: 250px" class="mb-16"></div>
        <div class="section-title">访问详情</div>
        <el-table :data="selectedDevice.services" size="small" stripe max-height="400">
          <el-table-column label="应用/站点" min-width="160">
            <template #default="{ row }">
              <div style="font-weight: 500">{{ row.name }}</div>
              <div style="font-size: 11px; color: #909399">{{ row.domains?.slice(0, 2).join(', ') }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="80">
            <template #default="{ row }"><el-tag :type="catTagColor(row.category)" size="small">{{ row.category }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="visitCount" label="访问次数" width="90" sortable align="center" />
          <el-table-column label="时长" width="100" align="center">
            <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
          </el-table-column>
          <el-table-column label="流量" width="90" align="center">
            <template #default="{ row }">{{ fmtSize(row.totalBytes) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="viewServicePackets(row)">报文</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis, Monitor, Download, Loading } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { monitorApi } from '@/api/monitor'

const router = useRouter()

const timeRange = ref(60)
const activeTab = ref('overview')
const loading = ref(false)
const devices = ref<any[]>([])
const categories = ref<any[]>([])
const crossDeviceData = ref<any[]>([])
const loadingCross = ref(false)
const deviceFilter = ref('')
const detailVisible = ref(false)
const selectedDevice = ref<any>(null)
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

// LLM state
const llmAvailable = ref(false)
const llmLoading = ref(false)
const llmResult = ref('')
const customPrompt = ref('')
const selectedDeviceForLlm = ref('')
const exporting = ref(false)

const filteredDevices = computed(() => {
  if (!deviceFilter.value) return devices.value
  const q = deviceFilter.value.toLowerCase()
  return devices.value.filter(d => (d.hostname || '').toLowerCase().includes(q) || d.ip.includes(q))
})

function catIcon(cat: string) {
  const m: Record<string, string> = { '社交': '💬', '视频': '🎬', '搜索': '🔍', '电商': '🛒', '邮件': '📧', '开发': '💻', '办公': '📋', '云服务': '☁️', 'CDN': '🌐', '资讯': '📰', '网站': '🌍', '系统': '⚙️', '未知': '❓', '游戏': '🎮', '音乐': '🎵', '金融': '💰', '出行': '🚗', '教育': '📚', '健康': '❤️', 'IoT': '🏠', '阅读': '📖', '下载': '📥', '生活': '🍳' }
  return m[cat] || '📦'
}
function catTagColor(cat: string) {
  const m: Record<string, string> = { '社交': 'success', '视频': 'danger', '搜索': 'warning', '电商': '', '邮件': 'info', '开发': '', '办公': 'warning', '云服务': '', 'CDN': 'info', '资讯': 'success', '网站': '', '系统': 'info', '未知': 'info', '游戏': 'danger', '音乐': 'success', '金融': 'warning', '出行': '', '教育': 'success', '健康': 'danger', 'IoT': 'info', '阅读': '', '下载': 'info', '生活': 'success' }
  return (m[cat] || '') as any
}
function fmtTime(ts: number) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-' }
function fmtSize(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}
function fmtDuration(ms: number) {
  if (!ms || ms < 0) return '-'
  const min = Math.floor(ms / 60000)
  if (min < 1) return '<1分钟'
  if (min < 60) return min + '分钟'
  return Math.floor(min / 60) + '小时' + (min % 60 > 0 ? (min % 60) + '分' : '')
}

function renderMarkdown(text: string) {
  return text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}

async function loadData() {
  loading.value = true
  try {
    const [devs, cats] = await Promise.all([
      monitorApi.getAnalyticsDevices(timeRange.value),
      monitorApi.getAnalyticsCategories(timeRange.value),
    ])
    devices.value = devs || []
    categories.value = cats || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

async function loadCrossDevice() {
  loadingCross.value = true
  try {
    crossDeviceData.value = await monitorApi.getAnalyticsCrossDevice(timeRange.value) || []
  } catch {}
  finally { loadingCross.value = false }
}

async function selectDevice(row: any) {
  selectedDevice.value = row
  detailVisible.value = true
  await nextTick()
  try {
    const detail = await monitorApi.getAnalyticsDevice(row.ip, timeRange.value)
    if (detail) selectedDevice.value = detail
  } catch {}
  if (chartRef.value && selectedDevice.value?.services?.length) {
    if (!chart) chart = echarts.init(chartRef.value)
    const catData: Record<string, number> = {}
    for (const s of selectedDevice.value.services) catData[s.category] = (catData[s.category] || 0) + s.visitCount
    chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 } },
      series: [{ type: 'pie', radius: ['40%', '70%'], center: ['35%', '50%'], itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } }, data: Object.entries(catData).map(([name, value]) => ({ name, value })) }]
    })
  }
}

// LLM functions
async function checkLlm() {
  try { const s = await monitorApi.getLlmStatus(); llmAvailable.value = s?.available || false } catch { llmAvailable.value = false }
}

async function runLlm(type: string, ip?: string) {
  llmLoading.value = true; llmResult.value = ''
  try {
    let result: any
    if (type === 'summary') result = await monitorApi.getLlmSummary(timeRange.value)
    else if (type === 'security') result = await monitorApi.getLlmSecurity(timeRange.value)
    else if (type === 'device' && ip) result = await monitorApi.getLlmDevice(ip, timeRange.value)
    llmResult.value = result?.text || '未获取到分析结果'
  } catch (e: any) { ElMessage.error(e.message || 'AI 分析失败') }
  finally { llmLoading.value = false }
}

async function runCustomAnalysis() {
  if (!customPrompt.value.trim()) return
  llmLoading.value = true; llmResult.value = ''
  try {
    const result = await monitorApi.llmAnalyze(customPrompt.value, timeRange.value)
    llmResult.value = result?.text || '未获取到分析结果'
  } catch (e: any) { ElMessage.error(e.message || 'AI 分析失败') }
  finally { llmLoading.value = false }
}

function copyLlmResult() {
  navigator.clipboard.writeText(llmResult.value).then(() => ElMessage.success('已复制'))
}

function viewDevicePackets(device: any) {
  router.push({
    path: '/monitor/content-inspection',
    query: { srcIp: device.ip, minutes: timeRange.value }
  })
}

function viewServicePackets(service: any) {
  const domains = service.domains || []
  const keyword = domains.length > 0 ? domains[0] : service.name
  router.push({
    path: '/monitor/content-inspection',
    query: { srcIp: selectedDevice.value?.ip, keyword, minutes: timeRange.value }
  })
}

// Export
async function exportReport() {
  exporting.value = true
  try {
    const data = await monitorApi.getAnalyticsReport(timeRange.value)
    const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `网络行为报告_${new Date().toLocaleDateString('zh-CN')}.html`
    a.click(); URL.revokeObjectURL(url)
    ElMessage.success('报告已导出')
  } catch (e) { ElMessage.error('导出失败') }
  finally { exporting.value = false }
}

// Tab change handler
function onTabChange(tab: string) {
  if (tab === 'cross' && crossDeviceData.value.length === 0) loadCrossDevice()
}

onMounted(() => {
  loadData(); checkLlm()
  refreshTimer = setInterval(loadData, 30000)
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  chart?.dispose()
})
</script>

<style scoped lang="scss">
.user-analytics { padding: 16px; }
.mb-16 { margin-bottom: 16px; }
.page-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.main-tabs { :deep(.el-tabs__content) { padding: 16px; } }

.cat-card { background: var(--el-fill-color-light); border-radius: 8px; padding: 12px; text-align: center;
  .cat-icon { font-size: 24px; margin-bottom: 4px; }
  .cat-name { font-size: 13px; font-weight: 500; }
  .cat-count { font-size: 16px; font-weight: 600; color: var(--el-color-primary); margin-top: 2px; }
  .cat-devices { font-size: 11px; color: var(--el-text-color-secondary); }
}
.card-hd { display: flex; justify-content: space-between; align-items: center; span { display: flex; align-items: center; gap: 4px; } }
.device-cell { display: flex; align-items: center; gap: 8px; }
.device-name { font-weight: 500; font-size: 13px; }
.device-ip { font-size: 11px; color: var(--el-text-color-secondary); }
.num-cell { font-weight: 500; font-variant-numeric: tabular-nums; }
.num-cell.highlight { color: var(--el-color-primary); font-weight: 600; }

.device-detail { max-height: 75vh; overflow-y: auto; }
.detail-stat { background: var(--el-fill-color-lighter); border-radius: 8px; padding: 12px; text-align: center;
  .val { font-size: 22px; font-weight: 600; color: var(--el-color-primary); }
  .lbl { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
}
.section-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; padding-left: 8px; border-left: 3px solid var(--el-color-primary); }

.llm-loading { display: flex; align-items: center; gap: 8px; padding: 40px; justify-content: center; color: var(--el-text-color-secondary); }
.llm-result { max-height: 500px; overflow-y: auto; padding: 12px; background: var(--el-fill-color-lighter); border-radius: 8px; font-size: 13px; line-height: 1.8;
  :deep(h2) { font-size: 16px; margin: 12px 0 8px; color: var(--el-color-primary); }
  :deep(h3) { font-size: 15px; margin: 10px 0 6px; }
  :deep(h4) { font-size: 14px; margin: 8px 0 4px; }
  :deep(li) { margin-left: 16px; }
  :deep(strong) { color: var(--el-color-primary); }
}
</style>
