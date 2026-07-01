# Smart Monitor / 网络智能监控系统

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-OpenWrt%20%7C%20ImmortalWrt-green.svg)](https://openwrt.org)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org)
[![Vue](https://img.shields.io/badge/vue-3-42b883.svg)](https://vuejs.org)

**English** | [中文](#中文文档)

---

A full-stack intelligent network monitoring system designed for OpenWrt/ImmortalWrt routers. Built with Node.js backend + Vue 3 frontend, running directly on ARM-based routers (RK3588 / Orange Pi 5 Plus).

## Features

### Real-time Monitoring
- **System Metrics** — CPU, memory, temperature, disk I/O with per-core breakdown
- **Network Traffic** — Per-interface bandwidth (LAN/WiFi/Uplink) with real-time charts
- **Connection Tracking** — Live conntrack analysis with protocol distribution
- **Deep Packet Inspection** — HTTP/DNS/TLS/Plaintext content capture and analysis

### Security
- **Threat Detection** — Port scan, brute force, DNS anomaly, DDoS detection
- **Anomaly Detection** — EWMA-based dynamic baselines, Z-score deviation alerts
- **IP Intelligence** — Auto-enriched IP database with geo, ISP, and app classification
- **Alert Push** — Multi-channel notifications (Telegram, WeChat, DingTalk, Webhook)

### Analytics
- **User Behavior** — Per-device traffic profiling, app/destination classification
- **Access Records** — Historical connection logs with resolved domain names
- **Device Activity** — Online/offline timeline with per-session app breakdown
- **Global Traffic Map** — Dark-themed world map showing traffic flows by country
- **Network Topology** — Force-directed graph of router → devices → external services

### Operations
- **API Authentication** — Token-based auth with refresh, WebSocket authentication
- **Process Watchdog** — procd respawn + cron health-check with auto-restart
- **Dashboard Customization** — Toggle and reorder widgets, persisted to localStorage
- **Data Management** — Configurable retention policies, periodic cleanup, SQLite VACUUM, memory leak prevention

## Screenshots

### Dashboard / 监控总览
![Dashboard](webui-image/processed/ScreenShot_2026-06-25_163126_948.png)

### System Detail / 系统详情
![System Detail](webui-image/processed/ScreenShot_2026-06-29_150932_715.png)

### Network Traffic / 网络流量
![Network Traffic](webui-image/processed/ScreenShot_2026-06-29_150939_252.png)

### Connection Analysis / 连接分析
![Connection Analysis](webui-image/processed/ScreenShot_2026-06-29_150945_842.png)

### User Traffic / 用户流量
![User Traffic](webui-image/processed/ScreenShot_2026-06-29_150952_359.png)

### Access Records / 访问记录
![Access Records](webui-image/processed/ScreenShot_2026-06-29_151006_915.png)

### Security Center / 安全中心
![Security Center](webui-image/processed/ScreenShot_2026-06-29_151014_276.png)

### Alert Center / 告警中心
![Alert Center](webui-image/processed/ScreenShot_2026-06-29_151022_308.png)

### Behavior Analysis / 行为分析
![Behavior Analysis](webui-image/processed/ScreenShot_2026-06-29_151036_870.png)

### Content Inspection / 报文检测
![Content Inspection](webui-image/processed/ScreenShot_2026-06-29_151042_489.png)

### Data Management / 数据管理
![Data Management](webui-image/processed/ScreenShot_2026-06-29_151048_937.png)

### IP Intelligence / IP 情报库
![IP Intelligence](webui-image/processed/ScreenShot_2026-06-29_151055_143.png)

### Global Traffic Map / 全球流量面板
![Global Traffic Map](webui-image/processed/ScreenShot_2026-06-29_151101_597.png)

### Network Topology / 网络拓扑
![Network Topology](webui-image/processed/ScreenShot_2026-06-29_151114_096.png)

## Architecture

```
─────────────────────────────────────────────┐
│                  Frontend (Vue 3)            │
│  Element Plus · ECharts · Pinia · TypeScript │
└──────────────────────┬──────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────┴──────────────────────┐
│               Backend (Node.js)              │
│  ┌──────────┐ ┌────────── ┌─────────────┐ │
│  │Collectors│ │Analyzers │ │  AlertMgr   │ │
│  │ System   │ │ Threat   │ │  Notifier   │ │
│  │ Network  │ │ DPI      │ │  Baseline   │ │
│  │Conntrack │ │ Anomaly  │ │             │ │
│  │  DHCP    │ │  LLM     │ │             │ │
│  └──────────┘ └──────────┘ └──────┬──────┘ │
│                                    │         │
│  ┌─────────────────────────────────┴──────┐ │
│  │          SQLite (monitor.db)            │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────
         │                          │
    ┌────┴────┐              ┌──────┴──────┐
    │conntrack│              │  tcpdump    │
    │  /proc  │              │  br-lan     │
    └─────────              └─────────────┘
```

## Quick Start

### Prerequisites
- OpenWrt / ImmortalWrt router (ARM64 recommended)
- Node.js ≥ 20
- `tcpdump` (for packet capture)
- `conntrack` tool (for connection tracking)

### Install

```bash
# Clone the project
git clone https://github.com/yangfanconan/smart-monitor.git
cd smart-monitor

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies and build
cd frontend && npm install && npm run build && cd ..

# Start the server
cd backend && node server.js
```

### Access
Open `http://<router-ip>:8080` in your browser.

**Default credentials:** `admin` / `123456` (change after first login!)

### Production (procd)
```bash
cp smart-monitor.init /etc/init.d/smart-monitor
chmod +x /etc/init.d/smart-monitor
/etc/init.d/smart-monitor enable
/etc/init.d/smart-monitor start
```

## Configuration

Edit `config.json`:

```json
{
  "port": 8080,
  "auth": { "tokenExpiry": 86400 },
  "network": {
    "uplink": "usb0",
    "lanIfaces": ["eth0", "br-lan"]
  },
  "alerts": {
    "temperature": { "critical": 85, "warning": 70 },
    "cpu": { "critical": 95, "warning": 80 },
    "memory": { "critical": 95, "warning": 80 }
  },
  "notify": {
    "channels": [
      {
        "type": "telegram",
        "enabled": true,
        "botToken": "YOUR_BOT_TOKEN",
        "chatId": "YOUR_CHAT_ID",
        "levelFilter": "warning",
        "minInterval": 60000
      }
    ]
  }
}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, TypeScript, Element Plus, ECharts, Pinia |
| Backend | Node.js (ESM), native `http`, `ws` |
| Database | SQLite (better-sqlite3) |
| Packet Capture | tcpdump (pcap parsing in pure JS) |
| Connection Tracking | `/proc/net/nf_conntrack` |
| Deployment | procd (OpenWrt init), cron watchdog |

## License

MIT

---

<a id="中文文档"></a>
# 中文文档

## 项目简介

Smart Monitor 是一个为 OpenWrt/ImmortalWrt 路由器设计的全栈智能网络监控系统。采用 Node.js 后端 + Vue 3 前端，直接运行在 ARM 架构路由器上（RK3588 / Orange Pi 5 Plus）。

## 功能特性

### 实时监控
- **系统指标** — CPU、内存、温度、磁盘 I/O，支持每核心细分
- **网络流量** — 每接口带宽（LAN/WiFi/上行）实时图表
- **连接追踪** — 实时 conntrack 分析，协议分布统计
- **深度包检测** — HTTP/DNS/TLS/明文内容捕获与分析

### 安全防护
- **威胁检测** — 端口扫描、暴力破解、DNS 异常、DDoS 检测
- **异常检测** — 基于 EWMA 的动态基线，Z-score 偏差告警
- **IP 情报** — 自动 enrich 的 IP 数据库，含地理位置、ISP、应用分类
- **告警推送** — 多渠道通知（Telegram、微信、钉钉、Webhook）

### 数据分析
- **用户行为** — 按设备流量画像，应用/目的地分类
- **访问记录** — 历史连接日志，含域名解析
- **设备活动** — 在线时间线 + 每个时段访问的应用
- **全球流量地图** — 深色主题世界地图，按国家展示流量
- **网络拓扑** — 力导向图：路由器 → 设备 → 外部服务

### 运维管理
- **API 鉴权** — Token 认证 + 刷新机制，WebSocket 鉴权
- **进程守护** — procd 崩溃重启 + cron 健康检查自动拉起
- **Dashboard 定制** — 模块开关与排序，localStorage 持久化
- **数据管理** — 可配置保留策略，手动清理，SQLite VACUUM

## 快速开始

### 环境要求
- OpenWrt / ImmortalWrt 路由器（推荐 ARM64）
- Node.js ≥ 20
- `tcpdump`（报文捕获）
- `conntrack`（连接追踪）

### 安装部署

```bash
# 克隆项目
git clone https://github.com/yangfanconan/smart-monitor.git
cd smart-monitor

# 安装后端依赖
cd backend && npm install && cd ..

# 安装前端依赖并构建
cd frontend && npm install && npm run build && cd ..

# 启动服务
cd backend && node server.js
```

### 访问
浏览器打开 `http://<路由器IP>:8080`

**默认账号：** `admin` / `123456`（首次登录后请修改密码！）

### 生产部署（procd）
```bash
cp smart-monitor.init /etc/init.d/smart-monitor
chmod +x /etc/init.d/smart-monitor
/etc/init.d/smart-monitor enable
/etc/init.d/smart-monitor start
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, TypeScript, Element Plus, ECharts, Pinia |
| 后端 | Node.js (ESM), 原生 `http`, `ws` |
| 数据库 | SQLite (better-sqlite3) |
| 报文捕获 | tcpdump（纯 JS 解析 pcap） |
| 连接追踪 | `/proc/net/nf_conntrack` |
| 部署 | procd (OpenWrt init), cron watchdog |

## 许可证

MIT
