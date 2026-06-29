import { storage } from '../storage/db.js'

// Known service → app/site mapping (200+)
const SERVICE_MAP = {
  // === 社交 ===
  'weixin.qq.com': { name: '微信', category: '社交' },
  'qq.com': { name: 'QQ', category: '社交' },
  'wechat.com': { name: '微信', category: '社交' },
  'weixin.com': { name: '微信', category: '社交' },
  'weibo.com': { name: '微博', category: '社交' },
  'sinaimg.cn': { name: '微博', category: '社交' },
  'sinajs.cn': { name: '微博', category: '社交' },
  'douyin.com': { name: '抖音', category: '社交' },
  'douyincdn.com': { name: '抖音', category: '社交' },
  'douyinpic.com': { name: '抖音', category: '社交' },
  'tiktok.com': { name: 'TikTok', category: '社交' },
  'tiktokcdn.com': { name: 'TikTok', category: '社交' },
  'kuaishou.com': { name: '快手', category: '社交' },
  'yximgs.com': { name: '快手', category: '社交' },
  'xiaohongshu.com': { name: '小红书', category: '社交' },
  'xhscdn.com': { name: '小红书', category: '社交' },
  'qzone.qq.com': { name: 'QQ空间', category: '社交' },
  'momo.com': { name: '陌陌', category: '社交' },
  'immomo.com': { name: '陌陌', category: '社交' },
  'hupu.com': { name: '虎扑', category: '社交' },
  'hupucdn.com': { name: '虎扑', category: '社交' },
  'douban.com': { name: '豆瓣', category: '社交' },
  'discord.com': { name: 'Discord', category: '社交' },
  'discordapp.com': { name: 'Discord', category: '社交' },
  'telegram.org': { name: 'Telegram', category: '社交' },
  't.me': { name: 'Telegram', category: '社交' },
  'whatsapp.com': { name: 'WhatsApp', category: '社交' },
  'whatsapp.net': { name: 'WhatsApp', category: '社交' },
  'line.me': { name: 'LINE', category: '社交' },
  'line-scdn.net': { name: 'LINE', category: '社交' },
  'viber.com': { name: 'Viber', category: '社交' },
  'signal.org': { name: 'Signal', category: '社交' },
  'mastodon.social': { name: 'Mastodon', category: '社交' },
  'threads.net': { name: 'Threads', category: '社交' },

  // === 视频 ===
  'bilibili.com': { name: '哔哩哔哩', category: '视频' },
  'bilivideo.com': { name: '哔哩哔哩', category: '视频' },
  'biliapi.net': { name: '哔哩哔哩', category: '视频' },
  'youku.com': { name: '优酷', category: '视频' },
  'ykimg.com': { name: '优酷', category: '视频' },
  'iqiyi.com': { name: '爱奇艺', category: '视频' },
  'iqiyipic.com': { name: '爱奇艺', category: '视频' },
  'youtube.com': { name: 'YouTube', category: '视频' },
  'googlevideo.com': { name: 'YouTube', category: '视频' },
  'ytimg.com': { name: 'YouTube', category: '视频' },
  'netflix.com': { name: 'Netflix', category: '视频' },
  'nflxvideo.net': { name: 'Netflix', category: '视频' },
  'nflximg.net': { name: 'Netflix', category: '视频' },
  'bilibili.tv': { name: '哔哩哔哩国际', category: '视频' },
  'mgtv.com': { name: '芒果TV', category: '视频' },
  'hunantv.com': { name: '芒果TV', category: '视频' },
  'sohu.com': { name: '搜狐视频', category: '视频' },
  'v.qq.com': { name: '腾讯视频', category: '视频' },
  'tencentvideo.com': { name: '腾讯视频', category: '视频' },
  'pptv.com': { name: 'PPTV', category: '视频' },
  'le.com': { name: '乐视', category: '视频' },
  'twitch.tv': { name: 'Twitch', category: '视频' },
  'ttvnw.net': { name: 'Twitch', category: '视频' },
  'hulu.com': { name: 'Hulu', category: '视频' },
  'disneyplus.com': { name: 'Disney+', category: '视频' },
  'disney-plus.net': { name: 'Disney+', category: '视频' },
  'primevideo.com': { name: 'Prime Video', category: '视频' },
  'doubanio.com': { name: '豆瓣', category: '视频' },

  // === 搜索/门户 ===
  'baidu.com': { name: '百度', category: '搜索' },
  'bdstatic.com': { name: '百度', category: '搜索' },
  'bdimg.com': { name: '百度', category: '搜索' },
  'bcebos.com': { name: '百度', category: '搜索' },
  'google.com': { name: 'Google', category: '搜索' },
  'gstatic.com': { name: 'Google', category: '搜索' },
  'googleapis.com': { name: 'Google', category: '搜索' },
  'googleusercontent.com': { name: 'Google', category: '搜索' },
  'bing.com': { name: 'Bing', category: '搜索' },
  'sogou.com': { name: '搜狗', category: '搜索' },
  'so.com': { name: '360搜索', category: '搜索' },
  'yandex.com': { name: 'Yandex', category: '搜索' },
  'duckduckgo.com': { name: 'DuckDuckGo', category: '搜索' },

  // === 电商 ===
  'taobao.com': { name: '淘宝', category: '电商' },
  'tmall.com': { name: '天猫', category: '电商' },
  'alicdn.com': { name: '阿里系', category: '电商' },
  'alibaba.com': { name: '阿里巴巴', category: '电商' },
  'aliexpress.com': { name: '速卖通', category: '电商' },
  '1688.com': { name: '1688', category: '电商' },
  'jd.com': { name: '京东', category: '电商' },
  '360buyimg.com': { name: '京东', category: '电商' },
  'jdcloud.com': { name: '京东', category: '电商' },
  'pinduoduo.com': { name: '拼多多', category: '电商' },
  'yangkeduo.com': { name: '拼多多', category: '电商' },
  'suning.com': { name: '苏宁', category: '电商' },
  'dangdang.com': { name: '当当', category: '电商' },
  'vip.com': { name: '唯品会', category: '电商' },
  'amazon.com': { name: 'Amazon', category: '电商' },
  'amazonaws.com': { name: 'AWS', category: '云服务' },
  'ebay.com': { name: 'eBay', category: '电商' },
  'shopify.com': { name: 'Shopify', category: '电商' },
  'xiaomi.com': { name: '小米商城', category: '电商' },
  'mi.com': { name: '小米', category: '电商' },
  'meituan.com': { name: '美团', category: '电商' },
  'dianping.com': { name: '大众点评', category: '电商' },

  // === 邮件 ===
  'mail.qq.com': { name: 'QQ邮箱', category: '邮件' },
  'gmail.com': { name: 'Gmail', category: '邮件' },
  'outlook.com': { name: 'Outlook', category: '邮件' },
  'hotmail.com': { name: 'Outlook', category: '邮件' },
  'live.com': { name: 'Outlook', category: '邮件' },
  '163.com': { name: '网易', category: '邮件' },
  '126.com': { name: '126邮箱', category: '邮件' },
  'yeah.net': { name: 'yeah.net邮箱', category: '邮件' },

  // === 办公/开发 ===
  'github.com': { name: 'GitHub', category: '开发' },
  'githubusercontent.com': { name: 'GitHub', category: '开发' },
  'githubassets.com': { name: 'GitHub', category: '开发' },
  'gitlab.com': { name: 'GitLab', category: '开发' },
  'stackoverflow.com': { name: 'StackOverflow', category: '开发' },
  'stackexchange.com': { name: 'StackExchange', category: '开发' },
  'dingtalk.com': { name: '钉钉', category: '办公' },
  'feishu.cn': { name: '飞书', category: '办公' },
  'yuque.com': { name: '语雀', category: '办公' },
  'notion.so': { name: 'Notion', category: '办公' },
  'notion.site': { name: 'Notion', category: '办公' },
  'docs.google.com': { name: 'Google Docs', category: '办公' },
  'office.com': { name: 'Microsoft 365', category: '办公' },
  'office365.com': { name: 'Microsoft 365', category: '办公' },
  'sharepoint.com': { name: 'SharePoint', category: '办公' },
  'onedrive.com': { name: 'OneDrive', category: '办公' },
  'live.com': { name: 'Microsoft', category: '办公' },
  'teams.microsoft.com': { name: 'Teams', category: '办公' },
  'slack.com': { name: 'Slack', category: '办公' },
  'zoom.us': { name: 'Zoom', category: '办公' },
  'tencentmeeting.com': { name: '腾讯会议', category: '办公' },
  'wps.com': { name: 'WPS', category: '办公' },
  'wps.cn': { name: 'WPS', category: '办公' },
  'confluence.atlassian.com': { name: 'Confluence', category: '办公' },
  'jira.atlassian.com': { name: 'Jira', category: '办公' },

  // === 云服务/CDN ===
  'tencent-cloud.net': { name: '腾讯云', category: '云服务' },
  'myqcloud.com': { name: '腾讯云', category: '云服务' },
  'aliyuncs.com': { name: '阿里云', category: '云服务' },
  'alibabacloud.com': { name: '阿里云', category: '云服务' },
  'huawei.com': { name: '华为云', category: '云服务' },
  'huaweicloud.com': { name: '华为云', category: '云服务' },
  'akamaized.net': { name: 'Akamai CDN', category: 'CDN' },
  'cloudflare.com': { name: 'Cloudflare', category: 'CDN' },
  'cloudflarestorage.com': { name: 'Cloudflare', category: 'CDN' },
  'fastly.net': { name: 'Fastly CDN', category: 'CDN' },
  'cdn77.org': { name: 'CDN77', category: 'CDN' },
  'wangsu.com': { name: '网宿CDN', category: 'CDN' },
  'ksyuncdn.com': { name: '金山CDN', category: 'CDN' },
  'qcloud.com': { name: '腾讯云', category: '云服务' },
  'baidustatic.com': { name: '百度静态资源', category: 'CDN' },

  // === 游戏 ===
  'steampowered.com': { name: 'Steam', category: '游戏' },
  'steamstatic.com': { name: 'Steam', category: '游戏' },
  'steamcommunity.com': { name: 'Steam', category: '游戏' },
  'valvesoftware.com': { name: 'Steam', category: '游戏' },
  'epicgames.com': { name: 'Epic Games', category: '游戏' },
  'unrealengine.com': { name: 'Epic Games', category: '游戏' },
  'blizzard.com': { name: '暴雪', category: '游戏' },
  'battle.net': { name: '暴雪战网', category: '游戏' },
  'riotgames.com': { name: 'Riot Games', category: '游戏' },
  'leagueoflegends.com': { name: '英雄联盟', category: '游戏' },
  'playvalorant.com': { name: 'Valorant', category: '游戏' },
  'ea.com': { name: 'EA', category: '游戏' },
  'origin.com': { name: 'EA Origin', category: '游戏' },
  'ubisoft.com': { name: '育碧', category: '游戏' },
  'nintendo.net': { name: 'Nintendo', category: '游戏' },
  'playstation.com': { name: 'PlayStation', category: '游戏' },
  'playstation.net': { name: 'PlayStation', category: '游戏' },
  'xbox.com': { name: 'Xbox', category: '游戏' },
  'xboxlive.com': { name: 'Xbox Live', category: '游戏' },
  'mihoyo.com': { name: '米哈游', category: '游戏' },
  'hoyoverse.com': { name: '米哈游', category: '游戏' },
  'genshinimpact.com': { name: '原神', category: '游戏' },
  'netease.com': { name: '网易游戏', category: '游戏' },
  '163games.com': { name: '网易游戏', category: '游戏' },
  'taptap.com': { name: 'TapTap', category: '游戏' },
  'game.qq.com': { name: '腾讯游戏', category: '游戏' },
  'wegame.com': { name: 'WeGame', category: '游戏' },

  // === 音乐/音频 ===
  'music.163.com': { name: '网易云音乐', category: '音乐' },
  'netease.cloud': { name: '网易云音乐', category: '音乐' },
  'y.qq.com': { name: 'QQ音乐', category: '音乐' },
  'music.tencent.com': { name: 'QQ音乐', category: '音乐' },
  'kugou.com': { name: '酷狗音乐', category: '音乐' },
  'kuwo.cn': { name: '酷我音乐', category: '音乐' },
  'spotify.com': { name: 'Spotify', category: '音乐' },
  'scdn.co': { name: 'Spotify', category: '音乐' },
  'apple.com': { name: 'Apple', category: '音乐' },
  'music.apple.com': { name: 'Apple Music', category: '音乐' },
  'amazonmusic.com': { name: 'Amazon Music', category: '音乐' },
  'ximalaya.com': { name: '喜马拉雅', category: '音乐' },
  'xmcdn.com': { name: '喜马拉雅', category: '音乐' },
  'lizhi.fm': { name: '荔枝FM', category: '音乐' },
  'qingting.fm': { name: '蜻蜓FM', category: '音乐' },

  // === 资讯/阅读 ===
  'toutiao.com': { name: '今日头条', category: '资讯' },
  'toutiaoapi.com': { name: '今日头条', category: '资讯' },
  'bytedance.com': { name: '字节跳动', category: '资讯' },
  'zhihu.com': { name: '知乎', category: '资讯' },
  'zhimg.com': { name: '知乎', category: '资讯' },
  'jianshu.com': { name: '简书', category: '资讯' },
  'thepaper.cn': { name: '澎湃新闻', category: '资讯' },
  'people.com.cn': { name: '人民网', category: '资讯' },
  'xinhuanet.com': { name: '新华网', category: '资讯' },
  'chinadaily.com.cn': { name: '中国日报', category: '资讯' },
  'bbc.com': { name: 'BBC', category: '资讯' },
  'cnn.com': { name: 'CNN', category: '资讯' },
  'reuters.com': { name: 'Reuters', category: '资讯' },
  'nytimes.com': { name: 'NYTimes', category: '资讯' },
  'medium.com': { name: 'Medium', category: '资讯' },
  'qqnews.com': { name: '腾讯新闻', category: '资讯' },
  'ifeng.com': { name: '凤凰新闻', category: '资讯' },
  'sohunews.com': { name: '搜狐新闻', category: '资讯' },
  'fqnovel.com': { name: '番茄小说', category: '阅读' },
  'changdunovel.com': { name: '番茄小说', category: '阅读' },
  'qidian.com': { name: '起点中文网', category: '阅读' },
  'zongheng.com': { name: '纵横中文网', category: '阅读' },
  'jjwxc.net': { name: '晋江文学城', category: '阅读' },
  'kindle.com': { name: 'Kindle', category: '阅读' },
  'getpocket.com': { name: 'Pocket', category: '阅读' },

  // === 金融/支付 ===
  'alipay.com': { name: '支付宝', category: '金融' },
  'alipayobjects.com': { name: '支付宝', category: '金融' },
  'icbc.com.cn': { name: '工商银行', category: '金融' },
  'ccb.com': { name: '建设银行', category: '金融' },
  'abc.com.cn': { name: '农业银行', category: '金融' },
  'boc.cn': { name: '中国银行', category: '金融' },
  'cmbchina.com': { name: '招商银行', category: '金融' },
  'bankcomm.com': { name: '交通银行', category: '金融' },
  'psbc.com': { name: '邮储银行', category: '金融' },
  'cebbank.com': { name: '光大银行', category: '金融' },
  'cmbimg.com': { name: '招商银行', category: '金融' },
  'pingan.com': { name: '平安', category: '金融' },
  'chinaamc.com': { name: '华夏基金', category: '金融' },
  'eastmoney.com': { name: '东方财富', category: '金融' },
  'hexun.com': { name: '和讯', category: '金融' },
  'paypal.com': { name: 'PayPal', category: '金融' },
  'stripe.com': { name: 'Stripe', category: '金融' },

  // === 出行/地图 ===
  'amap.com': { name: '高德地图', category: '出行' },
  'autonavi.com': { name: '高德地图', category: '出行' },
  'map.baidu.com': { name: '百度地图', category: '出行' },
  'map.qq.com': { name: '腾讯地图', category: '出行' },
  'didi.com': { name: '滴滴出行', category: '出行' },
  'didiglobal.com': { name: '滴滴出行', category: '出行' },
  'ctrip.com': { name: '携程', category: '出行' },
  'trip.com': { name: '携程', category: '出行' },
  'qunar.com': { name: '去哪儿', category: '出行' },
  'fliggy.com': { name: '飞猪', category: '出行' },
  '12306.cn': { name: '12306', category: '出行' },
  'google.com/maps': { name: 'Google Maps', category: '出行' },
  'maps.apple.com': { name: 'Apple Maps', category: '出行' },
  'uber.com': { name: 'Uber', category: '出行' },

  // === 教育 ===
  'coursera.org': { name: 'Coursera', category: '教育' },
  'edx.org': { name: 'edX', category: '教育' },
  'udemy.com': { name: 'Udemy', category: '教育' },
  'khanacademy.org': { name: 'Khan Academy', category: '教育' },
  'imooc.com': { name: '慕课网', category: '教育' },
  'icourse163.org': { name: '中国大学MOOC', category: '教育' },
  'xuetangx.com': { name: '学堂在线', category: '教育' },
  'zhihuixiao.com': { name: '智慧校', category: '教育' },
  'leetcode.com': { name: 'LeetCode', category: '教育' },
  'leetcode.cn': { name: 'LeetCode', category: '教育' },
  'codeforces.com': { name: 'Codeforces', category: '教育' },
  'luogu.com.cn': { name: '洛谷', category: '教育' },

  // === 健康/生活 ===
  'dxy.com': { name: '丁香园', category: '健康' },
  'chunyuyisheng.com': { name: '春雨医生', category: '健康' },
  'haodf.com': { name: '好大夫', category: '健康' },
  'keep.com': { name: 'Keep', category: '健康' },
  'gotokeep.com': { name: 'Keep', category: '健康' },
  'meishichina.com': { name: '美食天下', category: '生活' },
  'xiachufang.com': { name: '下厨房', category: '生活' },

  // === IoT/智能家居 ===
  'miio.com': { name: '米家', category: 'IoT' },
  'iot.mi.com': { name: '米家', category: 'IoT' },
  'smartthings.com': { name: 'SmartThings', category: 'IoT' },
  'homeassistant.io': { name: 'HomeAssistant', category: 'IoT' },
  'tplinkcloud.com': { name: 'TP-Link', category: 'IoT' },
  'yeelight.com': { name: 'Yeelight', category: 'IoT' },

  // === 下载/工具 ===
  'thunderbird.net': { name: 'Thunder', category: '下载' },
  'pan.baidu.com': { name: '百度网盘', category: '下载' },
  'baidupcs.com': { name: '百度网盘', category: '下载' },
  'cloud.189.cn': { name: '天翼云盘', category: '下载' },
  'pc.qq.com': { name: '腾讯软件', category: '下载' },
  'github.io': { name: 'GitHub Pages', category: '开发' },
  'npmjs.com': { name: 'npm', category: '开发' },
  'pypi.org': { name: 'PyPI', category: '开发' },
  'docker.com': { name: 'Docker', category: '开发' },
  'docker.io': { name: 'Docker Hub', category: '开发' },
}

