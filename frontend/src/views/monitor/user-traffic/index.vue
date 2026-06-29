<template>
  <div class="user-traffic">
    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-hd">
              <span><el-icon class="mr-1"><DataAnalysis /></el-icon>用户流量统计</span>
              <div class="time-range">
                <el-radio-group v-model="timeRange" size="small" @change="loadData">
                  <el-radio-button :label="30">30分钟</el-radio-button>
                  <el-radio-button :label="60">1小时</el-radio-button>
                  <el-radio-button :label="360">6小时</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>

          <!-- Summary Cards -->
          <el-row :gutter="16" class="summary-cards">
            <el-col :xs="8" :sm="4" v-for="card in summaryCards" :key="card.label">
              <div class="summary-card">
                <div class="label">{{ card.label }}</div>
                <div class="value">{{ card.value }}</div>
              </div>
            </el-col>
          </el-row>

          <!-- Device Traffic Table -->
          <el-table :data="deviceTraffic" size="small" stripe @row-click="showDeviceDetail" style="cursor: pointer">
            <el-table-column prop="hostname" label="设备" min-width="150">
              <template #default="{ row }">
                <div class="device-cell">
                  <el-icon :size="14" color="#409eff"><Monitor /></el-icon>
                  <span>{{ row.hostname || row.ip }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP 地址" width="140" />
            <el-table-column prop="mac" label="MAC 地址" width="150" />
            <el-table-column label="接收流量" width="120">
              <template #default="{ row }">{{ fmtB(row.rxBytes) }}</template>
            </el-table-column>
            <el-table-column label="发送流量" width="120">
              <template #default="{ row }">{{ fmtB(row.txBytes) }}</template>
            </el-table-column>
            <el-table-column label="总流量" width="120" sortable>
              <template #default="{ row }">{{ fmtB(row.rxBytes + row.txBytes) }}</template>
            </el-table-column>
            <el-table-column label="连接数" width="90" sortable>
              <template #default="{ row }">{{ row.connections }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- Device Detail Dialog -->
    <el-dialog v-model="detailVisible" :title="`设备流量详情 - ${selectedDevice?.hostname || selectedDevice?.ip}`" width="800px">
      <div ref="chartRef" style="height: 300px"></div>
      <el-table :data="deviceHistory" size="small" stripe style="margin-top: 16px">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.ts) }}</template>
        </el-table-column>
        <el-table-column label="接收" width="120">
          <template #default="{ row }">{{ fmtB(row.rxBytes) }}</template>
        </el-table-column>
        <el-table-column label="发送" width="120">
          <template #default="{ row }">{{ fmtB(row.txBytes) }}</template>
        </el-table-column>
        <el-table-column label="连接数" width="90">
          <template #default="{ row }">{{ row.connections }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { DataAnalysis, Monitor } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { monitorApi } from '@/api/monitor'

const timeRange = ref(60)
const deviceTraffic = ref<any[]>([])
const detailVisible = ref(false)
const selectedDevice = ref<any>(null)
const deviceHistory = ref<any[]>([])
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let timer: ReturnType<typeof setInterval> | null = null

function fmtB(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const summaryCards = computed(() => {
  const totalRx = deviceTraffic.value.reduce((sum, d) => sum + (d.rxBytes || 0), 0)
  const totalTx = deviceTraffic.value.reduce((sum, d) => sum + (d.txBytes || 0), 0)
  const totalConns = deviceTraffic.value.reduce((sum, d) => sum + (d.connections || 0), 0)
  return [
    { label: '设备数', value: deviceTraffic.value.length },
    { label: '总接收', value: fmtB(totalRx) },
    { label: '总发送', value: fmtB(totalTx) },
    { label: '总连接', value: totalConns },
    { label: '总流量', value: fmtB(totalRx + totalTx) },
    { label: '平均流量/设备', value: deviceTraffic.value.length ? fmtB((totalRx + totalTx) / deviceTraffic.value.length) : '0 B' }
  ]
})

async function loadData() {
  try {
    const data = await monitorApi.getUserTraffic(timeRange.value)
    // Aggregate by IP (take latest entry for each IP)
    const byIp = new Map()
    for (const item of data || []) {
      const existing = byIp.get(item.ip)
      if (!existing || item.ts > existing.ts) {
        byIp.set(item.ip, item)
      }
    }
    deviceTraffic.value = Array.from(byIp.values()).sort((a, b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes))
  } catch (e) {
    console.error('Load user traffic failed:', e)
  }
}

async function showDeviceDetail(row: any) {
  selectedDevice.value = row
  detailVisible.value = true
  await nextTick()

  try {
    const history = await monitorApi.getUserTrafficByIp(row.ip, timeRange.value)
    deviceHistory.value = (history || []).reverse()

    if (chartRef.value) {
      if (!chart) chart = echarts.init(chartRef.value)
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['接收', '发送'] },
        grid: { top: 40, right: 20, bottom: 30, left: 60 },
        xAxis: {
          type: 'category',
          data: deviceHistory.value.map(h => fmtTime(h.ts)),
          axisLabel: { rotate: 45, fontSize: 10 }
        },
        yAxis: {
          type: 'value',
          axisLabel: { formatter: (v: number) => fmtB(v) }
        },
        series: [
          {
            name: '接收',
            type: 'line',
            data: deviceHistory.value.map(h => h.rxBytes),
            smooth: true,
            areaStyle: { color: 'rgba(64,158,255,0.2)' },
            lineStyle: { color: '#409eff' },
            itemStyle: { color: '#409eff' }
          },
          {
            name: '发送',
            type: 'line',
            data: deviceHistory.value.map(h => h.txBytes),
            smooth: true,
            areaStyle: { color: 'rgba(103,194,58,0.2)' },
            lineStyle: { color: '#67c23a' },
            itemStyle: { color: '#67c23a' }
          }
        ]
      })
    }
  } catch (e) {
    console.error('Load device history failed:', e)
  }
}

onMounted(() => {
  loadData()
  timer = setInterval(loadData, 30000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  chart?.dispose()
})
</script>

<style scoped lang="scss">
.user-traffic { padding: 16px; }

.card-hd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  span { display: flex; align-items: center; }
}

.summary-cards { margin-bottom: 16px; }

.summary-card {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  .label { font-size: 12px; color: #909399; margin-bottom: 4px; }
  .value { font-size: 18px; font-weight: 600; color: #303133; }
}

.device-cell { display: flex; align-items: center; gap: 6px; }
.mr-1 { margin-right: 4px; }
</style>
