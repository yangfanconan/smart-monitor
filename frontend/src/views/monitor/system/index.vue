<template>
  <div class="monitor-system">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>CPU 各核心</span></template>
          <el-table :data="cpuDetail.cores || []" size="small" stripe>
            <el-table-column prop="core" label="核心" width="80"><template #default="{row}">Core {{ row.core }}</template></el-table-column>
            <el-table-column label="使用率"><template #default="{row}"><el-progress :percentage="row.usage" :stroke-width="8" :color="row.usage>80?'#f56c6c':row.usage>50?'#e6a23c':'#409eff'" /></template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>CPU 频率</span></template>
          <el-table :data="cpuDetail.frequencies || []" size="small" stripe>
            <el-table-column prop="core" label="核心" width="80" />
            <el-table-column label="频率"><template #default="{row}">{{ row.freq }} MHz</template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>内存分布</span></template>
          <div ref="memRef" style="height:260px"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>温度</span></template>
          <div ref="tempRef" style="height:260px"></div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>磁盘用量</span></template>
          <el-table :data="diskInfo.disk || []" size="small" stripe>
            <el-table-column prop="mount" label="挂载点" width="120" />
            <el-table-column prop="type" label="类型" width="70" />
            <el-table-column label="已用 / 总量"><template #default="{row}">{{ fmtB(row.used) }} / {{ fmtB(row.total) }}</template></el-table-column>
            <el-table-column label="使用率" width="160"><template #default="{row}"><el-progress :percentage="row.usagePercent" :stroke-width="8" :color="row.usagePercent>80?'#f56c6c':row.usagePercent>50?'#e6a23c':'#409eff'" /></template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>磁盘 I/O</span></template>
          <el-table :data="diskInfo.diskIO || []" size="small" stripe>
            <el-table-column prop="name" label="设备" width="110" />
            <el-table-column label="读取"><template #default="{row}">{{ fmtB(row.readBytes) }}</template></el-table-column>
            <el-table-column label="写入"><template #default="{row}">{{ fmtB(row.writeBytes) }}</template></el-table-column>
            <el-table-column label="读/写次数" width="120"><template #default="{row}">{{ row.reads }} / {{ row.writes }}</template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>网络接口</span></template>
          <el-table :data="netInterfaces" size="small" stripe>
            <el-table-column prop="name" label="接口" width="110" />
            <el-table-column label="RX 速率"><template #default="{row}">{{ fmtSpeed(row.rxSpeed) }}</template></el-table-column>
            <el-table-column label="TX 速率"><template #default="{row}">{{ fmtSpeed(row.txSpeed) }}</template></el-table-column>
            <el-table-column label="RX 总量"><template #default="{row}">{{ fmtB(row.rxTotal) }}</template></el-table-column>
            <el-table-column label="TX 总量"><template #default="{row}">{{ fmtB(row.txTotal) }}</template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover"><template #header><span>系统信息</span></template>
          <div class="sys-info">
            <div class="sys-info-item"><span class="label">运行时间</span><span class="value">{{ formatUptime(store.system.uptime) }}</span></div>
            <div class="sys-info-item"><span class="label">负载 (1/5/15)</span><span class="value">{{ store.system.load?.load1?.toFixed(2) }} / {{ store.system.load?.load5?.toFixed(2) }} / {{ store.system.load?.load15?.toFixed(2) }}</span></div>
            <div class="sys-info-item"><span class="label">进程数</span><span class="value">{{ store.system.load?.runningProcesses }} / {{ store.system.load?.totalProcesses }}</span></div>
            <div class="sys-info-item"><span class="label">Swap 使用</span><span class="value">{{ fmtB(diskInfo.swap?.used || 0) }} / {{ fmtB(diskInfo.swap?.total || 0) }} ({{ (diskInfo.swap?.usagePercent || 0).toFixed(1) }}%)</span></div>
            <div class="sys-info-item"><span class="label">内存使用</span><span class="value">{{ fmtB(store.system.memory?.used || 0) }} / {{ fmtB(store.system.memory?.total || 0) }} ({{ (store.system.memory?.usagePercent || 0).toFixed(1) }}%)</span></div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useMonitorStore } from '@/store/monitor'
import { monitorApi } from '@/api/monitor'

