<template>
  <div class="monitor-security">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover">
          <template #header><span>威胁统计</span></template>
          <div class="threat-stats">
            <div class="threat-stat critical">
              <div class="count">{{ criticalCount }}</div>
              <div class="label">严重</div>
            </div>
            <div class="threat-stat warning">
              <div class="count">{{ warningCount }}</div>
              <div class="label">警告</div>
            </div>
            <div class="threat-stat info">
              <div class="count">{{ infoCount }}</div>
              <div class="label">信息</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="16">
        <el-card shadow="hover">
          <template #header><span>检测规则</span></template>
          <el-table :data="rules" size="small" stripe>
            <el-table-column prop="name" label="规则名称" />
            <el-table-column prop="id" label="ID" width="120" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="级别" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'">{{ row.level }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="threshold" label="阈值" width="80" />
            <el-table-column label="窗口" width="80">
              <template #default="{ row }">{{ row.window ? row.window + 's' : '-' }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header><span>威胁事件时间线</span></template>
          <el-timeline v-if="threats.length > 0">
            <el-timeline-item v-for="(t, i) in threats" :key="i"
              :type="t.level === 'critical' ? 'danger' : t.level === 'warning' ? 'warning' : 'info'"
              :timestamp="new Date(t.ts || Date.now()).toLocaleString('zh-CN')" placement="top">
              <el-card shadow="never" class="threat-card">
                <div class="threat-header">
                  <el-tag size="small" :type="t.level === 'critical' ? 'danger' : t.level === 'warning' ? 'warning' : 'info'">{{ t.level }}</el-tag>
                  <strong>{{ t.title }}</strong>
                </div>
                <p>{{ t.message }}</p>
                <div v-if="t.details" class="threat-details">
                  <span v-for="(v, k) in t.details" :key="k" class="detail-item">{{ k }}: {{ v }}</span>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无威胁事件" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMonitorStore } from '@/store/monitor'
import { monitorApi } from '@/api/monitor'

const store = useMonitorStore()
const threats = computed(() => store.threats)
const rules = ref<any[]>([])

const criticalCount = computed(() => threats.value.filter((t: any) => t.level === 'critical').length)
const warningCount = computed(() => threats.value.filter((t: any) => t.level === 'warning').length)
const infoCount = computed(() => threats.value.filter((t: any) => t.level === 'info').length)

onMounted(async () => {
  rules.value = await monitorApi.getRules()
})
</script>

<style scoped>
.monitor-security { padding: 16px; }
.threat-stats { display: flex; gap: 16px; justify-content: center; }
.threat-stat {
  text-align: center; padding: 16px 24px; border-radius: 8px;
  .count { font-size: 32px; font-weight: 700; }
  .label { font-size: 12px; color: #909399; margin-top: 4px; }
  &.critical { background: #fef0f0; .count { color: #f56c6c; } }
  &.warning { background: #fdf6ec; .count { color: #e6a23c; } }
  &.info { background: #f4f4f5; .count { color: #909399; } }
}
.threat-card { margin: 0; }
.threat-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.threat-details { margin-top: 8px; }
.detail-item { font-size: 11px; color: #909399; margin-right: 12px; }
</style>