// DNS server IPs (not interesting as "visited sites")
const DNS_SERVERS = new Set(['8.8.8.8', '8.8.4.4', '1.1.1.1', '114.114.114.114', '223.5.5.5', '9.9.9.9'])

export function identifyService(domain, dstIp) {
  if (!domain && !dstIp) return { name: dstIp || '未知', category: '未知' }

  // Try domain match first
  if (domain) {
    const cleanDomain = domain.toLowerCase().replace(/^\*\./, '')
    // Exact match
    if (SERVICE_MAP[cleanDomain]) return SERVICE_MAP[cleanDomain]
    // Suffix match (e.g., api.weixin.qq.com → qq.com)
    for (const [pattern, info] of Object.entries(SERVICE_MAP)) {
      if (cleanDomain.endsWith('.' + pattern) || cleanDomain === pattern) return info
    }
    // Use domain as name
    const parts = cleanDomain.split('.')
    const mainDomain = parts.length >= 2 ? parts.slice(-2).join('.') : cleanDomain
    return { name: mainDomain, category: '网站' }
  }

  // Fallback to IP
  if (DNS_SERVERS.has(dstIp)) return { name: 'DNS 查询', category: '系统' }
  return { name: dstIp, category: '未知' }
}

// Build IP → domain mapping from DNS/TLS/HTTP records
function buildIpDomainMap(minutes) {
  const since = Date.now() - minutes * 60 * 1000
  const map = {} // ip → domain

  // From DNS responses: summary = "domain → ip1, ip2"
  const dnsRecords = storage.db.prepare(
    "SELECT summary FROM content_records WHERE content_type = 'DNS' AND ts >= ? AND summary LIKE '%→%'"
  ).all(since)
  for (const r of dnsRecords) {
    const parts = r.summary.split('→')
    if (parts.length !== 2) continue
    const domain = parts[0].trim()
    const ips = parts[1].split(',').map(s => s.trim())
    for (const ip of ips) {
      if (ip && !map[ip]) map[ip] = domain
    }
  }

  // From TLS SNI: summary contains "→ domain"
  const tlsRecords = storage.db.prepare(
    "SELECT summary, detail FROM content_records WHERE content_type = 'TLS' AND ts >= ? AND summary LIKE '%→%'"
  ).all(since)
  for (const r of tlsRecords) {
    const match = r.summary.match(/→\s*(\S+)/)
    if (match) {
      // Extract dst_ip from detail
      try {
        const detail = typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail
        if (detail?.serverName) {
          // We need the dst_ip for this record - get it from the full record
        }
      } catch {}
    }
  }

  // From TLS detail: extract serverName with dst_ip
  const tlsFull = storage.db.prepare(
    "SELECT dst_ip, detail FROM content_records WHERE content_type = 'TLS' AND ts >= ? AND detail LIKE '%serverName%'"
  ).all(since)
  for (const r of tlsFull) {
    try {
      const detail = typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail
      if (detail?.serverName && r.dst_ip && !map[r.dst_ip]) {
        map[r.dst_ip] = detail.serverName
      }
    } catch {}
  }

  // From HTTP Host: detail has host field
  const httpFull = storage.db.prepare(
    "SELECT dst_ip, detail FROM content_records WHERE content_type = 'HTTP' AND ts >= ? AND detail LIKE '%host%'"
  ).all(since)
  for (const r of httpFull) {
    try {
      const detail = typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail
      if (detail?.host && r.dst_ip && !map[r.dst_ip]) {
        map[r.dst_ip] = detail.host.replace(/:\d+$/, '')
      }
    } catch {}
  }

  return map
}

