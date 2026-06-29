<template>
  <div class="ip-intel">
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="4" v-for="card in statCards" :key="card.label">
        <div class="stat-card">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
      </el-col>
    </el-row>

    <el-card shadow="never" class="filter-card">
      <el-row :gutter="12" align="middle">
        <el-col :xs="24" :sm="6">
          <el-input v-model="filters.keyword" placeholder="搜索 IP / 域名 / 应用..." clearable prefix-icon="Search" @keyup.enter="loadData" @clear="loadData" />
        </el-col>
        <el-col :xs="12" :sm="4">
          <el-select v-model="filters.category" placeholder="应用分类" clearable @change="loadData">
            <el-option label="全部" value="" />
            <el-option v-for="c in stats.categories || []" :key="c.category" :label="`${c.category} (${c.count})`" :value="c.category" />
          </el-select>
        </el-col>
        <el-col :xs="12" :sm="4">
          <el-select v-model="filters.country" placeholder="国家/地区" clearable @change="loadData">
            <el-option label="全部" value="" />
            <el-option v-for="c in (stats.countries || []).slice(0, 30)" :key="c.country" :label="`${c.country} (${c.count})`" :value="c.country" />
          </el-select>
        </el-col>
        <el-col :xs="12" :sm="3">
          <el-select v-model="filters.source" placeholder="来源" clearable @change="loadData">
            <el-option label="全部" value="" />
            <el-option label="DNS" value="dns" />
            <el-option label="TLS" value="tls" />
            <el-option label="HTTP" value="http" />
            <el-option label="GeoIP" value="geoip" />
            <el-option label="手动" value="manual" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-button type="primary" @click="loadData">搜索</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="success" @click="doRefresh" :loading="refreshing">刷新</el-button>
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-hd">
          <span>IP 情报列表 ({{ total }} 条)</span>
        </div>
      </template>
      <el-table :data="records" size="small" stripe v-loading="loading" max-height="600">
        <el-table-column prop="ip" label="IP 地址" width="140" />
        <el-table-column label="关联域名" min-width="200">
          <template #default="{ row }">
            <span class="domain-list">{{ formatDomains(row.domains) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="app_name" label="应用" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.app_name" size="small" effect="plain">{{ row.app_name }}</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small" :type="catColor(row.category)">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="地区" width="160">
          <template #default="{ row }">
            <span v-if="row.country">{{ row.country }} {{ row.city ? '· ' + row.city : '' }}</span>
            <span v-else class="text-muted">未知</span>
          </template>
        </el-table-column>
        <el-table-column prop="isp" label="ISP" width="120" show-overflow-tooltip />
        <el-table-column label="最后活跃" width="150">
          <template #default="{ row }">{{ fmtTime(row.last_seen) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="editRow(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="deleteRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap">
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="loadData" />
      </div>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑 IP 情报" width="500px" destroy-on-close>
      <el-form v-if="editForm" label-width="80px" size="default">
        <el-form-item label="IP"><el-input :model-value="editForm.ip" disabled /></el-form-item>
        <el-form-item label="应用名"><el-input v-model="editForm.app_name" placeholder="如: WeChat, Bilibili" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category" clearable placeholder="选择分类" style="width:100%">
            <el-option v-for="c in allCategories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="国家"><el-input v-model="editForm.country" /></el-form-item>
        <el-form-item label="城市"><el-input v-model="editForm.city" /></el-form-item>
        <el-form-item label="ISP"><el-input v-model="editForm.isp" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { monitorApi } from '@/api/monitor'

const loading = ref(false)
const refreshing = ref(false)
const saving = ref(false)
const records = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const stats = ref<any>({})
const editVisible = ref(false)
const editForm = ref<any>(null)

const filters = ref({ keyword: '', category: '', country: '', source: '' })
const allCategories = ['社交', '视频', '搜索', '电商', '邮件', '开发', '办公', '云服务', 'CDN', '资讯', '网站', '系统', '游戏', '音乐', '金融', '出行', '教育', '健康', 'IoT', '阅读', '下载', '生活', '未知']

const statCards = computed(() => [
  { label: '总 IP 数', value: stats.value.total || 0 },
  { label: '已识别应用', value: stats.value.withApp || 0 },
  { label: '已有地理信息', value: stats.value.withGeo || 0 },
  { label: '今日新增', value: stats.value.newToday || 0 },
  { label: '国家/地区', value: (stats.value.countries || []).length },
  { label: '应用数', value: (stats.value.apps || []).length },
])

function catColor(cat: string) {
  const m: Record<string, string> = { '社交': 'success', '视频': 'danger', '搜索': 'warning', '电商': '', '邮件': 'info', '开发': '', '办公': 'warning', '云服务': '', 'CDN': 'info', '资讯': 'success', '网站': '', '系统': 'info', '未知': 'info', '游戏': 'danger', '音乐': 'success', '金融': 'warning', '出行': '', '教育': 'success', '健康': 'danger', 'IoT': 'info' }
  return (m[cat] || '') as any
}

function formatDomains(d: string | null) {
  if (!d) return '-'
  try { const arr = JSON.parse(d); return arr.slice(0, 3).join(', ') + (arr.length > 3 ? ` ...+${arr.length - 3}` : '') } catch { return d }
}

function fmtTime(ts: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function loadData() {
  loading.value = true
  try {
    const [list, st] = await Promise.all([
      monitorApi.getIpIntelList({ limit: pageSize, offset: (page.value - 1) * pageSize, ...filters.value }),
      monitorApi.getIpIntelStats()
    ])
    records.value = list?.items || []
    total.value = list?.total || 0
    stats.value = st || {}
  } catch (e: any) { ElMessage.error(e.message || '加载失败') }
  finally { loading.value = false }
}

function resetFilters() {
  filters.value = { keyword: '', category: '', country: '', source: '' }
  page.value = 1
  loadData()
}

async function doRefresh() {
  refreshing.value = true
  try {
    await monitorApi.refreshIpIntel()
    ElMessage.success('刷新完成')
    loadData()
  } catch (e: any) { ElMessage.error(e.message || '刷新失败') }
  finally { refreshing.value = false }
}

function editRow(row: any) {
  editForm.value = { ...row }
  editVisible.value = true
}

async function saveEdit() {
  if (!editForm.value) return
  saving.value = true
  try {
    await monitorApi.updateIpIntel(editForm.value.ip, {
      app_name: editForm.value.app_name || null,
      category: editForm.value.category || null,
      country: editForm.value.country || null,
      city: editForm.value.city || null,
      isp: editForm.value.isp || null,
      manual: 1
    })
    ElMessage.success('已保存')
    editVisible.value = false
    loadData()
  } catch (e: any) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

async function deleteRow(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.ip} 的情报记录？`, '确认')
  try {
    await monitorApi.deleteIpIntel(row.ip)
    ElMessage.success('已删除')
    loadData()
  } catch (e: any) { ElMessage.error(e.message || '删除失败') }
}

onMounted(() => loadData())
</script>

<style scoped lang="scss">
.ip-intel { padding: 16px; }
.stats-row { margin-bottom: 16px; }
.stat-card { background: var(--el-fill-color-light); border-radius: 8px; padding: 12px; text-align: center;
  .stat-value { font-size: 20px; font-weight: 600; color: var(--el-text-color-primary); }
  .stat-label { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
}
.filter-card { margin-bottom: 16px; }
.card-hd { display: flex; justify-content: space-between; align-items: center; }
.domain-list { font-family: monospace; font-size: 12px; color: var(--el-text-color-regular); }
.text-muted { color: var(--el-text-color-placeholder); font-size: 12px; }
.pagination-wrap { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
