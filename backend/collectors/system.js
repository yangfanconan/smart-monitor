import fs from 'node:fs'
import { execSync } from 'node:child_process'

export class SystemCollector {
  #prevCpu = null
  #prevDiskIO = null
  #latest = {}
  #timer = null
  #tempTimer = null
  #diskTimer = null
  #history = []
  #onUpdate = null

  start(onUpdate) {
    this.#onUpdate = onUpdate
    this.#collect()
    this.#timer = setInterval(() => this.#collect(), 2000)
    this.#collectTemp()
    this.#tempTimer = setInterval(() => this.#collectTemp(), 5000)
    this.#collectDisk()
    this.#diskTimer = setInterval(() => this.#collectDisk(), 10000)
  }

  stop() {
    clearInterval(this.#timer)
    clearInterval(this.#tempTimer)
    clearInterval(this.#diskTimer)
  }

  #readFile(path) {
    try { return fs.readFileSync(path, 'utf-8').trim() } catch { return '' }
  }

  #collect() {
    const cpu = this.#parseCpu()
    const memory = this.#parseMemory()
    const load = this.#parseLoad()
    const uptime = this.#parseUptime()

    this.#latest = { ...this.#latest, cpu: cpu.usage, cores: cpu.cores, frequencies: cpu.frequencies, memory, load, uptime, ts: Date.now() }
    this.#history.push({ ts: Date.now(), cpu: cpu.usage, memory: memory.usagePercent, load: load.load1 })
    if (this.#history.length > 1800) this.#history.shift() // ~1h at 2s

    this.#prevCpu = cpu.raw
    this.#onUpdate?.(this.#latest)
  }

  #collectTemp() {
    const temp = this.#parseTemperature()
    this.#latest = { ...this.#latest, temperature: temp, ts: Date.now() }
  }

  #collectDisk() {
    const disk = this.#parseDiskUsage()
    const diskIO = this.#parseDiskIO()
    const swap = this.#parseSwap()
    this.#latest = { ...this.#latest, disk, diskIO, swap, ts: Date.now() }
  }

  #parseCpu() {
    const stat = this.#readFile('/proc/stat')
    const line = stat.split('\n')[0] // cpu  user nice system idle iowait irq softirq steal
    const parts = line.split(/\s+/).slice(1).map(Number)
    const [user, nice, system, idle, iowait, irq, softirq, steal] = parts
    const total = user + nice + system + idle + iowait + irq + softirq + steal
    const idleTotal = idle + iowait

