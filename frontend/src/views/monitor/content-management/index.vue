<template>
  <div class="content-management">
    <el-page-header @back="$router.back()" title="返回" content="报文数据管理" style="margin-bottom: 16px" />

    <el-row :gutter="16">
      <!-- 左侧: 配置区 -->
      <el-col :xs="24" :lg="14">
        <!-- 捕获开关 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>采集控制</span>
            <el-switch v-model="config.enabled" active-text="启用" inactive-text="停用" @change="saveConfig" />
          </div></template>
          <el-alert v-if="!config.enabled" type="warning" :closable="false" show-icon style="margin-bottom: 0">
            报文采集已停用，新产生的网络报文将不会被记录。已保存的数据不受影响。
          </el-alert>
        </el-card>

        <!-- 设备规则 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>设备采集规则</span></div></template>
          <el-radio-group v-model="config.deviceRules.mode" @change="saveConfig" style="margin-bottom: 12px">
            <el-radio-button value="all">采集所有设备</el-radio-button>
            <el-radio-button value="whitelist">仅采集指定设备</el-radio-button>
            <el-radio-button value="blacklist">排除指定设备</el-radio-button>
          </el-radio-group>

          <template v-if="config.deviceRules.mode === 'whitelist'">
            <div class="ip-tag-area">
              <el-tag v-for="ip in config.deviceRules.whitelist" :key="ip" closable @close="removeIp('whitelist', ip)" style="margin: 2px">{{ ip }}</el-tag>
              <el-input v-model="newWhitelistIp" size="small" style="width: 160px; margin-left: 4px" placeholder="输入 IP" @keyup.enter="addIp('whitelist')" />
              <el-button size="small" type="primary" @click="addIp('whitelist')" style="margin-left: 4px">添加</el-button>
            </div>
          </template>
          <template v-if="config.deviceRules.mode === 'blacklist'">
            <div class="ip-tag-area">
              <el-tag v-for="ip in config.deviceRules.blacklist" :key="ip" closable @close="removeIp('blacklist', ip)" style="margin: 2px" type="info">{{ ip }}</el-tag>
              <el-input v-model="newBlacklistIp" size="small" style="width: 160px; margin-left: 4px" placeholder="输入 IP" @keyup.enter="addIp('blacklist')" />
              <el-button size="small" type="primary" @click="addIp('blacklist')" style="margin-left: 4px">添加</el-button>
            </div>
          </template>
        </el-card>

        <!-- 类型规则 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>数据类型保存规则</span></div></template>
          <el-table :data="typeRulesList" size="small" stripe>
            <el-table-column prop="type" label="类型" width="120">
              <template #default="{ row }"><el-tag :type="typeColor(row.type)" size="small" effect="dark">{{ row.type }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="description" label="说明" />
            <el-table-column label="保存" width="80" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" size="small" @change="saveTypeRule(row)" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 保留策略 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>数据保留策略</span><span style="font-size: 12px; color: #909399">超时自动清理</span></div></template>
          <el-table :data="retentionList" size="small" stripe>
            <el-table-column prop="type" label="类型" width="120">
              <template #default="{ row }"><el-tag :type="typeColor(row.type)" size="small">{{ row.type }}</el-tag></template>
            </el-table-column>
            <el-table-column label="保留时长" width="200">
              <template #default="{ row }">
                <el-input-number v-model="row.retentionHours" :min="0" :max="8760" :step="24" size="small" controls-position="right" style="width: 130px" />
                <span style="margin-left: 4px; font-size: 12px; color: #909399">{{ formatHours(row.retentionHours) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="saveRetention(row)">保存</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 8px; font-size: 12px; color: #909399">
            设为 0 表示永不清理。系统每 30 分钟执行一次自动清理。
          </div>
        </el-card>

        <!-- 大小过滤 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>报文大小过滤</span></div></template>
          <el-row :gutter="12" align="middle">
            <el-col :span="8">
              <span style="font-size: 13px">最小 (bytes):</span>
              <el-input-number v-model="config.sizeFilter.minSize" :min="0" :step="64" size="small" controls-position="right" style="width: 140px; margin-left: 8px" @change="saveConfig" />
            </el-col>
            <el-col :span="8">
              <span style="font-size: 13px">最大 (bytes):</span>
              <el-input-number v-model="config.sizeFilter.maxSize" :min="0" :step="512" size="small" controls-position="right" style="width: 140px; margin-left: 8px" @change="saveConfig" />
            </el-col>
            <el-col :span="8">
              <span style="font-size: 12px; color: #909399">0 = 不限制</span>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <!-- 右侧: 数据清理 & 统计 -->
      <el-col :xs="24" :lg="10">
        <!-- 数据统计 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>当前数据统计</span>
            <el-button size="small" @click="loadStats" :icon="RefreshIcon">刷新</el-button>
          </div></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="总记录数">{{ dataStats.total || 0 }}</el-descriptions-item>
            <el-descriptions-item label="明文记录">{{ dataStats.plaintext || 0 }}</el-descriptions-item>
            <el-descriptions-item label="加密记录">{{ dataStats.encrypted || 0 }}</el-descriptions-item>
            <el-descriptions-item label="数据库大小">{{ fmtSize(dbSize) }}</el-descriptions-item>
          </el-descriptions>
          <div v-if="dataStats.byType?.length" style="margin-top: 12px">
            <div style="font-size: 13px; font-weight: 500; margin-bottom: 8px">按类型分布:</div>
            <div v-for="t in dataStats.byType" :key="t.content_type" class="type-bar">
              <el-tag :type="typeColor(t.content_type)" size="small" style="width: 80px">{{ t.content_type }}</el-tag>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: typePercent(t.count) + '%' }"></div>
              </div>
              <span class="bar-count">{{ t.count }}</span>
            </div>
          </div>
        </el-card>

        <!-- 手动清理 -->
        <el-card shadow="never" class="mb-16">
          <template #header><div class="card-hd"><span>手动数据清理</span></div></template>
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">
            <template #title>清理操作不可恢复，请谨慎使用</template>
          </el-alert>
          <el-space direction="vertical" fill style="width: 100%">
            <div class="cleanup-row">
              <el-select v-model="cleanupType" size="small" style="width: 120px">
                <el-option label="全部类型" value="" />
                <el-option label="HTTP" value="HTTP" />
                <el-option label="DNS" value="DNS" />
                <el-option label="TLS" value="TLS" />
                <el-option label="Plaintext" value="Plaintext" />
              </el-select>
              <el-select v-model="cleanupBefore" size="small" style="width: 130px">
                <el-option label="1小时前" :value="1" />
                <el-option label="6小时前" :value="6" />
                <el-option label="24小时前" :value="24" />
                <el-option label="7天前" :value="168" />
              </el-select>
              <el-popconfirm title="确认清理？此操作不可恢复" @confirm="doCleanup">
                <template #reference>
                  <el-button size="small" type="danger">清理</el-button>
                </template>
              </el-popconfirm>
            </div>
            <div v-if="lastCleanupResult" style="font-size: 12px; color: #67c23a">
              已清理 {{ lastCleanupResult }} 条记录
            </div>

            <el-divider style="margin: 8px 0" />
            <div class="cleanup-row">
              <el-button size="small" type="danger" plain @click="cleanAll">清空所有报文记录</el-button>
            </div>
          </el-space>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { monitorApi } from '@/api/monitor'

const RefreshIcon = Refresh

const config = ref<any>({
  enabled: true,
  deviceRules: { mode: 'all', whitelist: [], blacklist: [] },
  typeRules: {},
  sizeFilter: { minSize: 0, maxSize: 0 },
  retention: {},
})

const newWhitelistIp = ref('')
const newBlacklistIp = ref('')
const dataStats = ref<any>({})
const dbSize = ref(0)
const cleanupType = ref('')
const cleanupBefore = ref(24)
const lastCleanupResult = ref('')

const typeRulesList = computed(() => {
  const rules = config.value.typeRules || {}
  return Object.entries(rules).map(([type, r]: [string, any]) => ({
    type, enabled: r.enabled !== false, description: r.description || type,
  }))
})

const retentionList = computed(() => {
  const ret = config.value.retention || {}
  return Object.entries(ret)
    .filter(([k]) => k !== '_default')
    .map(([type, hours]: [string, any]) => ({ type, retentionHours: hours }))
})

function typeColor(type: string) {
  const m: Record<string, string> = { HTTP: 'success', DNS: '', TLS: 'warning', Plaintext: 'info', Telnet: 'danger', FTP: 'danger', SMTP: 'warning' }
  return (m[type] || '') as any
}

function formatHours(h: number) {
  if (h === 0) return '永不清理'
  if (h < 24) return `${h} 小时`
  if (h < 168) return `${Math.round(h / 24)} 天`
  return `${Math.round(h / 168)} 周`
}

function fmtSize(b: number) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}

