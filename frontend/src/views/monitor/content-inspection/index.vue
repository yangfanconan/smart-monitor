<template>
  <div class="content-inspection">
    <!-- Header Stats -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="8" :sm="4" v-for="card in statsCards" :key="card.label">
        <div class="stat-card" :class="{ 'is-encrypted': card.key === 'encrypted' }">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- Filters -->
    <el-card shadow="never" class="filter-card">
      <el-row :gutter="12" align="middle">
        <el-col :xs="24" :sm="6">
          <el-input v-model="filters.keyword" placeholder="搜索 URL / 域名 / 内容..." clearable prefix-icon="Search" @keyup.enter="loadData" @clear="loadData" />
        </el-col>
        <el-col :xs="12" :sm="4">
          <el-select v-model="filters.type" placeholder="协议类型" clearable @change="loadData">
            <el-option label="全部" value="" />
            <el-option label="HTTP" value="HTTP" />
            <el-option label="DNS" value="DNS" />
            <el-option label="TLS/HTTPS" value="TLS" />
            <el-option label="明文 TCP" value="Plaintext" />
            <el-option label="FTP/Telnet" value="FTP" />
          </el-select>
        </el-col>
        <el-col :xs="12" :sm="4">
          <el-select v-model="filters.encrypted" placeholder="加密状态" clearable @change="loadData">
            <el-option label="全部" value="" />
            <el-option label="明文" :value="false" />
            <el-option label="加密" :value="true" />
          </el-select>
        </el-col>
        <el-col :xs="12" :sm="3">
          <el-select v-model="filters.minutes" @change="loadData">
            <el-option :label="'30分钟'" :value="30" />
            <el-option :label="'1小时'" :value="60" />
            <el-option :label="'6小时'" :value="360" />
            <el-option :label="'24小时'" :value="1440" />
          </el-select>
        </el-col>
        <el-col :xs="12" :sm="3">
          <el-input v-model="filters.srcIp" placeholder="源 IP" clearable @keyup.enter="loadData" @clear="loadData" />
        </el-col>
        <el-col :xs="12" :sm="3">
          <el-input v-model="filters.dstIp" placeholder="目标 IP" clearable @keyup.enter="loadData" @clear="loadData" />
        </el-col>
        <el-col :xs="24" :sm="4">
          <el-button type="primary" @click="loadData" :icon="SearchIcon">搜索</el-button>
          <el-button @click="resetFilters" :icon="RefreshIcon">重置</el-button>
        </el-col>
      </el-row>
      <el-row :gutter="12" align="middle" style="margin-top: 10px">
        <el-col :xs="12" :sm="4">
          <el-input-number v-model="filters.minSize" :min="0" :step="100" placeholder="最小" size="small" controls-position="right" style="width: 100%" @change="loadData" />
        </el-col>
        <el-col :xs="1" :sm="0.5" style="text-align: center; line-height: 32px">—</el-col>
        <el-col :xs="12" :sm="4">
          <el-input-number v-model="filters.maxSize" :min="0" :step="100" placeholder="最大" size="small" controls-position="right" style="width: 100%" @change="loadData" />
        </el-col>
        <el-col :xs="12" :sm="3">
          <span style="font-size: 12px; color: var(--el-text-color-secondary)">报文大小 (bytes)</span>
        </el-col>
      </el-row>
    </el-card>

    <!-- Content Table -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-hd">
          <span><el-icon><View /></el-icon> 报文内容 ({{ total }} 条)</span>
          <el-tag :type="captureRunning ? 'success' : 'danger'" size="small">
            {{ captureRunning ? '采集中' : '已停止' }} · {{ captureStats.packets || 0 }} 包
          </el-tag>
        </div>
      </template>

      <el-table :data="records" size="small" stripe v-loading="loading" @row-click="showDetail" style="cursor: pointer" max-height="600">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.ts) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="typeTagColor(row.content_type)" size="small" effect="dark">{{ row.content_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加密" width="60" align="center">
          <template #default="{ row }">
            <el-icon :size="14" :color="row.encrypted ? '#e6a23c' : '#67c23a'">
              <component :is="row.encrypted ? 'Lock' : 'Unlock'" />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column label="源" width="150">
          <template #default="{ row }">{{ row.src_ip }}:{{ row.src_port }}</template>
        </el-table-column>
        <el-table-column label="目标" width="150">
          <template #default="{ row }">{{ row.dst_ip }}:{{ row.dst_port }}</template>
        </el-table-column>
        <el-table-column label="内容摘要" min-width="300">
          <template #default="{ row }">
            <div class="summary-text" :class="{ encrypted: row.encrypted }">{{ row.summary }}</div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="80">
          <template #default="{ row }">{{ fmtSize(row.payload_len) }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" :title="detailTitle" width="900px" destroy-on-close>
      <div v-if="detail" class="detail-view">
        <!-- Meta info -->
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="时间">{{ fmtTime(detail.ts) }}</el-descriptions-item>
          <el-descriptions-item label="协议">{{ detail.protocol?.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            <el-tag :type="typeTagColor(detail.content_type)" size="small" effect="dark">{{ detail.content_type }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="源地址">{{ detail.src_ip }}:{{ detail.src_port }}</el-descriptions-item>
          <el-descriptions-item label="目标地址">{{ detail.dst_ip }}:{{ detail.dst_port }}</el-descriptions-item>
          <el-descriptions-item label="载荷大小">{{ fmtSize(detail.payload_len) }}</el-descriptions-item>
        </el-descriptions>

        <!-- HTTP Request/Response -->
        <template v-if="detail.content_type === 'HTTP' && detail.detail">
          <el-divider content-position="left">HTTP {{ detail.detail.type === 'request' ? '请求' : '响应' }}</el-divider>
          <div v-if="detail.detail.type === 'request'" class="http-view">
            <div class="http-line highlight">{{ detail.detail.method }} {{ detail.detail.uri }} {{ detail.detail.version }}</div>
            <div v-for="(val, key) in detail.detail.headers" :key="key" class="http-line">
              <span class="hdr-key">{{ key }}:</span> {{ val }}
            </div>
            <div v-if="detail.detail.body" class="http-body">
              <el-divider content-position="left">Body</el-divider>
              <pre class="body-pre">{{ detail.detail.body }}</pre>
            </div>
          </div>
          <div v-else class="http-view">
            <div class="http-line highlight">{{ detail.detail.version }} {{ detail.detail.statusCode }} {{ detail.detail.statusText }}</div>
            <div v-for="(val, key) in detail.detail.headers" :key="key" class="http-line">
              <span class="hdr-key">{{ key }}:</span> {{ val }}
            </div>
            <div v-if="detail.detail.body" class="http-body">
              <el-divider content-position="left">Body</el-divider>
              <pre class="body-pre">{{ detail.detail.body }}</pre>
            </div>
          </div>
        </template>

        <!-- DNS -->
        <template v-if="detail.content_type === 'DNS' && detail.detail">
          <el-divider content-position="left">DNS {{ detail.detail.isResponse ? '响应' : '查询' }}</el-divider>
          <div class="dns-view">
            <div><b>查询:</b> {{ detail.detail.questions?.join(', ') }}</div>
            <div v-if="detail.detail.answers?.length">
              <b>回答:</b>
              <div v-for="a in detail.detail.answers" :key="a.value" class="dns-answer">
                <el-tag size="small">{{ a.type }}</el-tag> {{ a.name }} → {{ a.value }}
              </div>
            </div>
          </div>
        </template>

        <!-- TLS -->
        <template v-if="detail.content_type === 'TLS' && detail.detail">
          <el-divider content-position="left">TLS 加密报文分析</el-divider>
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">
            <template #title>此连接使用加密通信，无法直接读取传输内容</template>
          </el-alert>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="TLS 版本">{{ detail.detail.tlsVersion }}</el-descriptions-item>
            <el-descriptions-item label="握手类型">{{ detail.detail.handshakeType }}</el-descriptions-item>
            <el-descriptions-item label="记录类型">{{ detail.detail.contentType }}</el-descriptions-item>
            <el-descriptions-item label="记录长度">{{ detail.detail.recordLength }}</el-descriptions-item>
            <el-descriptions-item label="目标域名" v-if="detail.detail.serverName">
              <span style="color: #409eff; font-weight: 600">{{ detail.detail.serverName }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="JA3 指纹" v-if="detail.detail.ja3Hash">
              <code style="font-size: 11px; word-break: break-all">{{ detail.detail.ja3Hash }}</code>
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- Plaintext -->
        <template v-if="(detail.content_type === 'Plaintext' || detail.content_type === 'Telnet' || detail.content_type === 'FTP' || detail.content_type === 'SMTP') && detail.detail">
          <el-divider content-position="left">明文内容</el-divider>
          <pre class="body-pre">{{ detail.detail.text }}</pre>
        </template>

        <!-- Raw hex -->
        <template v-if="detail.raw_hex">
          <el-divider content-position="left">原始报文 (Hex)</el-divider>
          <pre class="hex-pre">{{ formatHex(detail.raw_hex) }}</pre>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, shallowRef, markRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, Refresh, View, Lock, Unlock } from '@element-plus/icons-vue'
import { monitorApi, createMonitorWebSocket } from '@/api/monitor'

const route = useRoute()

const SearchIcon = markRaw(Search)
const RefreshIcon = markRaw(Refresh)

const loading = ref(false)
const records = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const stats = ref<any>({})
const captureStats = ref<any>({})
const captureRunning = ref(false)
const detailVisible = ref(false)
const detail = ref<any>(null)
let ws: WebSocket | null = null
let statsTimer: ReturnType<typeof setInterval> | null = null
let pendingBatch: any[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

const filters = ref({
  keyword: '',
  type: '',
  encrypted: '' as string | boolean,
  minutes: 60,
  srcIp: '',
  dstIp: '',
  minSize: undefined as number | undefined,
  maxSize: undefined as number | undefined,
})

const statsCards = computed(() => [
  { label: '总记录', value: stats.value.total || 0, key: 'total' },
  { label: '明文', value: stats.value.plaintext || 0, key: 'plaintext' },
  { label: '加密', value: stats.value.encrypted || 0, key: 'encrypted' },
  { label: 'HTTP', value: countByType('HTTP'), key: 'http' },
  { label: 'DNS', value: countByType('DNS'), key: 'dns' },
  { label: 'TLS', value: countByType('TLS'), key: 'tls' },
])

function countByType(type: string) {
  return stats.value.byType?.find((t: any) => t.content_type === type)?.count || 0
}

const detailTitle = computed(() => {
  if (!detail.value) return ''
  const d = detail.value
  return `${d.content_type} · ${d.src_ip}:${d.src_port} → ${d.dst_ip}:${d.dst_port}`
})

function typeTagColor(type: string) {
  const map: Record<string, string> = { HTTP: 'success', DNS: '', TLS: 'warning', Plaintext: 'info', Telnet: 'danger', FTP: 'danger', SMTP: 'warning' }
  return (map[type] || '') as any
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', month: '2-digit', day: '2-digit' })
}

function fmtSize(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(i ? 1 : 0) + ' ' + s[i]
}

function formatHex(hex: string) {
  if (!hex) return ''
  const bytes = hex.split(' ')
  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16)
    const hexPart = chunk.join(' ').padEnd(48)
    const asciiPart = chunk.map(b => {
      const n = parseInt(b, 16)
      return n >= 0x20 && n <= 0x7e ? String.fromCharCode(n) : '.'
    }).join('')
    lines.push(`${i.toString().padStart(8, '0')}  ${hexPart}  |${asciiPart}|`)
  }
  return lines.join('\n')
}

async function loadData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
      minutes: filters.value.minutes,
    }
    if (filters.value.keyword) params.keyword = filters.value.keyword
    if (filters.value.type) params.type = filters.value.type
    if (filters.value.srcIp) params.srcIp = filters.value.srcIp
    if (filters.value.dstIp) params.dstIp = filters.value.dstIp
    if (filters.value.encrypted !== '') params.encrypted = filters.value.encrypted
    if (filters.value.minSize) params.minSize = filters.value.minSize
    if (filters.value.maxSize) params.maxSize = filters.value.maxSize

    const [list, st, cs] = await Promise.all([
      monitorApi.getContentList(params),
      monitorApi.getContentStats(filters.value.minutes),
      monitorApi.getCaptureStats(),
    ])
    records.value = list || []
    stats.value = st || {}
    captureStats.value = cs || {}
    captureRunning.value = (cs?.packets || 0) > 0
  } catch (e) {
    console.error('Load content failed:', e)
  } finally {
    loading.value = false
  }
}

async function showDetail(row: any) {
  try {
    const data = await monitorApi.getContentDetail(row.id)
    detail.value = data
    detailVisible.value = true
  } catch (e) {
    console.error('Load detail failed:', e)
  }
}

function resetFilters() {
  filters.value = { keyword: '', type: '', encrypted: '', minutes: 60, srcIp: '', dstIp: '', minSize: undefined, maxSize: undefined }
  page.value = 1
  loadData()
}

function connectWs() {
  ws = createMonitorWebSocket((event, data) => {
    if (event === 'content:batch') {
      const items = data.items || []
      pendingBatch.push(...items)
      total.value += data.total || items.length
    }
  })
  // Flush batched events every 2 seconds
  flushTimer = setInterval(() => {
    if (pendingBatch.length > 0) {
      const batch = pendingBatch.splice(0)
      // Only prepend if no filters active (otherwise just bump counter)
      const hasFilters = filters.value.keyword || filters.value.type || filters.value.srcIp || filters.value.dstIp || filters.value.encrypted !== ''
      if (!hasFilters && page.value === 1) {
        records.value.unshift(...batch)
        if (records.value.length > pageSize) records.value.length = pageSize
      }
      total.value += batch.length
    }
  }, 2000)
}

async function refreshStats() {
  try {
    const [st, cs] = await Promise.all([
      monitorApi.getContentStats(filters.value.minutes),
      monitorApi.getCaptureStats(),
    ])
    stats.value = st || {}
    captureStats.value = cs || {}
    captureRunning.value = (cs?.packets || 0) > 0
  } catch {}
}

function applyQueryParams() {
  const q = route.query
  let changed = false
  if (q.srcIp && q.srcIp !== filters.value.srcIp) { filters.value.srcIp = q.srcIp as string; changed = true }
  if (q.dstIp && q.dstIp !== filters.value.dstIp) { filters.value.dstIp = q.dstIp as string; changed = true }
  if (q.type && q.type !== filters.value.type) { filters.value.type = q.type as string; changed = true }
  if (q.keyword && q.keyword !== filters.value.keyword) { filters.value.keyword = q.keyword as string; changed = true }
  if (q.minutes) {
    const m = parseInt(q.minutes as string) || 60
    if (m !== filters.value.minutes) { filters.value.minutes = m; changed = true }
  }
  if (changed) { page.value = 1; loadData() }
}

onMounted(() => {
  applyQueryParams()
  loadData()
  connectWs()
  statsTimer = setInterval(refreshStats, 10000)
})

onActivated(() => {
  applyQueryParams()
})

onUnmounted(() => {
  ws?.close()
  if (statsTimer) clearInterval(statsTimer)
  if (flushTimer) clearInterval(flushTimer)
})
</script>

<style scoped lang="scss">
.content-inspection { padding: 16px; }

.stats-row { margin-bottom: 16px; }
.stat-card {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  &.is-encrypted { background: #fdf6ec; }
  .stat-value { font-size: 20px; font-weight: 600; color: var(--el-text-color-primary); }
  .stat-label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
}

.filter-card { margin-bottom: 16px; }
.table-card { margin-bottom: 16px; }

.card-hd {
  display: flex; justify-content: space-between; align-items: center;
  span { display: flex; align-items: center; gap: 4px; }
}

.summary-text {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 500px;
  font-family: 'Consolas', 'Monaco', monospace; font-size: 12px;
  &.encrypted { color: var(--el-text-color-secondary); font-style: italic; }
}

.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }

.detail-view {
  max-height: 70vh; overflow-y: auto;
}

.http-view {
  font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.6;
}
.http-line {
  padding: 1px 0;
  &.highlight { color: #409eff; font-weight: 600; font-size: 14px; margin-bottom: 8px; }
}
.hdr-key { color: #67c23a; }

.http-body, .dns-view { margin-top: 8px; }
.dns-answer { padding: 2px 0; display: flex; align-items: center; gap: 6px; }

.body-pre {
  background: var(--el-fill-color-lighter);
  padding: 12px; border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace; font-size: 12px;
  white-space: pre-wrap; word-break: break-all;
  max-height: 300px; overflow-y: auto;
}

.hex-pre {
  background: #1e1e1e; color: #d4d4d4;
  padding: 12px; border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace; font-size: 11px;
  white-space: pre; overflow-x: auto;
  max-height: 300px; overflow-y: auto;
}
</style>