    let usage = 0
    if (this.#prevCpu) {
      const dTotal = total - this.#prevCpu.total
      const dIdle = idleTotal - this.#prevCpu.idle
      usage = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 10000) / 100 : 0
    }

    // Per-core stats
    const cores = []
    const lines = stat.split('\n')
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].startsWith('cpu')) break
      const p = lines[i].split(/\s+/).slice(1).map(Number)
      const t = p.reduce((a, b) => a + b, 0)
      const id = p[3] + (p[4] || 0)
      cores.push({ core: i - 1, usage: this.#prevCpu?.cores?.[i - 1] ? Math.round(((t - this.#prevCpu.cores[i - 1].total - (id - this.#prevCpu.cores[i - 1].idle)) / (t - this.#prevCpu.cores[i - 1].total)) * 10000) / 100 : 0, total: t, idle: id })
    }

    // CPU frequencies
    const freqs = []
    for (let i = 0; i < 8; i++) {
      const freq = this.#readFile(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`)
      if (freq) freqs.push({ core: i, freq: Math.round(parseInt(freq) / 1000) }) // MHz
    }

    return {
      usage,
      raw: { total, idle: idleTotal, cores },
      cores: cores.map(c => ({ core: c.core, usage: c.usage })),
      frequencies: freqs
    }
  }

  #parseMemory() {
    const meminfo = this.#readFile('/proc/meminfo')
    const get = (key) => {
      const m = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`))
      return m ? parseInt(m[1]) * 1024 : 0 // kB to bytes
    }

    const total = get('MemTotal')
    const free = get('MemFree')
    const available = get('MemAvailable')
    const buffers = get('Buffers')
    const cached = get('Cached')
    const used = total - free - buffers - cached
    const usagePercent = Math.round((used / total) * 10000) / 100

    return { total, free, available, buffers, cached, used, usagePercent }
  }

  #parseTemperature() {
    const zones = []
    for (let i = 0; i < 10; i++) {
      const tempPath = `/sys/class/thermal/thermal_zone${i}/temp`
      const typePath = `/sys/class/thermal/thermal_zone${i}/type`
      const temp = this.#readFile(tempPath)
      if (!temp) break
      const type = this.#readFile(typePath) || `zone${i}`
      zones.push({ zone: i, type, temp: parseInt(temp) / 1000 })
    }
    return zones
  }

  #parseLoad() {
    const loadavg = this.#readFile('/proc/loadavg')
    const [load1, load5, load15, running] = loadavg.split(/\s+/)
    const [runProc, totalProc] = running.split('/').map(Number)
    return { load1: parseFloat(load1), load5: parseFloat(load5), load15: parseFloat(load15), runningProcesses: runProc, totalProcesses: totalProc }
  }

  #parseUptime() {
    const uptime = this.#readFile('/proc/uptime')
    const [up] = uptime.split(/\s+/)
    return Math.round(parseFloat(up))
  }

  #parseDiskUsage() {
    try {
      const output = execSync('df -k -T 2>/dev/null', { encoding: 'utf-8', timeout: 3000 })
      const lines = output.trim().split('\n').slice(1)
      const skipFs = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'devfs', 'proc', 'sysfs', 'cgroup', 'cgroup2', 'pstore', 'debugfs', 'tracefs', 'securityfs', 'configfs', 'fusectl', 'hugetlbfs', 'mqueue', 'binfmt_misc', 'rpc_pipefs', 'nsfs'])
      const skipMount = new Set(['/rom', '/dev', '/proc', '/sys', '/dev/pts', '/dev/shm', '/run', '/sys/fs/cgroup'])
      const disks = []
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length < 7) continue
        const [filesystem, type, totalKB, usedKB, availKB, usePct, ...mountParts] = parts
        const mount = mountParts.join(' ')
        if (skipFs.has(type)) continue
        if (skipMount.has(mount)) continue
        const total = parseInt(totalKB) * 1024
        const used = parseInt(usedKB) * 1024
        const available = parseInt(availKB) * 1024
        const usagePercent = total > 0 ? Math.round((used / total) * 10000) / 100 : 0
        disks.push({ filesystem, type, mount, total, used, available, usagePercent })
      }
      return disks
    } catch { return [] }
  }

  #parseDiskIO() {
    const stat = this.#readFile('/proc/diskstats')
    if (!stat) return []
    const skipPrefix = ['loop', 'mtdblock', 'ram']
    const skipExact = new Set()
    // Skip boot partitions and sub-partitions when parent device exists
    const devices = []
    const seen = new Set()
    for (const line of stat.split('\n')) {
      const p = line.trim().split(/\s+/)
      if (p.length < 14) continue
      const name = p[2]
      if (skipPrefix.some(pr => name.startsWith(pr))) continue
      // Skip partition and boot devices (e.g. mmcblk0p1, nvme0n1p1, mmcblk0boot0)
      if (/^(mmcblk|nvme).+(p\d+|boot\d+)$/.test(name)) continue
      const reads = parseInt(p[3])
      const readSectors = parseInt(p[5])
      const writes = parseInt(p[7])
      const writeSectors = parseInt(p[9])
      const ioTime = parseInt(p[12])
      devices.push({ name, reads, readBytes: readSectors * 512, writes, writeBytes: writeSectors * 512, ioTime })
      seen.add(name)
    }
    return devices
  }

  #parseSwap() {
    const meminfo = this.#readFile('/proc/meminfo')
    const get = (key) => {
      const m = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`))
      return m ? parseInt(m[1]) * 1024 : 0
    }
    const total = get('SwapTotal')
    const free = get('SwapFree')
    const used = total - free
    const usagePercent = total > 0 ? Math.round((used / total) * 10000) / 100 : 0
    return { total, free, used, usagePercent }
  }

  getLatest() { return this.#latest }

  getCpuDetail() {
    return {
      usage: this.#latest.cpu,
      cores: this.#latest.cores || [],
      frequencies: this.#latest.frequencies || [],
      history: this.#history.map(h => ({ ts: h.ts, cpu: h.cpu }))
    }
  }

  getTemperature() { return this.#latest.temperature || [] }

  getMemoryDetail() {
    return {
      ...this.#latest.memory,
      history: this.#history.map(h => ({ ts: h.ts, memory: h.memory }))
    }
  }

  getDiskDetail() {
    return {
      disk: this.#latest.disk || [],
      diskIO: this.#latest.diskIO || [],
      swap: this.#latest.swap || { total: 0, free: 0, used: 0, usagePercent: 0 }
    }
  }
}
