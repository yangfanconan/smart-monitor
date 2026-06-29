#!/bin/sh
# Build .ipk package for Smart Monitor
# Usage: ./build-ipk.sh [version]

set -e

VERSION="${1:-1.0.0}"
PKG_NAME="smart-monitor"
PKG_FILE="${PKG_NAME}_${VERSION}_all.ipk"
BUILD_DIR="/tmp/${PKG_NAME}-build"
ARCH="all"

echo "Building $PKG_FILE..."

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Create package structure
mkdir -p "$BUILD_DIR/data/usr/share/$PKG_NAME"
mkdir -p "$BUILD_DIR/data/etc/$PKG_NAME"
mkdir -p "$BUILD_DIR/data/etc/init.d"
mkdir -p "$BUILD_DIR/control"

# Copy application files
echo "Copying application files..."
cp -r backend "$BUILD_DIR/data/usr/share/$PKG_NAME/"
cp -r frontend/dist "$BUILD_DIR/data/usr/share/$PKG_NAME/frontend/" 2>/dev/null || echo "Warning: frontend/dist not found"
cp config.json "$BUILD_DIR/data/etc/$PKG_NAME/config.json"
cp smart-monitor.init "$BUILD_DIR/data/etc/init.d/$PKG_NAME"
chmod +x "$BUILD_DIR/data/etc/init.d/$PKG_NAME"

# Create config symlink
ln -sf "/etc/$PKG_NAME/config.json" "$BUILD_DIR/data/usr/share/$PKG_NAME/config.json"

# Calculate installed size (in KB)
INSTALLED_SIZE=$(du -sk "$BUILD_DIR/data" | cut -f1)

# Create control file
cat > "$BUILD_DIR/control/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Architecture: $ARCH
Maintainer: yangfanconan
Depends: node, npm, tcpdump
Source: https://github.com/yangfanconan/smart-monitor
Description: Smart Monitor - Network Intelligence Monitoring System
 A full-stack intelligent network monitoring system for OpenWrt/ImmortalWrt routers.
 Features real-time traffic monitoring, deep packet inspection, threat detection,
 anomaly detection with dynamic baselines, and multi-channel alert notifications.
Installed-Size: $INSTALLED_SIZE
EOF

# Create postinst script
cat > "$BUILD_DIR/control/postinst" <<'EOF'
#!/bin/sh
set -e

echo "Installing Node.js dependencies..."
cd /usr/share/smart-monitor/backend
npm install --production 2>&1 | tail -5

# Enable service
/etc/init.d/smart-monitor enable 2>/dev/null || true

echo ""
echo "========================================"
echo "  Smart Monitor installed successfully!"
echo "========================================"
echo ""
echo "  Web UI:  http://<router-ip>:8080"
echo "  Config:  /etc/smart-monitor/config.json"
echo "  Logs:    /var/log/smart-monitor.log"
echo ""
echo "  Default login: admin / 123456"
echo "  (Change password after first login!)"
echo ""
echo "  Start service: /etc/init.d/smart-monitor start"
echo ""

exit 0
EOF
chmod +x "$BUILD_DIR/control/postinst"

# Create prerm script
cat > "$BUILD_DIR/control/prerm" <<'EOF'
#!/bin/sh
set -e

# Stop service before removal
/etc/init.d/smart-monitor stop 2>/dev/null || true
/etc/init.d/smart-monitor disable 2>/dev/null || true

exit 0
EOF
chmod +x "$BUILD_DIR/control/prerm"

# Create debian-binary
echo "2.0" > "$BUILD_DIR/debian-binary"

# Create control.tar.gz
cd "$BUILD_DIR/control"
tar czf "$BUILD_DIR/control.tar.gz" .
cd "$BUILD_DIR"

# Create data.tar.gz
cd "$BUILD_DIR/data"
tar czf "$BUILD_DIR/data.tar.gz" .
cd "$BUILD_DIR"

# Create .ipk (ar archive)
cd "$BUILD_DIR"
ar rc "$PKG_FILE" debian-binary control.tar.gz data.tar.gz

# Copy to output
cp "$PKG_FILE" /root/smart-monitor/
echo ""
echo "Package built: /root/smart-monitor/$PKG_FILE"
echo "Size: $(ls -lh "$PKG_FILE" | awk '{print $5}')"
echo ""
echo "Install with: opkg install $PKG_FILE"
echo ""

# Cleanup
cd /root/smart-monitor
rm -rf "$BUILD_DIR"
