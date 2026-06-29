#
# Copyright (C) 2026 yangfanconan
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=smart-monitor
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_SOURCE:=smart-monitor-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/yangfanconan/smart-monitor/archive/refs/tags/v$(PKG_VERSION).tar.gz
PKG_HASH:=skip

PKG_MAINTAINER:=yangfanconan
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/smart-monitor
  SECTION:=admin
  CATEGORY:=Administration
  TITLE:=Smart Monitor - Network Intelligence Monitoring System
  URL:=https://github.com/yangfanconan/smart-monitor
  DEPENDS:=+node +npm +tcpdump
endef

define Package/smart-monitor/description
  A full-stack intelligent network monitoring system for OpenWrt/ImmortalWrt routers.
  Features real-time traffic monitoring, deep packet inspection, threat detection,
  anomaly detection with dynamic baselines, and multi-channel alert notifications.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
endef

define Build/Compile
	# No compilation needed - Node.js app
endef

define Package/smart-monitor/install
	$(INSTALL_DIR) $(1)/usr/share/smart-monitor
	$(INSTALL_DIR) $(1)/etc/smart-monitor
	$(INSTALL_DIR) $(1)/etc/init.d

	# Copy application files
	$(CP) $(PKG_BUILD_DIR)/backend $(1)/usr/share/smart-monitor/
	$(CP) $(PKG_BUILD_DIR)/frontend/dist $(1)/usr/share/smart-monitor/frontend/ 2>/dev/null || true

	# Copy config (default)
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/config.json $(1)/etc/smart-monitor/config.json

	# Copy init script
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/smart-monitor.init $(1)/etc/init.d/smart-monitor

	# Create symlink for config
	$(LN) /etc/smart-monitor/config.json $(1)/usr/share/smart-monitor/config.json
endef

define Package/smart-monitor/postinst
#!/bin/sh
# Install npm dependencies on target
if [ -z "$${IPKG_INSTROOT}" ]; then
    echo "Installing Node.js dependencies..."
    cd /usr/share/smart-monitor/backend
    npm install --production 2>&1 | tail -5

    # Enable service
    /etc/init.d/smart-monitor enable 2>/dev/null || true

    echo ""
    echo "Smart Monitor installed successfully!"
    echo "Access: http://<router-ip>:8080"
    echo "Default login: admin / 123456"
    echo ""
    echo "Start service: /etc/init.d/smart-monitor start"
fi
exit 0
endef

define Package/smart-monitor/prerm
#!/bin/sh
# Stop service before removal
if [ -z "$${IPKG_INSTROOT}" ]; then
    /etc/init.d/smart-monitor stop 2>/dev/null || true
    /etc/init.d/smart-monitor disable 2>/dev/null || true
fi
exit 0
endef

$(eval $(call BuildPackage,smart-monitor))
