import { storage } from '../storage/db.js'

// Baseline: per-device, per-hour-of-day rolling statistics
// Uses exponential weighted moving average (EWMA) for responsiveness

const MIN_SAMPLES = 3
const ALPHA = 0.3 // EWMA smoothing factor — higher = more responsive to recent changes
const Z_THRESHOLD = 2.5 // standard deviations for anomaly

storage.db.exec(`
  CREATE TABLE IF NOT EXISTS device_baselines (
    ip TEXT NOT NULL,
    hour INTEGER NOT NULL,
    conn_mean REAL DEFAULT 0,
    conn_m2 REAL DEFAULT 0,
    rx_mean REAL DEFAULT 0,
    rx_m2 REAL DEFAULT 0,
    tx_mean REAL DEFAULT 0,
    tx_m2 REAL DEFAULT 0,
    samples INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT 0,
    PRIMARY KEY (ip, hour)
  )
`)

const upsertBaseline = storage.db.prepare(`
  INSERT INTO device_baselines (ip, hour, conn_mean, conn_m2, rx_mean, rx_m2, tx_mean, tx_m2, samples, updated_at)
  VALUES (@ip, @hour, @conn_mean, @conn_m2, @rx_mean, @rx_m2, @tx_mean, @tx_m2, @samples, @updated_at)
  ON CONFLICT(ip, hour) DO UPDATE SET
    conn_mean=excluded.conn_mean, conn_m2=excluded.conn_m2,
    rx_mean=excluded.rx_mean, rx_m2=excluded.rx_m2,
    tx_mean=excluded.tx_mean, tx_m2=excluded.tx_m2,
    samples=excluded.samples, updated_at=excluded.updated_at
`)

const getBaseline = storage.db.prepare('SELECT * FROM device_baselines WHERE ip = ? AND hour = ?')
const getAllBaselines = storage.db.prepare('SELECT * FROM device_baselines')
const getHourlyDeviceTraffic = storage.db.prepare(`
  SELECT ip,
    AVG(connections) as avg_conn,
    AVG(rx_bytes) as avg_rx,
    AVG(tx_bytes) as avg_tx
  FROM device_traffic
  WHERE ts >= ? AND ts < ?
  GROUP BY ip
`)

function ewmaUpdate(oldMean, oldM2, newValue, samples) {
  // EWMA for mean
  const newMean = oldMean + ALPHA * (newValue - oldMean)
  // Approximate M2 for variance using EWMA
  const diff = newValue - newMean
  const newM2 = oldM2 * (1 - ALPHA) + ALPHA * diff * diff
  const newSamples = Math.min(samples + 1, 1000) // cap to prevent overflow
  return { mean: newMean, m2: newM2, samples: newSamples }
}

function stddev(m2, samples) {
  if (samples < MIN_SAMPLES) return Infinity
  return Math.sqrt(m2 / samples)
}

class BaselineManager {
  // Update baselines with current hourly aggregates
  updateBaselines() {
    const now = Date.now()
    const hourAgo = now - 3600 * 1000
    const currentHour = new Date().getHours()

    const rows = getHourlyDeviceTraffic.all(hourAgo, now)
    let updated = 0

    const txn = storage.db.transaction(() => {
      for (const row of rows) {
        const existing = getBaseline.get(row.ip, currentHour)

        if (!existing) {
          upsertBaseline.run({
            ip: row.ip, hour: currentHour,
            conn_mean: row.avg_conn, conn_m2: 0,
            rx_mean: row.avg_rx, rx_m2: 0,
            tx_mean: row.avg_tx, tx_m2: 0,
            samples: 1, updated_at: now,
          })
        } else {
          const conn = ewmaUpdate(existing.conn_mean, existing.conn_m2, row.avg_conn, existing.samples)
          const rx = ewmaUpdate(existing.rx_mean, existing.rx_m2, row.avg_rx, existing.samples)
          const tx = ewmaUpdate(existing.tx_mean, existing.tx_m2, row.avg_tx, existing.samples)

          upsertBaseline.run({
            ip: row.ip, hour: currentHour,
            conn_mean: conn.mean, conn_m2: conn.m2,
            rx_mean: rx.mean, rx_m2: rx.m2,
            tx_mean: tx.mean, tx_m2: tx.m2,
            samples: conn.samples, updated_at: now,
          })
        }
        updated++
      }
    })
    txn()
    return updated
  }

  // Check if a device's current metrics are anomalous for this time of day
  checkAnomaly(ip, connections, rxBytes, txBytes) {
    const hour = new Date().getHours()
    const baseline = getBaseline.get(ip, hour)
    if (!baseline || baseline.samples < MIN_SAMPLES) return null

    const anomalies = []

    const connSd = stddev(baseline.conn_m2, baseline.samples)
    if (connSd > 0 && connections > baseline.conn_mean + Z_THRESHOLD * connSd) {
      anomalies.push({
        metric: 'connections',
        current: connections,
        baseline: Math.round(baseline.conn_mean),
        stddev: Math.round(connSd),
        zScore: +((connections - baseline.conn_mean) / connSd).toFixed(1),
      })
    }

    const rxSd = stddev(baseline.rx_m2, baseline.samples)
    if (rxSd > 0 && rxBytes > baseline.rx_mean + Z_THRESHOLD * rxSd) {
      anomalies.push({
        metric: 'rx_bytes',
        current: rxBytes,
        baseline: Math.round(baseline.rx_mean),
        stddev: Math.round(rxSd),
        zScore: +((rxBytes - baseline.rx_mean) / rxSd).toFixed(1),
      })
    }

    const txSd = stddev(baseline.tx_m2, baseline.samples)
    if (txSd > 0 && txBytes > baseline.tx_mean + Z_THRESHOLD * txSd) {
      anomalies.push({
        metric: 'tx_bytes',
        current: txBytes,
        baseline: Math.round(baseline.tx_mean),
        stddev: Math.round(txSd),
        zScore: +((txBytes - baseline.tx_mean) / txSd).toFixed(1),
      })
    }

    return anomalies.length > 0 ? { ip, hour, anomalies } : null
  }

  getBaselines(ip) {
    if (ip) return getAllBaselines.all().filter(b => b.ip === ip)
    return getAllBaselines.all()
  }

  getDeviceSummary(ip) {
    const baselines = getBaseline.all?.(ip) || []
    // Get all 24 hours for this IP
    const hours = []
    for (let h = 0; h < 24; h++) {
      const b = getBaseline.get(ip, h)
      hours.push({
        hour: h,
        connections: b ? Math.round(b.conn_mean) : null,
        rx: b ? Math.round(b.rx_mean) : null,
        tx: b ? Math.round(b.tx_mean) : null,
        samples: b?.samples || 0,
      })
    }
    return hours
  }
}

export const baselineManager = new BaselineManager()
