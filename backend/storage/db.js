import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const DB_DIR = path.resolve(import.meta.dirname || '.', '../../data')
const DB_PATH = path.join(DB_DIR, 'monitor.db')

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS system_metrics (
    ts INTEGER PRIMARY KEY,
    cpu REAL,
    memory REAL,
    load1 REAL,
    load5 REAL,
    load15 REAL,
    temp_max REAL
  );

  CREATE TABLE IF NOT EXISTS network_metrics (
    ts INTEGER,
    iface TEXT,
    rx_bytes INTEGER,
    tx_bytes INTEGER,
    rx_speed REAL,
    tx_speed REAL,
    PRIMARY KEY (ts, iface)
  );

  CREATE TABLE IF NOT EXISTS connection_snapshots (
    ts INTEGER PRIMARY KEY,
    total INTEGER,
    tcp INTEGER,
    udp INTEGER,
    icmp INTEGER,
    unique_ips INTEGER
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER,
    level TEXT,
    type TEXT,
    title TEXT,
    message TEXT,
    src_ip TEXT,
    details TEXT,
    status TEXT DEFAULT 'unread'
  );

  CREATE TABLE IF NOT EXISTS dpi_protocols (
    ts INTEGER,
    protocol TEXT,
    count INTEGER,
    PRIMARY KEY (ts, protocol)
  );

  CREATE TABLE IF NOT EXISTS device_traffic (
    ts INTEGER,
    ip TEXT,
    mac TEXT,
    hostname TEXT,
    rx_bytes INTEGER,
    tx_bytes INTEGER,
    connections INTEGER,
    PRIMARY KEY (ts, ip)
  );

  CREATE TABLE IF NOT EXISTS device_destinations (
    ts INTEGER,
    src_ip TEXT,
    dst_ip TEXT,
    dst_port INTEGER,
    protocol TEXT,
    bytes INTEGER,
    connections INTEGER,
    PRIMARY KEY (ts, src_ip, dst_ip, dst_port, protocol)
  );

  CREATE TABLE IF NOT EXISTS content_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER,
    protocol TEXT,
    src_ip TEXT,
    dst_ip TEXT,
    src_port INTEGER,
    dst_port INTEGER,
    content_type TEXT,
    encrypted INTEGER DEFAULT 0,
    summary TEXT,
    detail TEXT,
    raw_hex TEXT,
    payload_len INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_system_ts ON system_metrics(ts);
  CREATE INDEX IF NOT EXISTS idx_network_ts ON network_metrics(ts);
  CREATE INDEX IF NOT EXISTS idx_conn_ts ON connection_snapshots(ts);
  CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
  CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
  CREATE INDEX IF NOT EXISTS idx_dpi_ts ON dpi_protocols(ts);
  CREATE INDEX IF NOT EXISTS idx_device_traffic_ts ON device_traffic(ts);
  CREATE INDEX IF NOT EXISTS idx_device_traffic_ip ON device_traffic(ip);
  CREATE INDEX IF NOT EXISTS idx_device_dest_ts ON device_destinations(ts);
  CREATE INDEX IF NOT EXISTS idx_device_dest_src ON device_destinations(src_ip);
  CREATE INDEX IF NOT EXISTS idx_content_ts ON content_records(ts);
  CREATE INDEX IF NOT EXISTS idx_content_type ON content_records(content_type);
  CREATE INDEX IF NOT EXISTS idx_content_src ON content_records(src_ip);
  CREATE INDEX IF NOT EXISTS idx_content_dst ON content_records(dst_ip);
  CREATE INDEX IF NOT EXISTS idx_content_summary ON content_records(summary);

  CREATE TABLE IF NOT EXISTS ip_knowledge (
    ip TEXT PRIMARY KEY,
    domains TEXT,
    app_name TEXT,
    category TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    isp TEXT,
    latitude REAL,
    longitude REAL,
    first_seen INTEGER,
    last_seen INTEGER,
    query_count INTEGER DEFAULT 0,
    source TEXT DEFAULT 'dns',
    manual INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_ipk_app ON ip_knowledge(app_name);
  CREATE INDEX IF NOT EXISTS idx_ipk_country ON ip_knowledge(country);
  CREATE INDEX IF NOT EXISTS idx_ipk_category ON ip_knowledge(category);
  CREATE INDEX IF NOT EXISTS idx_ipk_last_seen ON ip_knowledge(last_seen);
`)

// Migrate network_metrics table if PRIMARY KEY is wrong (ts-only instead of ts+iface)
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='network_metrics'").get()
  if (tableInfo && !tableInfo.sql.includes('PRIMARY KEY (ts, iface)')) {
    db.exec(`
      ALTER TABLE network_metrics RENAME TO network_metrics_old;
      CREATE TABLE network_metrics (
        ts INTEGER, iface TEXT, rx_bytes INTEGER, tx_bytes INTEGER, rx_speed REAL, tx_speed REAL,
        PRIMARY KEY (ts, iface)
      );
      INSERT INTO network_metrics SELECT * FROM network_metrics_old;
      DROP TABLE network_metrics_old;
      CREATE INDEX IF NOT EXISTS idx_network_ts ON network_metrics(ts);
    `)
    console.log('Migrated network_metrics table to composite PRIMARY KEY')
  }
} catch (e) {
  console.warn('network_metrics migration skipped:', e.message)
}

// Prepared statements
const insertSystem = db.prepare('INSERT OR REPLACE INTO system_metrics VALUES (?, ?, ?, ?, ?, ?, ?)')
const insertNetwork = db.prepare('INSERT OR REPLACE INTO network_metrics VALUES (?, ?, ?, ?, ?, ?)')
const insertConnection = db.prepare('INSERT OR REPLACE INTO connection_snapshots VALUES (?, ?, ?, ?, ?, ?)')
const insertAlert = db.prepare('INSERT INTO alerts (ts, level, type, title, message, src_ip, details, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const insertDpi = db.prepare('INSERT OR REPLACE INTO dpi_protocols VALUES (?, ?, ?)')
const insertDeviceTraffic = db.prepare('INSERT OR REPLACE INTO device_traffic VALUES (?, ?, ?, ?, ?, ?, ?)')
const insertDeviceDest = db.prepare('INSERT OR REPLACE INTO device_destinations VALUES (?, ?, ?, ?, ?, ?, ?)')
const insertContent = db.prepare('INSERT INTO content_records (ts, protocol, src_ip, dst_ip, src_port, dst_port, content_type, encrypted, summary, detail, raw_hex, payload_len) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')

const getSystemRange = db.prepare('SELECT * FROM system_metrics WHERE ts >= ? ORDER BY ts DESC LIMIT ?')
const getNetworkRange = db.prepare('SELECT * FROM network_metrics WHERE ts >= ? AND iface = ? ORDER BY ts DESC LIMIT ?')
const getConnectionRange = db.prepare('SELECT * FROM connection_snapshots WHERE ts >= ? ORDER BY ts DESC LIMIT ?')
const getAlerts = db.prepare('SELECT * FROM alerts ORDER BY ts DESC LIMIT ?')
const getAlertsByStatus = db.prepare('SELECT * FROM alerts WHERE status = ? ORDER BY ts DESC LIMIT ?')
const getDpiRange = db.prepare('SELECT protocol, SUM(count) as total FROM dpi_protocols WHERE ts >= ? GROUP BY protocol ORDER BY total DESC')
const getDeviceTrafficRange = db.prepare('SELECT * FROM device_traffic WHERE ts >= ? ORDER BY ts DESC')
const getDeviceTrafficByIp = db.prepare('SELECT * FROM device_traffic WHERE ip = ? AND ts >= ? ORDER BY ts DESC')
const getDeviceDestRange = db.prepare('SELECT * FROM device_destinations WHERE ts >= ? ORDER BY ts DESC')
const getDeviceDestBySrcIp = db.prepare('SELECT dst_ip, dst_port, protocol, SUM(bytes) as total_bytes, SUM(connections) as total_conns FROM device_destinations WHERE src_ip = ? AND ts >= ? GROUP BY dst_ip, dst_port, protocol ORDER BY total_bytes DESC')

// Cleanup old data
const cleanupSystem = db.prepare('DELETE FROM system_metrics WHERE ts < ?')
const cleanupNetwork = db.prepare('DELETE FROM network_metrics WHERE ts < ?')
const cleanupConnection = db.prepare('DELETE FROM connection_snapshots WHERE ts < ?')
const cleanupDpi = db.prepare('DELETE FROM dpi_protocols WHERE ts < ?')
const cleanupDeviceTraffic = db.prepare('DELETE FROM device_traffic WHERE ts < ?')
const cleanupDeviceDest = db.prepare('DELETE FROM device_destinations WHERE ts < ?')
const cleanupContent = db.prepare('DELETE FROM content_records WHERE ts < ?')

export const storage = {
  db,
  // System metrics
  saveSystemMetric(ts, cpu, memory, load1, load5, load15, tempMax) {
    insertSystem.run(ts, cpu, memory, load1, load5, load15, tempMax)
  },

  getSystemHistory(minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getSystemRange.all(since, minutes * 30).reverse()
  },

  // Network metrics
  saveNetworkMetric(ts, iface, rxBytes, txBytes, rxSpeed, txSpeed) {
    insertNetwork.run(ts, iface, rxBytes, txBytes, rxSpeed, txSpeed)
  },

  getNetworkHistory(iface, minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getNetworkRange.all(since, iface, minutes * 30).reverse()
  },

  // Connection snapshots
  saveConnectionSnapshot(ts, total, tcp, udp, icmp, uniqueIps) {
    insertConnection.run(ts, total, tcp, udp, icmp, uniqueIps)
  },

  getConnectionHistory(minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getConnectionRange.all(since, minutes * 30).reverse()
  },

  // Alerts
  saveAlert(alert) {
    insertAlert.run(alert.ts, alert.level, alert.type, alert.title, alert.message, alert.srcIp || '', JSON.stringify(alert.details || {}), alert.status || 'unread')
  },

  getAlertHistory(limit = 100, status) {
    if (status) return getAlertsByStatus.all(status, limit)
    return getAlerts.all(limit)
  },

  // DPI
  saveDpiSnapshot(ts, protocols) {
    const batch = db.transaction((items) => {
      for (const item of items) insertDpi.run(ts, item.name, item.count)
    })
    batch(protocols)
  },

  getDpiHistory(minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getDpiRange.all(since)
  },

  // Device traffic
  saveDeviceTraffic(ts, ip, mac, hostname, rxBytes, txBytes, connections) {
    insertDeviceTraffic.run(ts, ip, mac, hostname, rxBytes, txBytes, connections)
  },

  getDeviceTrafficHistory(minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getDeviceTrafficRange.all(since)
  },

  getDeviceTrafficByIp(ip, minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getDeviceTrafficByIp.all(ip, since)
  },

  // Device destinations
  saveDeviceDestination(ts, srcIp, dstIp, dstPort, protocol, bytes, connections) {
    insertDeviceDest.run(ts, srcIp, dstIp, dstPort, protocol, bytes, connections)
  },

  getDeviceDestinations(srcIp, minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    return getDeviceDestBySrcIp.all(srcIp, since)
  },

  // Content records
  saveContentRecord(ts, protocol, srcIp, dstIp, srcPort, dstPort, contentType, encrypted, summary, detail, rawHex, payloadLen) {
    insertContent.run(ts, protocol, srcIp, dstIp, srcPort, dstPort, contentType, encrypted ? 1 : 0, summary, detail, rawHex, payloadLen)
  },

  getContentRecords({ limit = 100, offset = 0, contentType, srcIp, dstIp, keyword, minutes, encrypted, minSize, maxSize } = {}) {
    let sql = 'SELECT * FROM content_records WHERE 1=1'
    const params = []

    if (minutes) { sql += ' AND ts >= ?'; params.push(Date.now() - minutes * 60 * 1000) }
    if (contentType) { sql += ' AND content_type = ?'; params.push(contentType) }
    if (srcIp) { sql += ' AND src_ip = ?'; params.push(srcIp) }
    if (dstIp) { sql += ' AND dst_ip = ?'; params.push(dstIp) }
    if (encrypted !== undefined) { sql += ' AND encrypted = ?'; params.push(encrypted ? 1 : 0) }
    if (keyword) {
      sql += ' AND (summary LIKE ? OR detail LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (minSize) { sql += ' AND payload_len >= ?'; params.push(minSize) }
    if (maxSize) { sql += ' AND payload_len <= ?'; params.push(maxSize) }

    sql += ' ORDER BY ts DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return db.prepare(sql).all(...params)
  },

  getContentRecord(id) {
    return db.prepare('SELECT * FROM content_records WHERE id = ?').get(id)
  },

  getContentStats(minutes = 60) {
    const since = Date.now() - minutes * 60 * 1000
    const byType = db.prepare('SELECT content_type, COUNT(*) as count FROM content_records WHERE ts >= ? GROUP BY content_type ORDER BY count DESC').all(since)
    const total = db.prepare('SELECT COUNT(*) as c FROM content_records WHERE ts >= ?').get(since).c
    const encrypted = db.prepare('SELECT COUNT(*) as c FROM content_records WHERE ts >= ? AND encrypted = 1').get(since).c
    const bySrcIp = db.prepare('SELECT src_ip, COUNT(*) as count FROM content_records WHERE ts >= ? GROUP BY src_ip ORDER BY count DESC LIMIT 20').all(since)
    return { total, encrypted, plaintext: total - encrypted, byType, topSources: bySrcIp }
  },

  // Cleanup
  runCleanup() {
    const hourAgo = Date.now() - 3600 * 1000

    let totalDeleted = 0
    totalDeleted += cleanupSystem.run(hourAgo).changes
    totalDeleted += cleanupNetwork.run(hourAgo).changes
    totalDeleted += cleanupConnection.run(hourAgo).changes
    totalDeleted += cleanupDpi.run(hourAgo).changes
    totalDeleted += cleanupDeviceTraffic.run(hourAgo).changes
    totalDeleted += cleanupDeviceDest.run(hourAgo).changes
    totalDeleted += cleanupContent.run(hourAgo).changes

    this._pendingDeletes = (this._pendingDeletes || 0) + totalDeleted
    console.log(`DB cleanup completed: ${totalDeleted} rows deleted`)
    return totalDeleted
  },

  // Reclaim disk space — expensive, run infrequently (daily)
  vacuum() {
    try {
      const sizeBefore = this.getDbSize()
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.exec('VACUUM')
      const sizeAfter = this.getDbSize()
      const savedMB = ((sizeBefore - sizeAfter) / 1048576).toFixed(1)
      this._pendingDeletes = 0
      this._lastVacuum = Date.now()
      console.log(`VACUUM completed: ${sizeBefore > 0 ? (sizeBefore / 1048576).toFixed(1) : '?'}MB → ${(sizeAfter / 1048576).toFixed(1)}MB (saved ${savedMB}MB)`)
      return { sizeBefore, sizeAfter, savedMB: parseFloat(savedMB) }
    } catch (e) {
      console.warn('VACUUM failed:', e.message)
      return null
    }
  },

  shouldVacuum() {
    // Vacuum if 500+ rows deleted since last vacuum, or never vacuumed and DB > 100MB
    if (this._pendingDeletes >= 500) return true
    if (!this._lastVacuum && this.getDbSize() > 100 * 1048576) return true
    return false
  },

  // Stats
  getDbSize() {
    try {
      const stat = fs.statSync(DB_PATH)
      return stat.size
    } catch { return 0 }
  },

  getTableCounts() {
    return {
      system: db.prepare('SELECT COUNT(*) as c FROM system_metrics').get().c,
      network: db.prepare('SELECT COUNT(*) as c FROM network_metrics').get().c,
      connections: db.prepare('SELECT COUNT(*) as c FROM connection_snapshots').get().c,
      alerts: db.prepare('SELECT COUNT(*) as c FROM alerts').get().c,
      dpi: db.prepare('SELECT COUNT(*) as c FROM dpi_protocols').get().c,
      deviceTraffic: db.prepare('SELECT COUNT(*) as c FROM device_traffic').get().c,
      deviceDestinations: db.prepare('SELECT COUNT(*) as c FROM device_destinations').get().c,
      contentRecords: db.prepare('SELECT COUNT(*) as c FROM content_records').get().c,
      ipKnowledge: db.prepare('SELECT COUNT(*) as c FROM ip_knowledge').get().c
    }
  },

  // IP Knowledge
  upsertIpKnowledge(ip, data) {
    db.prepare(`INSERT INTO ip_knowledge (ip, domains, app_name, category, country, region, city, isp, latitude, longitude, first_seen, last_seen, query_count, source, manual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        domains = COALESCE(excluded.domains, domains),
        app_name = COALESCE(excluded.app_name, app_name),
        category = COALESCE(excluded.category, category),
        country = COALESCE(excluded.country, country),
        region = COALESCE(excluded.region, region),
        city = COALESCE(excluded.city, city),
        isp = COALESCE(excluded.isp, isp),
        latitude = COALESCE(excluded.latitude, latitude),
        longitude = COALESCE(excluded.longitude, longitude),
        last_seen = MAX(excluded.last_seen, last_seen),
        query_count = query_count + excluded.query_count,
        source = CASE WHEN manual = 1 THEN source ELSE COALESCE(excluded.source, source) END
    `).run(ip, data.domains || null, data.app_name || null, data.category || null, data.country || null, data.region || null, data.city || null, data.isp || null, data.latitude || null, data.longitude || null, data.first_seen || Date.now(), data.last_seen || Date.now(), data.query_count || 1, data.source || 'dns', data.manual || 0)
  },

  getIpKnowledge(ip) {
    return db.prepare('SELECT * FROM ip_knowledge WHERE ip = ?').get(ip)
  },

  listIpKnowledge({ limit = 50, offset = 0, keyword, app, category, country, source } = {}) {
    let sql = 'SELECT * FROM ip_knowledge WHERE 1=1'
    const params = []
    if (keyword) { sql += ' AND (ip LIKE ? OR domains LIKE ? OR app_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
    if (app) { sql += ' AND app_name = ?'; params.push(app) }
    if (category) { sql += ' AND category = ?'; params.push(category) }
    if (country) { sql += ' AND country = ?'; params.push(country) }
    if (source) { sql += ' AND source = ?'; params.push(source) }
    sql += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return db.prepare(sql).all(...params)
  },

  countIpKnowledge({ keyword, app, category, country, source } = {}) {
    let sql = 'SELECT COUNT(*) as c FROM ip_knowledge WHERE 1=1'
    const params = []
    if (keyword) { sql += ' AND (ip LIKE ? OR domains LIKE ? OR app_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
    if (app) { sql += ' AND app_name = ?'; params.push(app) }
    if (category) { sql += ' AND category = ?'; params.push(category) }
    if (country) { sql += ' AND country = ?'; params.push(country) }
    if (source) { sql += ' AND source = ?'; params.push(source) }
    return db.prepare(sql).get(...params).c
  },

  getIpKnowledgeStats() {
    const total = db.prepare('SELECT COUNT(*) as c FROM ip_knowledge').get().c
    const withApp = db.prepare('SELECT COUNT(*) as c FROM ip_knowledge WHERE app_name IS NOT NULL').get().c
    const withGeo = db.prepare('SELECT COUNT(*) as c FROM ip_knowledge WHERE country IS NOT NULL').get().c
    const countries = db.prepare('SELECT country, COUNT(*) as count FROM ip_knowledge WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 20').all()
    const apps = db.prepare('SELECT app_name, category, COUNT(*) as count FROM ip_knowledge WHERE app_name IS NOT NULL GROUP BY app_name ORDER BY count DESC LIMIT 20').all()
    const categories = db.prepare('SELECT category, COUNT(*) as count FROM ip_knowledge WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC').all()
    const today = Date.now() - 86400000
    const newToday = db.prepare('SELECT COUNT(*) as c FROM ip_knowledge WHERE first_seen >= ?').get(today).c
    const sources = db.prepare('SELECT source, COUNT(*) as count FROM ip_knowledge GROUP BY source ORDER BY count DESC').all()
    return { total, withApp, withGeo, countries, apps, categories, newToday, sources }
  },

  getIpKnowledgeGeo() {
    return db.prepare(`SELECT ip, domains, app_name, category, country, city, latitude, longitude, query_count, last_seen
      FROM ip_knowledge WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY query_count DESC LIMIT 500`).all()
  },

  updateIpKnowledge(ip, data) {
    const sets = []; const params = []
    for (const [k, v] of Object.entries(data)) {
      if (['domains', 'app_name', 'category', 'country', 'region', 'city', 'isp', 'latitude', 'longitude', 'manual'].includes(k)) {
        sets.push(`${k} = ?`); params.push(v)
      }
    }
    if (sets.length === 0) return
    params.push(ip)
    db.prepare(`UPDATE ip_knowledge SET ${sets.join(', ')} WHERE ip = ?`).run(...params)
  },

  deleteIpKnowledge(ip) {
    db.prepare('DELETE FROM ip_knowledge WHERE ip = ?').run(ip)
  },

  close() { db.close() }
}