function typePercent(count: number) {
  const max = Math.max(...(dataStats.value.byType || []).map((t: any) => t.count), 1)
  return Math.round(count / max * 100)
}

async function loadConfig() {
  try {
    config.value = await monitorApi.getCaptureConfig()
  } catch (e) { console.error(e) }
}

async function saveConfig() {
  try {
    await monitorApi.updateCaptureConfig(config.value)
    ElMessage.success('配置已保存')
  } catch (e) { ElMessage.error('保存失败') }
}

async function saveTypeRule(row: any) {
  config.value.typeRules[row.type] = { ...config.value.typeRules[row.type], enabled: row.enabled }
  await saveConfig()
}

async function saveRetention(row: any) {
  config.value.retention[row.type] = row.retentionHours
  await saveConfig()
}

function addIp(list: 'whitelist' | 'blacklist') {
  const ip = list === 'whitelist' ? newWhitelistIp.value.trim() : newBlacklistIp.value.trim()
  if (!ip) return
  if (!config.value.deviceRules[list].includes(ip)) {
    config.value.deviceRules[list].push(ip)
    saveConfig()
  }
  if (list === 'whitelist') newWhitelistIp.value = ''
  else newBlacklistIp.value = ''
}

function removeIp(list: 'whitelist' | 'blacklist', ip: string) {
  config.value.deviceRules[list] = config.value.deviceRules[list].filter((i: string) => i !== ip)
  saveConfig()
}

