#!/bin/sh
# Smart Monitor - OpenWrt/ImmortalWrt Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/yangfanconan/smart-monitor/main/install.sh | sh
#   or:  ./install.sh [source_dir]

set -e

APP_NAME="smart-monitor"
APP_DIR="/usr/share/$APP_NAME"
INIT_SCRIPT="/etc/init.d/$APP_NAME"
CONFIG_DIR="/etc/$APP_NAME"
LOG_FILE="/var/log/$APP_NAME.log"
SERVICE_PORT=8080

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Source directory (for local install)
SRC_DIR="${1:-}"

check_prereqs() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js not found. Install it first:"
        echo "  opkg update && opkg install node"
        echo "  Or download from https://nodejs.org"
        exit 1
    fi

    NODE_VER=$(node -v | sed 's/v//;s/\..*//')
    if [ "$NODE_VER" -lt 20 ]; then
        log_error "Node.js >= 20 required (found $(node -v))"
        exit 1
    fi
    log_info "Node.js $(node -v) OK"

    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        log_error "npm not found. Install it:"
        echo "  opkg install npm"
        exit 1
    fi
    log_info "npm $(npm -v) OK"

    # Check tcpdump (optional, for packet capture)
    if ! command -v tcpdump >/dev/null 2>&1; then
        log_warn "tcpdump not found. Packet capture will be disabled."
        log_warn "Install with: opkg install tcpdump"
    fi
}

install_files() {
    log_info "Installing files..."

    # Create directories
    mkdir -p "$APP_DIR" "$CONFIG_DIR"

    if [ -n "$SRC_DIR" ] && [ -d "$SRC_DIR" ]; then
        # Local install from source directory
        log_info "Installing from: $SRC_DIR"

        # Copy backend
        cp -r "$SRC_DIR/backend" "$APP_DIR/"

        # Copy frontend dist
        if [ -d "$SRC_DIR/frontend/dist" ]; then
            cp -r "$SRC_DIR/frontend/dist" "$APP_DIR/frontend/"
        else
            log_warn "Frontend dist not found. Build it first: cd frontend && npm run build"
        fi

        # Copy config (preserve existing)
        if [ -f "$SRC_DIR/config.json" ]; then
            if [ -f "$CONFIG_DIR/config.json" ]; then
                log_info "Config exists, keeping current version"
            else
                cp "$SRC_DIR/config.json" "$CONFIG_DIR/config.json"
            fi
        fi

        # Copy init script
        if [ -f "$SRC_DIR/smart-monitor.init" ]; then
            cp "$SRC_DIR/smart-monitor.init" "$INIT_SCRIPT"
            chmod +x "$INIT_SCRIPT"
        fi
    else
        # Download latest release from GitHub
        log_info "Downloading latest release from GitHub..."
        TMPDIR=$(mktemp -d)

        # Download source
        curl -fsSL "https://github.com/yangfanconan/smart-monitor/archive/refs/heads/main.tar.gz" \
            -o "$TMPDIR/smart-monitor.tar.gz" || {
            log_error "Failed to download. Check your internet connection."
            rm -rf "$TMPDIR"
            exit 1
        }

        tar xzf "$TMPDIR/smart-monitor.tar.gz" -C "$TMPDIR"
        SRC_DIR="$TMPDIR/smart-monitor-main"

        # Install backend
        cp -r "$SRC_DIR/backend" "$APP_DIR/"

        # Install frontend (pre-built dist from release)
        if [ -d "$SRC_DIR/frontend/dist" ]; then
            cp -r "$SRC_DIR/frontend/dist" "$APP_DIR/frontend/"
        fi

        # Install config
        if [ ! -f "$CONFIG_DIR/config.json" ] && [ -f "$SRC_DIR/config.json" ]; then
            cp "$SRC_DIR/config.json" "$CONFIG_DIR/config.json"
        fi

        # Install init script
        if [ -f "$SRC_DIR/smart-monitor.init" ]; then
            cp "$SRC_DIR/smart-monitor.init" "$INIT_SCRIPT"
            chmod +x "$INIT_SCRIPT"
        fi

        rm -rf "$TMPDIR"
    fi

    # Update server.js to use config from /etc/smart-monitor/
    # (The server already reads from ../config.json relative to backend/)
    # Create a symlink so it finds the config
    ln -sf "$CONFIG_DIR/config.json" "$APP_DIR/config.json" 2>/dev/null || true

    log_info "Files installed to $APP_DIR"
}

