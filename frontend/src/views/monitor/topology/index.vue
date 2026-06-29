<template>
  <div class="topology-page">
    <!-- Header -->
    <div class="topology-header">
      <div class="header-left">
        <h3>网络拓扑</h3>
        <el-tag v-if="stats" type="info" effect="plain" size="small">
          {{ stats.devices }} 设备 · {{ stats.connections }} 连接 · {{ stats.externalTargets }} 外部目标
        </el-tag>
      </div>
      <div class="header-right">
        <el-button :icon="Refresh" size="small" @click="fetchTopology" :loading="loading">刷新</el-button>
        <el-switch v-model="autoRefresh" active-text="自动刷新" size="small" style="margin-left: 12px" />
      </div>
    </div>

    <!-- Legend -->
    <div class="topology-legend">
      <span class="legend-item"><span class="dot" style="background:#409eff"></span>路由器</span>
      <span class="legend-item"><span class="dot" style="background:#67c23a"></span>局域网设备</span>
      <span class="legend-item"><span class="dot" style="background:#909399"></span>外部服务</span>
      <span class="legend-tip">节点大小 = 流量 · 连线粗细 = 带宽 · 点击节点查看详情</span>
    </div>

    <!-- Chart -->
    <div class="topology-chart" v-loading="loading" element-loading-text="加载拓扑数据...">
      <div ref="chartRef" class="chart-inner"></div>
    </div>

    <!-- Detail panel -->
    <el-drawer v-model="showDetail" title="节点详情" size="320px" direction="rtl">
      <div v-if="selectedNode" class="node-detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="名称">{{ selectedNode.name }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            <el-tag :type="selectedNode.detail?.type === 'router' ? 'primary' : selectedNode.detail?.type === 'device' ? 'success' : 'info'" size="small">
              {{ selectedNode.detail?.type === 'router' ? '路由器' : selectedNode.detail?.type === 'device' ? '局域网设备' : '外部服务' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.ip" label="IP">{{ selectedNode.detail.ip }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.mac" label="MAC">{{ selectedNode.detail.mac }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.hostname" label="主机名">{{ selectedNode.detail.hostname }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.totalBytes != null" label="总流量">{{ fmtB(selectedNode.detail.totalBytes) }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.bytes != null" label="流量">{{ fmtB(selectedNode.detail.bytes) }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedNode.detail?.name && selectedNode.detail?.type === 'external'" label="解析域名">{{ selectedNode.detail.name }}</el-descriptions-item>
        </el-descriptions>
        <!-- Connected edges -->
        <div v-if="nodeEdges.length" style="margin-top: 16px">
          <h4 style="font-size: 13px; margin-bottom: 8px">关联连接 ({{ nodeEdges.length }})</h4>
          <el-table :data="nodeEdges" size="small" max-height="300" stripe>
            <el-table-column prop="peer" label="对端" min-width="100" />
            <el-table-column prop="bytes" label="流量" width="80">
              <template #default="{ row }">{{ fmtB(row.bytes) }}</template>
            </el-table-column>
            <el-table-column prop="connections" label="连接数" width="70" />
          </el-table>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { monitorApi } from '@/api/monitor'

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
const loading = ref(false)
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const stats = ref<{ devices: number; connections: number; externalTargets: number } | null>(null)
const showDetail = ref(false)
const selectedNode = ref<any>(null)
const nodeEdges = ref<any[]>([])

// Store raw data for detail panel
let rawNodes: any[] = []
let rawLinks: any[] = []

function fmtB(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

async function fetchTopology() {
  loading.value = true
  try {
    const data = await monitorApi.getTopology() as any
    rawNodes = data.nodes || []
    rawLinks = data.links || []
    stats.value = data.stats
    renderChart(data)
  } catch (e) {
    console.error('Topology fetch error:', e)
  } finally {
    loading.value = false
  }
}

function renderChart(data: any) {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)

  const categories = data.categories || [
    { name: '路由器', color: '#409eff' },
    { name: '局域网设备', color: '#67c23a' },
    { name: '外部服务', color: '#909399' },
  ]

  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        if (p.dataType === 'node') {
          const d = p.data.detail || {}
          let info = `<b>${p.data.name}</b>`
          if (d.ip) info += `<br/>IP: ${d.ip}`
          if (d.totalBytes != null) info += `<br/>流量: ${fmtB(d.totalBytes)}`
          if (d.bytes != null) info += `<br/>流量: ${fmtB(d.bytes)}`
          return info
        }
        if (p.dataType === 'edge') {
          return `${p.data.source} → ${p.data.target}<br/>流量: ${fmtB(p.data.value)}`
        }
        return ''
      },
    },
    legend: {
      data: categories.map((c: any) => c.name),
      bottom: 10,
      textStyle: { fontSize: 12 },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      data: rawNodes.map((n: any) => ({
        ...n,
        itemStyle: { color: categories[n.category]?.color },
        label: { show: n.category !== 2, fontSize: 11, color: '#333' },
      })),
      links: rawLinks.map((l: any) => ({
        ...l,
        lineStyle: { ...l.lineStyle, color: '#aaa', curveness: 0.1, opacity: 0.6 },
      })),
      categories: categories.map((c: any) => ({ name: c.name, itemStyle: { color: c.color } })),
      roam: true,
      draggable: true,
      force: { repulsion: 120, gravity: 0.25, edgeLength: [60, 150], friction: 0.6, layoutAnimation: true },
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 4, opacity: 1 },
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
      },
      labelLayout: { hideOverlap: true },
      // Ensure all nodes fit within view
      scaleLimit: { min: 0.3, max: 3 },
    }],
  }, true)

  // Auto-fit view after force simulation settles
  setTimeout(() => {
    chart?.resize()
  }, 100)
  setTimeout(() => {
    chart?.resize()
  }, 2000)
}

function handleNodeClick(params: any) {
  if (params.dataType !== 'node') return
  const node = rawNodes.find((n: any) => n.id === params.data.id)
  if (!node) return

  selectedNode.value = node

  // Find connected edges
  const edges = rawLinks
    .filter((l: any) => l.source === node.id || l.target === node.id)
    .map((l: any) => {
      const peerId = l.source === node.id ? l.target : l.source
      const peer = rawNodes.find((n: any) => n.id === peerId)
      return { peer: peer?.name || peerId, bytes: l.value, connections: l.connections || '-' }
    })
    .sort((a: any, b: any) => b.bytes - a.bytes)
  nodeEdges.value = edges

  showDetail.value = true
}

watch(autoRefresh, (val) => {
  if (val) {
    refreshTimer = setInterval(fetchTopology, 15000)
  } else {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  }
})

onMounted(async () => {
  await nextTick()
  // Delay slightly to ensure container has final dimensions
  setTimeout(async () => {
    await fetchTopology()
    chart?.on('click', handleNodeClick)
  }, 50)
  window.addEventListener('resize', () => chart?.resize())
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  chart?.dispose()
  chart = null
})
</script>

<style scoped lang="scss">
.topology-page { padding: 16px; display: flex; flex-direction: column; height: 100%; }

.topology-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
  h3 { margin: 0; font-size: 16px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-right { display: flex; align-items: center; }
}

.topology-legend {
  display: flex; align-items: center; gap: 16px; margin-bottom: 12px; font-size: 12px; color: #606266;
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .legend-tip { color: #909399; margin-left: auto; }
}

.topology-chart {
  flex: 1; min-height: 500px; height: calc(100vh - 220px);
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; overflow: hidden; position: relative;
  .chart-inner { position: absolute; inset: 0; }
}

.node-detail { padding: 0 4px; }
</style>
