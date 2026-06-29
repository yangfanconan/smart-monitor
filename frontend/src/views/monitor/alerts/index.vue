<template>
  <div class="monitor-alerts">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <span>告警中心</span>
          <div class="filter-group">
            <el-radio-group v-model="statusFilter" size="small">
              <el-radio-button value="all">全部 ({{ alerts.length }})</el-radio-button>
              <el-radio-button value="unread">未读 ({{ unreadCount }})</el-radio-button>
              <el-radio-button value="acknowledged">已确认</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <el-table :data="filteredAlerts" size="small" stripe max-height="600">
        <el-table-column label="级别" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'">
              {{ row.level === 'critical' ? '严重' : row.level === 'warning' ? '警告' : '信息' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-badge is-dot :hidden="row.status !== 'unread'" type="danger">
              <span style="font-size: 12px">{{ row.status === 'unread' ? '未读' : row.status === 'acknowledged' ? '已确认' : '已忽略' }}</span>
            </el-badge>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" width="160" />
        <el-table-column prop="message" label="详情" min-width="200" show-overflow-tooltip />
        <el-table-column prop="srcIp" label="源 IP" width="140" />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ new Date(row.ts).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'unread'" type="primary" size="small" text @click="acknowledge(row)">确认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMonitorStore } from '@/store/monitor'

const store = useMonitorStore()
const alerts = computed(() => store.alerts)
const unreadCount = computed(() => store.unreadCount)
const statusFilter = ref('all')

const filteredAlerts = computed(() => {
  if (statusFilter.value === 'all') return alerts.value
  return alerts.value.filter((a: any) => a.status === statusFilter.value)
})

function acknowledge(alert: any) {
  alert.status = 'acknowledged'
  store.unreadCount = Math.max(0, store.unreadCount - 1)
}
</script>

<style scoped>
.monitor-alerts { padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