const store = useMonitorStore()
const cpuDetail = ref<any>({})
const diskInfo = ref<any>({ disk: [], diskIO: [], swap: {} })
const memRef = ref<HTMLElement>()
const tempRef = ref<HTMLElement>()
let memChart: echarts.ECharts | null = null
let tempChart: echarts.ECharts | null = null
let timer: ReturnType<typeof setInterval> | null = null

const netInterfaces = ref<any[]>([])

function fmtB(b: number) { if (!b) return '0 B'; const k=1024,s=['B','KB','MB','GB','TB']; const i=Math.max(0,Math.min(Math.floor(Math.log(b)/Math.log(k)),s.length-1)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i] }
function fmtSpeed(bps: number) { if (!bps) return '0 B/s'; const k=1024,s=['B/s','KB/s','MB/s','GB/s']; const i=Math.max(0,Math.min(Math.floor(Math.log(bps)/Math.log(k)),s.length-1)); return (bps/Math.pow(k,i)).toFixed(1)+' '+s[i] }
function formatUptime(sec: number) {
  if (!sec) return '-'
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  return (d > 0 ? d + '天 ' : '') + h + '小时 ' + m + '分钟'
}

function updateNetInterfaces() {
  const ifaces = store.network?.interfaces
  if (!ifaces) return
  netInterfaces.value = ifaces.map((i: any) => ({
    name: i.name,
    rxSpeed: i.rxSpeed || 0,
    txSpeed: i.txSpeed || 0,
    rxTotal: i.rx?.bytes || 0,
    txTotal: i.tx?.bytes || 0
  }))
}

async function refresh() {
  cpuDetail.value = await monitorApi.getCpuDetail()
  try { diskInfo.value = await monitorApi.getSystemDisk() } catch {}
  updateNetInterfaces()
  if (memChart && store.system.memory) {
    const m = store.system.memory
    memChart.setOption({ tooltip:{trigger:'item',formatter:(p:any)=>`${p.name}: ${fmtB(p.value)}`}, series:[{type:'pie',radius:['40%','65%'],data:[{name:'已用',value:m.used||0,itemStyle:{color:'#409eff'}},{name:'缓存',value:(m.cached||0)+(m.buffers||0),itemStyle:{color:'#e6a23c'}},{name:'空闲',value:m.free||0,itemStyle:{color:'#67c23a'}}],label:{formatter:(p:any)=>`${p.name}\n${fmtB(p.value)}`}}] })
  }
  if (tempChart && store.system.temperature?.length) {
    const t = store.system.temperature
    const temps = t.map((x:any)=>x.temp)
    const tMin = Math.floor(Math.min(...temps)/5)*5-5
    const tMax = Math.ceil(Math.max(...temps)/5)*5+5
    tempChart.setOption({ tooltip:{trigger:'axis'}, grid:{top:8,right:10,bottom:35,left:45}, xAxis:{type:'category',data:t.map((x:any)=>x.type.replace('-thermal','')),axisLabel:{rotate:20,fontSize:10}}, yAxis:{type:'value',min:tMin,max:tMax,axisLabel:{formatter:'{value}°C'}}, series:[{type:'bar',data:t.map((x:any)=>({value:x.temp.toFixed(1),itemStyle:{color:x.temp>80?'#f56c6c':x.temp>60?'#e6a23c':'#67c23a'}})),barWidth:'50%',label:{show:true,position:'top',formatter:'{c}°C',fontSize:10}}] })
  }
}

onMounted(async () => {
  if (memRef.value) memChart = echarts.init(memRef.value)
  if (tempRef.value) tempChart = echarts.init(tempRef.value)
  await refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => { if(timer)clearInterval(timer); memChart?.dispose(); tempChart?.dispose() })
</script>
<style scoped>
.monitor-system{padding:16px}
.sys-info{display:flex;flex-direction:column;gap:16px;padding:8px 0}
.sys-info-item{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--el-fill-color-lighter, #f5f7fa);border-radius:6px}
.sys-info-item .label{font-size:13px;color:var(--el-text-color-secondary, #909399)}
.sys-info-item .value{font-size:14px;font-weight:500;color:var(--el-text-color-primary, #303133)}
</style>