// Get per-device analytics
export function getDeviceAnalytics(minutes = 60) {
  const since = Date.now() - minutes * 60 * 1000
  const ipDomainMap = buildIpDomainMap(minutes)

  // Get all devices with traffic
  const devices = storage.db.prepare(
    'SELECT DISTINCT ip, hostname, mac FROM device_traffic WHERE ts >= ? ORDER BY ip'
  ).all(since)

  const results = []

  for (const dev of devices) {
    const ip = dev.ip
    if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip.startsWith('fe80:') || ip.includes(':0000:')) continue

    // Get destinations from device_destinations
    const dests = storage.db.prepare(
      'SELECT dst_ip, dst_port, protocol, SUM(bytes) as totalBytes, SUM(connections) as totalConns, MIN(ts) as firstTs, MAX(ts) as lastTs FROM device_destinations WHERE src_ip = ? AND ts >= ? GROUP BY dst_ip ORDER BY totalConns DESC'
    ).all(ip, since)

    // Get visited domains from content_records
    const domains = storage.db.prepare(
      "SELECT summary, dst_ip, ts FROM content_records WHERE src_ip = ? AND ts >= ? AND content_type IN ('HTTP', 'DNS', 'TLS') ORDER BY ts DESC"
    ).all(ip, since)

    // Aggregate by service
    const serviceMap = {}
    for (const d of dests) {
      if (DNS_SERVERS.has(d.dst_ip)) continue
      const domain = ipDomainMap[d.dst_ip] || null
      const service = identifyService(domain, d.dst_ip)
      const key = service.name

      if (!serviceMap[key]) {
        serviceMap[key] = {
          name: service.name,
          category: service.category,
          dstIps: new Set(),
          visitCount: 0,
          totalBytes: 0,
          totalConns: 0,
          firstSeen: d.firstTs,
          lastSeen: d.lastTs,
          domains: new Set(),
          ports: new Set(),
        }
      }

      const entry = serviceMap[key]
      entry.dstIps.add(d.dst_ip)
      entry.visitCount += d.totalConns
      entry.totalBytes += d.totalBytes
      entry.totalConns += d.totalConns
      if (d.firstTs < entry.firstSeen) entry.firstSeen = d.firstTs
      if (d.lastTs > entry.lastSeen) entry.lastSeen = d.lastTs
      if (domain) entry.domains.add(domain)
      entry.ports.add(d.dst_port)
    }

    // Also add domain info from content records
    for (const r of domains) {
      let domain = null
      if (r.summary) {
        // DNS: "domain → ips"
        const dnsMatch = r.summary.match(/^([^\s→]+)/)
        if (dnsMatch) domain = dnsMatch[1]
        // TLS: "TLS ... → serverName"
        const tlsMatch = r.summary.match(/→\s*(\S+)/)
        if (tlsMatch && !domain) domain = tlsMatch[1]
        // HTTP: "GET http://host/path"
        const httpMatch = r.summary.match(/https?:\/\/([^\/\s]+)/)
        if (httpMatch && !domain) domain = httpMatch[1]
      }
      if (!domain) continue

      const service = identifyService(domain, r.dst_ip)
      const key = service.name
      if (!serviceMap[key]) {
        serviceMap[key] = {
          name: service.name,
          category: service.category,
          dstIps: new Set(),
          visitCount: 0,
          totalBytes: 0,
          totalConns: 0,
          firstSeen: r.ts,
          lastSeen: r.ts,
          domains: new Set(),
          ports: new Set(),
        }
      }
      const entry = serviceMap[key]
      entry.domains.add(domain)
      if (r.dst_ip) entry.dstIps.add(r.dst_ip)
      if (r.ts < entry.firstSeen) entry.firstSeen = r.ts
      if (r.ts > entry.lastSeen) entry.lastSeen = r.ts
    }

    // Convert to array
    const services = Object.values(serviceMap).map(s => ({
      name: s.name,
      category: s.category,
      dstIps: [...s.dstIps],
      visitCount: s.visitCount,
      totalBytes: s.totalBytes,
      totalConns: s.totalConns,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      duration: s.lastSeen - s.firstSeen, // milliseconds
      domains: [...s.domains].slice(0, 10),
      ports: [...s.ports],
    })).sort((a, b) => b.visitCount - a.visitCount)

    const totalBytes = services.reduce((sum, s) => sum + s.totalBytes, 0)
    const totalVisits = services.reduce((sum, s) => sum + s.visitCount, 0)

    results.push({
      ip,
      hostname: dev.hostname,
      mac: dev.mac,
      siteCount: services.length,
      totalVisits,
      totalBytes,
      firstActivity: services.length ? Math.min(...services.map(s => s.firstSeen)) : 0,
      lastActivity: services.length ? Math.max(...services.map(s => s.lastSeen)) : 0,
      services: services.slice(0, 50), // top 50
    })
  }

  return results.sort((a, b) => b.totalVisits - a.totalVisits)
}

