#!/bin/sh
# Smart Monitor Watchdog
# - Checks process liveness
# - HTTP health probe
# - Auto-restart on failure
# - Simple log rotation

BASE_DIR="/root/smart-monitor"
LOG_FILE="/var/log/smart-monitor.log"
MAX_LOG_SIZE=524288  # 512KB
HEALTH_URL="http://127.0.0.1:8080/api/health"
HEALTH_TIMEOUT=10
INIT_SCRIPT="/etc/init.d/smart-monitor"
STATE_FILE="/tmp/smart-monitor-watchdog.state"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$size" -gt "$MAX_LOG_SIZE" ]; then
            # Keep last 1000 lines
            tail -1000 "$LOG_FILE" > "${LOG_FILE}.tmp"
            mv "${LOG_FILE}.tmp" "$LOG_FILE"
            log "Log rotated (was ${size} bytes)"
        fi
    fi
}

check_process() {
    ps w 2>/dev/null | grep "node.*server.js" | grep -v grep | head -1 > /dev/null
}

check_health() {
    resp=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL" 2>/dev/null)
    [ "$resp" = "200" ]
}

restart_service() {
    log "Watchdog: restarting service (reason: $1)"
    restarted=0

    # Try procd init script first
    if [ -x "$INIT_SCRIPT" ]; then
        "$INIT_SCRIPT" restart >> "$LOG_FILE" 2>&1
        sleep 3
        if check_process && check_health; then
            restarted=1
        fi
    fi

    # Fallback: direct restart
    if [ "$restarted" = "0" ]; then
        log "Watchdog: init script failed, doing direct restart"
        pkill -f "node.*server.js" 2>/dev/null
        sleep 2
        cd "$BASE_DIR/backend" && /root/node-v22.23.1-linux-arm64-musl/bin/node server.js >> "$LOG_FILE" 2>&1 &
        sleep 3
        if check_process; then
            log "Watchdog: direct restart succeeded"
        else
            log "Watchdog: ERROR - restart failed!"
        fi
    fi

    # Record restart timestamp
    echo "$(date +%s)" > "$STATE_FILE"
}

# --- Main ---

# Log rotation on every run
rotate_log

# Check 1: Is the process alive?
if ! check_process; then
    log "Watchdog: process not found"
    restart_service "process_dead"
    exit 0
fi

# Check 2: Is it responding?
if ! check_health; then
    # Give it a second chance (might be busy with GC or heavy load)
    sleep 3
    if ! check_health; then
        log "Watchdog: health check failed twice"
        restart_service "health_check_failed"
        exit 0
    fi
fi

# All good — check if we should log recovery
if [ -f "$STATE_FILE" ]; then
    last_restart=$(cat "$STATE_FILE")
    now=$(date +%s)
    elapsed=$((now - last_restart))
    if [ "$elapsed" -gt 300 ]; then
        log "Watchdog: service healthy (last restart ${elapsed}s ago)"
        rm -f "$STATE_FILE"
    fi
fi
