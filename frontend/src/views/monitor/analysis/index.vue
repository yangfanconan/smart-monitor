<template>
  <div class="monitor-analysis">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover"><template #header><span>协议分布</span></template>
          <div ref="protoRef" style="height:260px"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover"><template #header><span>DPI 应用识别</span></template>
          <div ref="dpiRef" style="height:260px"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover"><template #header><span>Top 端口</span></template>
          <div ref="portRef" style="height:260px"></div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header><div class="card-hd"><span>活跃连接 ({{ connections.length }})</span>
            <el-input v-model="filter" placeholder="搜索 IP/端口" size="small" style="width:200px" clearable />
          </div></template>
          <el-table :data="filtered" size="small" stripe max-height="360">
            <el-table-column prop="protocol" label="协议" width="70"><template #default="{row}"><el-tag size="small" :type="row.protocol==='tcp'?'primary':row.protocol==='udp'?'success':'warning'">{{ row.protocol.toUpperCase() }}</el-tag></template></el-table-column>
            <el-table-column prop="srcIp" label="源IP" width="130" />
            <el-table-column prop="srcPort" label="源端口" width="75" />
            <el-table-column prop="dstIp" label="目标IP" width="130" />
            <el-table-column prop="dport" label="目标端口" width="90"><template #default="{row}">{{ row.dport }} <span v-if="portLabel(row.dport)" style="color:#409eff;font-size:11px">{{ portLabel(row.dport) }}</span></template></el-table-column>
            <el-table-column prop="state" label="状态" width="100" />
            <el-table-column prop="bytes" label="字节" width="90"><template #default="{row}">{{ fmtB(row.bytes) }}</template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useMonitorStore } from '@/store/monitor'
import { monitorApi } from '@/api/monitor'

const store = useMonitorStore()
const connections = computed(() => store.connections)
const filter = ref('')
const protoRef = ref<HTMLElement>()
const dpiRef = ref<HTMLElement>()
const portRef = ref<HTMLElement>()
let protoChart: echarts.ECharts|null = null
let dpiChart: echarts.ECharts|null = null
let portChart: echarts.ECharts|null = null
let timer: ReturnType<typeof setInterval>|null = null

const portLabels: Record<number,string> = {22:'SSH',53:'DNS',80:'HTTP',443:'HTTPS',8080:'HTTP-Alt',25:'SMTP',110:'POP3',143:'IMAP',3306:'MySQL'}
function portLabel(p:number){return portLabels[p]||''}
function fmtB(b:number){if(!b)return'0 B';const k=1024,s=['B','KB','MB','GB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}

const filtered = computed(() => {
  if (!filter.value) return connections.value.slice(0,200)
  const f = filter.value.toLowerCase()
  return connections.value.filter((c:any) => c.srcIp?.includes(f)||c.dstIp?.includes(f)||String(c.dport).includes(f)).slice(0,200)
})

async function updateCharts() {
  const proto = store.protocols
  if (protoChart && proto?.protocols?.length) {
    protoChart.setOption({ tooltip:{trigger:'item'}, series:[{type:'pie',radius:['35%','65%'],data:proto.protocols.map((p:any)=>({name:p.name.toUpperCase(),value:p.count})),label:{formatter:'{b} {d}%',fontSize:11}}] })
  }
  if (portChart && proto?.topPorts?.length) {
    const top = proto.topPorts.slice(0,10)
    portChart.setOption({ tooltip:{trigger:'axis'}, grid:{top:8,right:8,bottom:35,left:40}, xAxis:{type:'category',data:top.map((p:any)=>p.label?`${p.port}(${p.label})`:String(p.port)),axisLabel:{rotate:25,fontSize:10}}, yAxis:{type:'value'}, series:[{type:'bar',data:top.map((p:any)=>p.count),itemStyle:{color:'#409eff'},barWidth:'55%'}] })
  }
  // DPI
  try {
    const dpi = await monitorApi.getDpiProtocols() as any
    if (dpiChart) {
      if (dpi?.length) {
        const top = dpi.slice(0,10)
        dpiChart.setOption({ tooltip:{trigger:'item'}, series:[{type:'pie',radius:['35%','65%'],data:top.map((p:any)=>({name:p.name,value:p.count})),label:{formatter:'{b} {d}%',fontSize:11}}] })
      } else {
        dpiChart.setOption({ title:{text:'暂无数据',left:'center',top:'center',textStyle:{color:'#909399',fontSize:14}}, series:[] })
      }
    }
  } catch {}
}

onMounted(async () => {
  await nextTick()
  if (protoRef.value) protoChart = echarts.init(protoRef.value)
  if (dpiRef.value) dpiChart = echarts.init(dpiRef.value)
  if (portRef.value) portChart = echarts.init(portRef.value)
  await updateCharts()
  timer = setInterval(updateCharts, 8000)
})
onUnmounted(() => { if(timer)clearInterval(timer); protoChart?.dispose(); dpiChart?.dispose(); portChart?.dispose() })
</script>
<style scoped>
.monitor-analysis{padding:16px}
.card-hd{display:flex;justify-content:space-between;align-items:center}
</style>
