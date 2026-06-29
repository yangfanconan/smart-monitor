<template>
  <div class="monitor-network">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8" v-for="iface in keyIfaces" :key="iface.name">
        <el-card shadow="hover" class="iface-card">
          <div class="iface-hd"><el-tag size="small">{{ iface.name }}</el-tag><span class="label">{{ ifaceLabel(iface.name) }}</span></div>
          <div class="speeds">
            <div><span class="lbl">↓ 下载</span><span class="val rx">{{ fmtSpd(iface.rxSpeed) }}</span></div>
            <div><span class="lbl">↑ 上传</span><span class="val tx">{{ fmtSpd(iface.txSpeed) }}</span></div>
          </div>
          <div class="total">总: ↓{{ fmtB(iface.rx.bytes) }} / ↑{{ fmtB(iface.tx.bytes) }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="24">
        <el-card shadow="hover"><template #header><span>所有接口</span></template>
          <el-table :data="network.interfaces||[]" size="small" stripe>
            <el-table-column prop="name" label="接口" width="100" />
            <el-table-column label="↓速度" width="120"><template #default="{row}">{{ fmtSpd(row.rxSpeed) }}</template></el-table-column>
            <el-table-column label="↑速度" width="120"><template #default="{row}">{{ fmtSpd(row.txSpeed) }}</template></el-table-column>
            <el-table-column label="总接收" width="120"><template #default="{row}">{{ fmtB(row.rx.bytes) }}</template></el-table-column>
            <el-table-column label="总发送" width="120"><template #default="{row}">{{ fmtB(row.tx.bytes) }}</template></el-table-column>
            <el-table-column label="错误/丢包" width="120"><template #default="{row}">{{ row.rx.errors+row.tx.errors }} / {{ row.rx.drop+row.tx.drop }}</template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMonitorStore } from '@/store/monitor'
const store = useMonitorStore()
const network = computed(() => store.network)
const keyIfaces = computed(() => {
  const ifaces = network.value.interfaces || []
  const uplinkName = network.value.summary?.uplink?.name || 'usb0'
  const names = ['eth0', uplinkName, 'br-lan', 'phy0-ap0']
  return ifaces.filter((i: any) => names.includes(i.name))
})
function ifaceLabel(n: string) {
  const uplinkName = network.value.summary?.uplink?.name || 'usb0'
  const labels: Record<string, string> = { eth0: 'LAN', 'br-lan': '局域网桥', 'phy0-ap0': 'WiFi' }
  labels[uplinkName] = '上行'
  return labels[n] || n
}
function fmtB(b:number){if(!b)return'0 B';const k=1024,s=['B','KB','MB','GB','TB'];const i=Math.max(0,Math.min(Math.floor(Math.log(b)/Math.log(k)),s.length-1));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i]}
function fmtSpd(b:number){return fmtB(b)+'/s'}
</script>
<style scoped>
.monitor-network{padding:16px}
.iface-card{margin-bottom:0}
.iface-hd{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.label{font-weight:600}
.speeds{display:flex;gap:20px;margin-bottom:6px}
.speeds>div{display:flex;flex-direction:column}
.lbl{font-size:12px;color:#909399}
.val{font-size:18px;font-weight:700}
.rx{color:#409eff}.tx{color:#67c23a}
.total{font-size:12px;color:#909399}
</style>
