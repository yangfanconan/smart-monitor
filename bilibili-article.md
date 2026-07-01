# 把路由器变成网络监控中心！开源项目 Smart Monitor 让家庭网络透明化

> 你的路由器其实知道所有秘密——谁在什么时候访问了什么网站、哪个设备在偷偷上传数据、有没有人在扫描你的端口……但大多数路由器的管理界面只会给你看几个干巴巴的数字。
>
> 今天给大家安利一个开源项目 **Smart Monitor**，它能把你的 OpenWrt 路由器变成一个专业的网络智能监控中心。

---

## 为什么需要这个？

说实话，大多数人对自家网络的了解几乎为零：

- 家里到底有多少设备连着 WiFi？
- 哪个设备在疯狂消耗带宽？
- 有没有设备在后台偷偷上传数据？
- 有没有人在扫描你的路由器端口？
- 孩子是不是在半夜偷偷玩手机？

普通路由器的管理界面根本回答不了这些问题。而 Smart Monitor 就是为了解决这些痛点而生的。

---

## Smart Monitor 是什么？

**Smart Monitor** 是一个运行在 OpenWrt/ImmortalWrt 路由器上的全栈网络智能监控系统。

简单说：它直接装在你的路由器上，实时分析所有经过路由器的网络流量，然后给你一个清晰、直观、专业的监控界面。

**项目地址**：https://github.com/yangfanconan/smart-monitor

---

## 功能展示

### 1. 监控总览 Dashboard

![Dashboard](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-25_163126_948.png)

一眼看清路由器状态：CPU、内存、温度、实时带宽、在线设备、最新告警。所有数据实时刷新，WebSocket 推送，零延迟。

### 2. 系统详情

![System](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_150932_715.png)

8 核 CPU 每核心使用率和频率、内存分布、磁盘 I/O、温度传感器——所有硬件信息一目了然。

### 3. 网络流量

![Network](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_150939_252.png)

LAN、WiFi、上行接口分别统计，实时速度 + 累计流量。哪个接口在跑流量，一看就知道。

### 4. 连接分析 + DPI 深度包检测

![Connection](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_150945_842.png)

这是最硬核的功能——**深度包检测（DPI）**。系统会实时解析经过路由器的每一个数据包：

- **HTTP**：明文请求/响应内容直接可见
- **DNS**：所有 DNS 查询记录，知道每个设备访问了什么域名
- **TLS**：加密连接的 SNI 信息，即使 HTTPS 也能知道访问了哪个网站
- **协议分布**：TCP/UDP/ICMP 占比，Top 端口统计

### 5. 用户流量 + 行为分析

![UserTraffic](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_150952_359.png)

按设备统计流量，自动识别应用类型（社交、视频、办公、游戏……）。哪个设备用了多少流量、访问了哪些网站/App，清清楚楚。

### 6. 安全中心 + 告警推送

![Security](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_151014_276.png)

内置威胁检测引擎：

- **端口扫描检测**：有人扫描你的网络？立刻告警
- **暴力破解检测**：SSH/Telnet 被暴力尝试？马上通知
- **DNS 异常检测**：设备发起异常数量的 DNS 查询？可能是中了木马
- **DDoS 异常检测**：连接数暴增？可能是被攻击了

告警可以推送到 **Telegram、微信、钉钉**，离开页面也能收到通知。

### 7. 智能异常检测

这个功能我很自豪——它不是用固定阈值告警，而是**学习每个设备的历史行为模式**，然后动态判断是否异常。

比如你的手机平时每小时只产生 50 个连接，某天突然变成 500 个，系统就会告警。但 NAS 设备本来就有大量连接，不会被误报。

### 8. 全球流量地图

![Geo](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_151101_597.png)

深色主题的世界地图，实时展示你的网络流量流向哪些国家和地区。科技感拉满。

### 9. 网络拓扑图

![Topology](https://github.com/yangfanconan/smart-monitor/raw/main/webui-image/processed/ScreenShot_2026-06-29_151114_096.png)

力导向图展示路由器 → 局域网设备 → 外部服务的连接关系。节点大小 = 流量，连线粗细 = 带宽。

---

## 技术架构

```
前端：Vue 3 + TypeScript + Element Plus + ECharts
后端：Node.js + SQLite + WebSocket
部署：OpenWrt procd + cron watchdog
```

整个系统直接运行在路由器上，不需要额外的服务器。我的设备是 **Orange Pi 5 Plus（RK3588）**，8 核 ARM + 16GB RAM，跑起来毫无压力。

---

## 安装超简单

**一行命令安装：**

```bash
curl -fsSL https://raw.githubusercontent.com/yangfanconan/smart-monitor/main/install.sh | sh
```

或者下载 .ipk 包：

```bash
opkg install smart-monitor_1.0.0_all.ipk
```

装完浏览器打开 `http://路由器IP:8080` 就能用了。

---

## 适合谁用？

- **网络爱好者**：想深入了解自家网络状况
- **家长**：想了解孩子的上网行为
- **安全-conscious 用户**：想监控网络是否有异常活动
- **OpenWrt 玩家**：想给路由器加点硬核功能
- **NAS 用户**：想监控 NAS 的流量和行为

---

## 写在最后

这个项目是我在折腾 OpenWrt 路由器的过程中慢慢做出来的。从一开始只是想看看路由器下挂了哪些设备，到后来加入了 DPI、威胁检测、智能异常分析……功能越来越多，索性开源了。

**GitHub 地址**：https://github.com/yangfanconan/smart-monitor

欢迎 Star、Fork、提 Issue、提 PR！

如果觉得有用，给个 Star 就是最大的支持 ⭐

---

*标签：#OpenWrt #路由器 #网络监控 #开源项目 #智能家居 #网络安全*