async function loadStats() {
  try {
    const [stats, dbStats] = await Promise.all([
      monitorApi.getContentStats(1440),
      monitorApi.getContentList({ limit: 1 }),
    ])
    dataStats.value = stats || {}
    // Get DB size from capture stats
    const cs = await monitorApi.getCaptureStats()
    dbSize.value = (stats?.total || 0) * 500 // rough estimate
  } catch (e) { console.error(e) }
}

async function doCleanup() {
  try {
    const before = new Date(Date.now() - cleanupBefore.value * 3600 * 1000).toISOString()
    const result = await monitorApi.cleanupContent({ type: cleanupType.value || undefined, before })
    lastCleanupResult.value = result?.deleted || 0
    ElMessage.success(`已清理 ${lastCleanupResult.value} 条记录`)
    loadStats()
  } catch (e) { ElMessage.error('清理失败') }
}

async function cleanAll() {
  try {
    await ElMessageBox.confirm('确认清空所有报文记录？此操作不可恢复！', '警告', { type: 'warning' })
    const result = await monitorApi.cleanupContent({})
    lastCleanupResult.value = result?.deleted || 0
    ElMessage.success(`已清空 ${lastCleanupResult.value} 条记录`)
    loadStats()
  } catch {}
}

onMounted(() => {
  loadConfig()
  loadStats()
})
</script>

<style scoped lang="scss">
.content-management { padding: 16px; }
.mb-16 { margin-bottom: 16px; }

.card-hd {
  display: flex; justify-content: space-between; align-items: center;
  span { display: flex; align-items: center; gap: 8px; }
}

.ip-tag-area { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-top: 8px; }

.cleanup-row { display: flex; gap: 8px; align-items: center; }

.type-bar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  .bar-track { flex: 1; height: 14px; background: var(--el-fill-color-lighter); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--el-color-primary); border-radius: 3px; transition: width 0.3s; }
  .bar-count { font-size: 12px; color: var(--el-text-color-secondary); min-width: 50px; text-align: right; }
}
</style>