// Get single device detail
export function getDeviceDetail(ip, minutes = 60) {
  const all = getDeviceAnalytics(minutes)
  return all.find(d => d.ip === ip) || null
}

// Get category summary across all devices
export function getCategorySummary(minutes = 60) {
  const devices = getDeviceAnalytics(minutes)
  const catMap = {}

  for (const dev of devices) {
    for (const svc of dev.services) {
      if (!catMap[svc.category]) catMap[svc.category] = { category: svc.category, visitCount: 0, deviceCount: new Set(), totalBytes: 0 }
      catMap[svc.category].visitCount += svc.visitCount
      catMap[svc.category].deviceCount.add(dev.ip)
      catMap[svc.category].totalBytes += svc.totalBytes
    }
  }

  return Object.values(catMap).map(c => ({
    ...c,
    deviceCount: c.deviceCount.size,
  })).sort((a, b) => b.visitCount - a.visitCount)
}

// === 时段分析: 按小时统计访问分布 ===
export function getHourlyDistribution(minutes = 60) {
  const since = Date.now() - minutes * 60 * 1000
  const rows = storage.db.prepare(
    "SELECT ts, src_ip, content_type, summary FROM content_records WHERE ts >= ? AND content_type IN ('HTTP','DNS','TLS')"
  ).all(since)

  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, devices: new Set(), types: {} }))
  for (const r of rows) {
    const h = new Date(r.ts).getHours()
    hours[h].count++
    hours[h].devices.add(r.src_ip)
    hours[h].types[r.content_type] = (hours[h].types[r.content_type] || 0) + 1
  }
  return hours.map(h => ({ hour: h.hour, count: h.count, deviceCount: h.devices.size, types: h.types }))
}