install_deps() {
    log_info "Installing Node.js dependencies..."
    cd "$APP_DIR/backend"

    # Install npm dependencies
    npm install --production 2>&1 | tail -3

    log_info "Dependencies installed"
}

configure_firewall() {
    log_info "Configuring firewall..."

    # Check if uci is available (OpenWrt firewall)
    if command -v uci >/dev/null 2>&1; then
        # Add firewall rule for the web UI port
        uci get firewall.smart_monitor >/dev/null 2>&1 || {
            uci set firewall.smart_monitor=rule
            uci set firewall.smart_monitor.name='Allow Smart Monitor'
            uci set firewall.smart_monitor.src='lan'
            uci set firewall.smart_monitor.dest_port="$SERVICE_PORT"
            uci set firewall.smart_monitor.proto='tcp'
            uci set firewall.smart_monitor.target='ACCEPT'
            uci commit firewall
            /etc/init.d/firewall restart 2>/dev/null || true
            log_info "Firewall rule added for port $SERVICE_PORT"
        }
    else
        log_warn "uci not found. You may need to manually open port $SERVICE_PORT"
    fi
}

enable_service() {
    log_info "Enabling service..."

    if [ -x "$INIT_SCRIPT" ]; then
        "$INIT_SCRIPT" enable 2>/dev/null || true
        log_info "Service enabled (starts on boot)"
    else
        log_warn "Init script not found. Service won't auto-start."
    fi
}

start_service() {
    log_info "Starting Smart Monitor..."

    if [ -x "$INIT_SCRIPT" ]; then
        "$INIT_SCRIPT" restart
        sleep 2

        # Check if running
        if ps w 2>/dev/null | grep "node.*server.js" | grep -v grep >/dev/null; then
            log_info "Smart Monitor started successfully!"
        else
            log_error "Service failed to start. Check logs:"
            echo "  tail -20 $LOG_FILE"
            exit 1
        fi
    else
        log_warn "Init script not found. Start manually:"
        echo "  cd $APP_DIR/backend && node server.js &"
    fi
}

print_summary() {
    echo ""
    echo "========================================"
    echo "  Smart Monitor installed successfully!"
    echo "========================================"
    echo ""
    echo "  Web UI:  http://$(uci get network.lan.ipaddr 2>/dev/null || hostname -i 2>/dev/null || echo '<router-ip>'):$SERVICE_PORT"
    echo "  Config:  $CONFIG_DIR/config.json"
    echo "  Logs:    $LOG_FILE"
    echo "  App Dir: $APP_DIR"
    echo ""
    echo "  Default login: admin / 123456"
    echo "  (Change password after first login!)"
    echo ""
    echo "  Commands:"
    echo "    $INIT_SCRIPT start    # Start service"
    echo "    $INIT_SCRIPT stop     # Stop service"
    echo "    $INIT_SCRIPT restart  # Restart service"
    echo "    $INIT_SCRIPT enable   # Auto-start on boot"
    echo ""
    echo "  Uninstall:"
    echo "    $INIT_SCRIPT stop && $INIT_SCRIPT disable"
    echo "    rm -rf $APP_DIR $CONFIG_DIR $INIT_SCRIPT $LOG_FILE"
    echo ""
}

# --- Main ---
echo ""
echo "  Smart Monitor - OpenWrt Installer"
echo "  ================================="
echo ""

check_prereqs
install_files
install_deps
configure_firewall
enable_service
start_service
print_summary
