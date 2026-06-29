import { ref, watch } from 'vue'

export interface WidgetDef {
  id: string
  label: string
  icon: string
  enabled: boolean
  row: number // layout row index
}

const STORAGE_KEY = 'smart-monitor-dashboard-layout'

const DEFAULT_WIDGETS: WidgetDef[] = [
  { id: 'overview',    label: '概览卡片',   icon: 'DataBoard',  enabled: true, row: 0 },
  { id: 'bandwidth',   label: '实时带宽',   icon: 'TrendCharts', enabled: true, row: 1 },
  { id: 'protocols',   label: '协议分布',   icon: 'PieChart',   enabled: true, row: 1 },
  { id: 'devices',     label: '在线设备',   icon: 'Monitor',    enabled: true, row: 2 },
  { id: 'alerts',      label: '最新告警',   icon: 'Bell',       enabled: true, row: 2 },
  { id: 'temperature', label: '温度传感器', icon: 'Sunny',      enabled: true, row: 3 },
]

function loadConfig(): WidgetDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as WidgetDef[]
      // Merge with defaults — add any new widgets not in saved config
      const ids = new Set(saved.map(w => w.id))
      for (const def of DEFAULT_WIDGETS) {
        if (!ids.has(def.id)) saved.push(def)
      }
      return saved
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS.map(w => ({ ...w }))
}

function saveConfig(widgets: WidgetDef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
}

// Singleton reactive state
const widgets = ref<WidgetDef[]>(loadConfig())

// Auto-persist on change
watch(widgets, (val) => saveConfig(val), { deep: true })

export function useDashboardConfig() {
  const isVisible = (id: string) => widgets.value.find(w => w.id === id)?.enabled ?? true

  const getRowWidgets = (row: number) =>
    widgets.value.filter(w => w.row === row && w.enabled)

  const toggleWidget = (id: string) => {
    const w = widgets.value.find(w => w.id === id)
    if (w) w.enabled = !w.enabled
  }

  const moveWidget = (id: string, direction: 'up' | 'down') => {
    const w = widgets.value.find(w => w.id === id)
    if (!w) return
    if (direction === 'up' && w.row > 0) w.row--
    if (direction === 'down' && w.row < 5) w.row++
  }

  const resetLayout = () => {
    widgets.value = DEFAULT_WIDGETS.map(w => ({ ...w }))
  }

  return {
    widgets,
    isVisible,
    getRowWidgets,
    toggleWidget,
    moveWidget,
    resetLayout,
  }
}