// === 跨设备分析: 同一服务被多少设备使用 ===
export function getCrossDeviceAnalysis(minutes = 60) {
  const devices = getDeviceAnalytics(minutes)
  const serviceDevices = {}

  for (const dev of devices) {
    for (const svc of dev.services) {
      if (!serviceDevices[svc.name]) {
        serviceDevices[svc.name] = { name: svc.name, category: svc.category, devices: [], totalVisits: 0 }
      }
      serviceDevices[svc.name].devices.push({ ip: dev.ip, hostname: dev.hostname, visits: svc.visitCount, duration: svc.duration })
      serviceDevices[svc.name].totalVisits += svc.visitCount
    }
  }

  return Object.values(serviceDevices)
    .filter(s => s.devices.length >= 1)
    .sort((a, b) => b.devices.length - a.devices.length || b.totalVisits - a.totalVisits)
}

// === 趋势分析: 按时间窗口统计各分类的访问量变化 ===
export function getTrendAnalysis(minutes = 60, windowMinutes = 10) {
  const since = Date.now() - minutes * 60 * 1000
  const ipDomainMap = buildIpDomainMap(minutes)

  const rows = storage.db.prepare(
    "SELECT ts, src_ip, dst_ip, content_type, summary FROM content_records WHERE ts >= ? AND content_type IN ('HTTP','DNS','TLS')"
  ).all(since)

  const windows = {}
  for (const r of rows) {
    const windowTs = Math.floor(r.ts / (windowMinutes * 60000)) * (windowMinutes * 60000)
    if (!windows[windowTs]) windows[windowTs] = { ts: windowTs, categories: {} }

    let domain = ipDomainMap[r.dst_ip] || null
    if (!domain && r.summary) {
      const m = r.summary.match(/^([^\s→]+)/)
      if (m) domain = m[1]
    }
    const svc = identifyService(domain, r.dst_ip)
    const cat = svc.category
    windows[windowTs].categories[cat] = (windows[windowTs].categories[cat] || 0) + 1
  }

  return Object.values(windows).sort((a, b) => a.ts - b.ts)
}

