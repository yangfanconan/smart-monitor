<template>
  <div class="access-records">
    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-hd">
              <span><el-icon class="mr-1"><Clock /></el-icon>访问记录</span>
              <div class="filters">
                <el-select v-model="selectedDevice" placeholder="选择设备" size="small" style="width: 200px" @change="loadRecords">
                  <el-option v-for="d in devices" :key="d.ip" :label="d.hostname || d.ip" :value="d.ip" />
                </el-select>
                <el-radio-group v-model="timeRange" size="small" @change="loadRecords" style="margin-left: 12px">
                  <el-radio-button :label="30">30分钟</el-radio-button>
                  <el-radio-button :label="60">1小时</el-radio-button>
                  <el-radio-button :label="360">6小时</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>

          <!-- Summary -->
          <el-row :gutter="16" class="summary-row" v-if="selectedDevice">
            <el-col :span="6">
              <div class="summary-item">
                <span class="label">目标地址数</span>
                <span class="value">{{ records.length }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-item">
                <span class="label">总连接数</span>
                <span class="value">{{ totalConnections }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-item">
                <span class="label">总流量</span>
                <span class="value">{{ fmtB(totalBytes) }}</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-item">
                <span class="label">协议分布</span>
                <span class="value">{{ protocolSummary }}</span>
              </div>
            </el-col>
          </el-row>

          <!-- Records Table -->
          <el-table :data="records" size="small" stripe v-loading="loading">
            <el-table-column label="目标" min-width="200">
              <template #default="{ row }">
                <div class="target-cell">
                  <span class="dst-ip">{{ row.dst_ip }}</span>
                  <el-tag v-if="row.resolvedName" size="small" type="info" effect="plain" class="resolved-tag">
                    {{ row.resolvedName }}
                  </el-tag>
                  <el-tag v-else-if="row.serviceName" size="small" type="success" effect="plain">
                    {{ row.serviceName }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="端口" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="getPortType(row.dst_port)">{{ row.dst_port }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.protocol === 'tcp' ? 'primary' : row.protocol === 'udp' ? 'success' : 'warning'">
                  {{ row.protocol?.toUpperCase() }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="连接数" width="90" sortable>
              <template #default="{ row }">{{ row.total_conns }}</template>
            </el-table-column>
            <el-table-column label="流量" width="120" sortable>
              <template #default="{ row }">{{ fmtB(row.total_bytes) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="viewPackets(row)">报文</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-if="!selectedDevice" description="请选择一个设备查看访问记录" :image-size="100" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Clock } from '@element-plus/icons-vue'
import { monitorApi } from '@/api/monitor'
import { useMonitorStore } from '@/store/monitor'

const router = useRouter()
const store = useMonitorStore()
const selectedDevice = ref('')
const timeRange = ref(60)
const records = ref<any[]>([])
const loading = ref(false)

const devices = computed(() => store.devices || [])

const totalConnections = computed(() => records.value.reduce((sum, r) => sum + (r.total_conns || 0), 0))
const totalBytes = computed(() => records.value.reduce((sum, r) => sum + (r.total_bytes || 0), 0))
const protocolSummary = computed(() => {
  const byProto: Record<string, number> = {}
  for (const r of records.value) {
    const p = r.protocol?.toUpperCase() || 'UNK'
    byProto[p] = (byProto[p] || 0) + r.total_conns
  }
  return Object.entries(byProto).map(([k, v]) => `${k}:${v}`).join(' ') || '-'
})

function getPortType(port: number) {
  if ([80, 443, 8080, 8443].includes(port)) return 'success'
  if ([22, 3306, 5432, 6379].includes(port)) return 'warning'
  if (port === 53) return 'info'
  return 'primary'
}

function fmtB(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

function viewPackets(row: any) {
  router.push({
    path: '/monitor/content-inspection',
    query: {
      srcIp: selectedDevice.value,
      dstIp: row.dst_ip,
      minutes: timeRange.value
    }
  })
}

async function loadRecords() {
  if (!selectedDevice.value) return
  loading.value = true
  try {
    const data = await monitorApi.getAccessRecords(selectedDevice.value, timeRange.value)
    records.value = data || []
  } catch (e) {
    console.error('Load access records failed:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // Auto-select first device if available
  if (devices.value.length > 0) {
    selectedDevice.value = devices.value[0].ip
    loadRecords()
  }
})
</script>

<style scoped lang="scss">
.access-records { padding: 16px; }

.card-hd {
  display: flex;
  justify-content: space-between;
  align-items: center;
  span { display: flex; align-items: center; }
  .filters { display: flex; align-items: center; }
}

.summary-row { margin-bottom: 16px; }

.summary-item {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  .label { font-size: 12px; color: #909399; margin-bottom: 4px; }
  .value { font-size: 16px; font-weight: 600; color: #303133; }
}

.dst-ip { font-family: monospace; font-size: 12px; }
.target-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.resolved-tag { font-size: 11px; }
.mr-1 { margin-right: 4px; }
</style>
