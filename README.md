<div align="center">

# RawPhotos

**AI 文生图 / 文生视频 / 图生图 / AI 对话 桌面应用**

通过任意 **OpenAI 兼容的中转 / 聚合代理接口**，在一个桌面端完成出图、出片、图生图与 AI 对话，
内置多接口管理、用量统计、中转额度、运行日志与主题系统。

基于 Electron + Vue 3 构建 · Windows 桌面应用

[社区支持](https://linux.do)

</div>

---

## 🔎 快速引导

- [声明](#-声明)
- [功能](#-功能)
- [快速开始](#-快速开始)
- [接口配置](#️-接口配置)
- [功能详解](#-功能详解)
- [数据存储位置](#️-数据存储位置)
- [自行打包](#-自行打包)
- [目录结构](#-目录结构)
- [技术栈](#️-技术栈)
- [License](#-license)
- [社区支持](#-社区支持)

---

## 📢 声明

本项目仅供学习、研究与自用。使用本项目访问的任何第三方接口、模型与生成内容，其合规性与后果由使用者自行承担。

本项目是一个**纯客户端**：不内置任何模型，也不提供任何接口，只是把你自己的「中转 / 聚合代理接口」接进来调用。你的 API Key 仅保存在本机，请求由桌面端的主进程直接发起，不经过任何第三方服务器。

本项目与 OpenAI、Anthropic、xAI、Google 等任何模型 / 接口官方无关，不代表任何官方立场。

---

## ✨ 功能

- **文生图**：输入提示词出图，单次 1–4 张，可选尺寸；支持**生成队列**连续排队、顺序执行
- **文生视频**：提示词生成视频，兼容同步直出与异步任务轮询，可设尺寸 / 时长
- **图生图**：上传参考图 + 提示词，走 `/images/edits` 重绘
- **AI 提示词优化**：用对话模型把提示词扩写得更具体（图片 / 视频不同方向）
- **AI 对话**：
  - **可独立选择接口与模型**——出图用 A 中转、聊天用 B 中转的 GPT 分组，互不影响
  - 对话历史自动保存、历史列表、导出 Markdown
  - 支持上传图片（视觉模型）与文本文件
  - Markdown 渲染、停止生成、清空对话、消息复制
- **多接口管理**：保存多个中转接口（各自地址 / Key / 图片·视频·对话模型 / 尺寸），一键「设为当前」；模型可从接口 `/models` **下拉自动匹配**或手动输入
- **画廊**：浏览本地已保存的图片与视频，按类型筛选
- **用量统计**：累计图片 / 视频 / 优化 / 对话次数、成功率、近 7 天趋势、按模型 Top
- **中转额度**：自动查询并常显当前接口余额（侧栏 + 统计页），可设**低额度预警**（定时检查 + 系统通知）
- **运行日志**：每次请求的状态码与**接口原始返回**，失败排查一目了然，持久化到本地
- **主题系统**：海盐 / 晴绿 / 曜夜 + 自定义取色，自动记忆
- **托盘运行**：关闭可选「最小化到托盘 / 退出」，托盘图标随时恢复

---

## 🚀 快速开始

### 方式一：直接使用（推荐）

到 [Releases](https://github.com/yz46bbbqqz-rgb/RawPhotos/releases) 下载：

- **安装包** `RawPhotos Setup x.y.z.exe`：双击安装，可自选目录、自动建桌面 / 开始菜单快捷方式
- **便携版** `RawPhotos-portable-x.y.z.zip`：解压后双击 `RawPhotos.exe`，免安装

> 安装包未做代码签名，首次运行 Windows 可能提示「未知发布者 / SmartScreen」，点 **更多信息 → 仍要运行** 即可。

首次打开 → 进「设置」填中转地址 + API Key 即可使用。

### 方式二：从源码运行

```bash
# 需要 Node.js 18+
npm install
npm run dev
```

> 国内若 `npm install` 后报 `Error: Electron uninstall`（Electron 二进制没下下来），用镜像重下：
>
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; node node_modules/electron/install.js
> ```

---

## ⚙️ 接口配置

进「设置 → 接口配置 → 新增接口」，可保存多个中转，每个接口字段：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 接口名称 | 自定义备注 | `中转接口` / `gpt` |
| Base URL | OpenAI 兼容地址，通常以 `/v1` 结尾 | `https://your-relay-host.com/v1` |
| API Key | 接口密钥 | `sk-...` |
| 图片模型 | 文生图模型 | `grok-imagine-image` / `flux` |
| 视频模型 | 文生视频模型（留空则不出片） | `grok-imagine-video` |
| 优化模型 | 对话模型，用于「AI 优化提示词」 | `gpt-4o-mini` / `grok-3-mini` |
| 图片 / 视频尺寸、时长 | 可选 | `1024x1024` / `1280x720` / `5` |
| 高级 · 接口路径 | 图生图 `/images/edits`、出片 `/videos/generations`，按平台改 | |

- 模型框可**从接口 `/models` 下拉**（自动按图片 / 视频 / 对话筛选并默认选中），也可切「手动输入」。
- 点接口圆点或「设为当前」即生效（立即保存）。
- **对话页可单独选接口 / 模型**，与出图用的「当前接口」互不影响。

涉及端点：出图 `…/images/generations`、出片 `…/videos/generations`、图生图 `…/images/edits`、对话 / 优化 `…/chat/completions`、模型列表 `…/models`、额度 `…/usage` 或 `…/dashboard/billing`。

---

## 🧩 功能详解

### 生成（文生图 / 文生视频 / 图生图）
点「生成」可在图片 / 视频间切换。图片模式可上传**参考图**走图生图。点生成即**加入队列**，多任务顺序执行，结果以卡片展示，可保存 / 另存为 / 放大预览。

### AI 对话
左侧是历史会话列表，右侧是对话区。**底部可单独选「接口」和「模型」**——这样聊天用 GPT 分组、出图用绘图分组互不打架。支持上传图片（视觉）/ 文本文件、Markdown 渲染、停止生成、清空、导出 `.md`。对话**自动保存**，重启后历史还在。

### 画廊
浏览保存目录下的图片（内联）与视频（自定义 `rawmedia://` 协议流式播放），支持「全部 / 图片 / 视频」筛选与另存为。

### 用量统计 & 中转额度
统计页顶部是**中转额度卡**（剩余 / 总额 / 已用 + 进度条，定时刷新），下面是本地累计用量（按类型 / 模型 / 近 7 天）与成功率。侧栏左下角也常显剩余额度。

### 额度预警
设置 →「额度预警」开启后，每 60 秒检查余额，**跌破阈值弹提示 + 系统通知**（最小化到托盘也能收到）。

### 运行日志
每次出图 / 出片 / 优化 / 对话 / 测试都会记录请求状态码与**接口原始返回**，持久化到本地，可清空 / 打开日志文件。接口报错时直接看原文，定位最快。

### 主题与窗口
海盐 / 晴绿 / 曜夜 + 自定义取色，启动即记忆。关闭窗口可选「最小化到托盘」或「退出」，托盘图标随时恢复。

---

## 🗂️ 数据存储位置

应用数据都在系统用户数据目录（Windows 约为 `%APPDATA%/RawPhotos`）：

| 文件 | 内容 |
| --- | --- |
| `settings.json` | 全部设置（接口、主题、预警等） |
| `rawphotos-chats.json` | 对话历史 |
| `rawphotos-usage.json` | 累计用量统计 |
| `rawphotos.log` | 运行日志（JSONL） |

- 生成的图片 / 视频默认存「图片/RawPhotos」，可在设置里改目录。
- API Key 仅保存在本机，请求由主进程发起，不经浏览器、无跨域。

---

## 📦 自行打包

```bash
npm run dist:win
```

产物在 `release/`：NSIS 安装包 `RawPhotos Setup x.y.z.exe`。

> **国内打包提示**：electron-builder 首次打包要下载 `winCodeSign` / `nsis` 工具链，且解压 Electron 时会被杀软实时扫描拖慢——**别中途打断**，耐心等「unpacking default Electron distribution」那一步即可。可设镜像加速：
>
> ```powershell
> $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
> $env:CSC_IDENTITY_AUTO_DISCOVERY="false"   # 跳过代码签名
> npm run dist:win
> ```

---

## 📁 目录结构

```
RawPhotos/
├── src/
│   ├── main/index.js        # 主进程：窗口/托盘、IPC、调接口、设置/历史/用量/日志、rawmedia 协议
│   ├── preload/index.js     # 预加载：contextBridge 暴露 window.api
│   └── renderer/            # Vue 渲染层
│       ├── index.html
│       └── src/
│           ├── App.vue          # 外壳：导航 + 主题 + 余额 + 关闭弹窗 + 预警
│           ├── store.js         # 设置 + 会话结果 + 主题
│           ├── components/      # 生成/对话/画廊/统计/日志/设置/关于 + 媒体卡/灯箱/下拉/图标/Toast
│           └── composables/
├── resources/icon.png       # 运行时图标（托盘 / 窗口 / 通知）
├── build/icon.png           # 打包图标
├── electron-builder.yml     # 打包配置
├── electron.vite.config.mjs
├── AGENTS.md                # 给 AI 助手的工程记忆
└── package.json
```

---

## 🛠️ 技术栈

- **Electron 42** + **electron-vite**
- **Vue 3**（`<script setup>`）+ **Vite**
- `marked`（对话 Markdown 渲染）
- **electron-builder**（Windows NSIS 打包）

> 给 AI 助手 / 协作者的工程记忆与设计约束见 [`AGENTS.md`](./AGENTS.md)。

---

## 📄 License

见 [LICENSE](./LICENSE)。

---

## 💬 社区支持

欢迎到 [linux.do](https://linux.do) 交流、分享与反馈。

---

<div align="center">
如果这个项目对你有帮助，欢迎 Star ⭐
</div>