// === 生成 HTML 报告 ===
export function generateReport(minutes = 60) {
  const devices = getDeviceAnalytics(minutes)
  const categories = getCategorySummary(minutes)
  const hourly = getHourlyDistribution(minutes)
  const crossDevice = getCrossDeviceAnalysis(minutes).slice(0, 30)
  const now = new Date().toLocaleString('zh-CN')

  const deviceRows = devices.map(d => `
    <tr>
      <td><b>${d.hostname || d.ip}</b><br><small>${d.ip}</small></td>
      <td>${d.siteCount}</td>
      <td><b>${d.totalVisits}</b></td>
      <td>${fmtBytes(d.totalBytes)}</td>
      <td>${d.services.slice(0, 5).map(s => `<span class="tag tag-${s.category}">${s.name} (${s.visitCount})</span>`).join(' ')}</td>
    </tr>
  `).join('')

  const catRows = categories.map(c => `
    <tr><td>${c.category}</td><td><b>${c.visitCount}</b></td><td>${c.deviceCount}</td></tr>
  `).join('')

  const crossRows = crossDevice.filter(s => s.devices.length > 1).slice(0, 20).map(s => `
    <tr>
      <td><b>${s.name}</b></td>
      <td>${s.category}</td>
      <td>${s.devices.length}</td>
      <td>${s.totalVisits}</td>
      <td>${s.devices.map(d => `${d.hostname || d.ip}(${d.visits})`).join(', ')}</td>
    </tr>
  `).join('')

  const peakHours = hourly.filter(h => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)
  const peakStr = peakHours.map(h => `${h.hour}:00 (${h.count}次)`).join(', ')

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>网络行为分析报告</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; color: #333; }
  h1 { border-bottom: 3px solid #409eff; padding-bottom: 10px; }
  h2 { color: #409eff; margin-top: 30px; border-left: 4px solid #409eff; padding-left: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #e4e7ed; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f5f7fa; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin: 1px; background: #ecf5ff; color: #409eff; }
  .summary { display: flex; gap: 20px; margin: 16px 0; }
  .summary-card { flex: 1; background: #f5f7fa; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-card .val { font-size: 28px; font-weight: 700; color: #409eff; }
  .summary-card .lbl { font-size: 12px; color: #909399; }
  .meta { color: #909399; font-size: 13px; }
</style></head><body>
<h1>🌐 网络行为分析报告</h1>
<p class="meta">生成时间: ${now} | 统计周期: 最近 ${minutes} 分钟</p>

<div class="summary">
  <div class="summary-card"><div class="val">${devices.length}</div><div class="lbl">在线设备</div></div>
  <div class="summary-card"><div class="val">${devices.reduce((s, d) => s + d.totalVisits, 0)}</div><div class="lbl">总访问次数</div></div>
  <div class="summary-card"><div class="val">${categories.length}</div><div class="lbl">服务分类</div></div>
  <div class="summary-card"><div class="val">${peakStr || '-'}</div><div class="lbl">高峰时段</div></div>
</div>

<h2>📊 分类统计</h2>
<table><tr><th>分类</th><th>访问次数</th><th>设备数</th></tr>${catRows}</table>

<h2>📱 设备行为详情</h2>
<table><tr><th>设备</th><th>站点/APP</th><th>访问次数</th><th>流量</th><th>Top 应用</th></tr>${deviceRows}</table>

<h2>🔗 跨设备共用服务</h2>
<table><tr><th>服务</th><th>分类</th><th>设备数</th><th>总访问</th><th>设备明细</th></tr>${crossRows}</table>

<h2>⏰ 时段分布 (Top 3 高峰: ${peakStr || '-'})</h2>
<table><tr>${hourly.map(h => `<th>${h.hour}时</th>`).join('')}</tr>
<tr>${hourly.map(h => `<td style="text-align:center;${h.count > 0 ? 'font-weight:600;color:#409eff' : 'color:#ccc'}">${h.count || '-'}</td>`).join('')}</tr></table>

<p class="meta" style="margin-top:30px;text-align:center">— Smart Monitor 自动生成 —</p>
</body></html>`
}

function fmtBytes(b) {
  if (!b) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.min(Math.floor(Math.log(b) / Math.log(k)), s.length - 1))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]
}
