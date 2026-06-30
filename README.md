# RawPhotos · AI 创作桌面应用

基于 **Electron + Vue 3** 的桌面工具，通过任意 **OpenAI 兼容的中转 / 代理接口**（如 apimf 等聚合中转）调用各家模型，完成 **文生图 / 文生视频 / 图生图 / AI 对话**，并自带 **多接口管理、用量统计、中转额度、运行日志、主题** 等。

> 面向**中转 / 聚合代理**接口（非本机服务）。在设置里填中转给你的 `…/v1` 地址 + API Key 即可用。
> 官网：<https://nexus.apimf.top> ·  交流 / 反馈 QQ 群：**1105572960**

---

## 功能一览

- **文生图**：输入提示词出图，一次 1–4 张，可选尺寸；**生成队列**可连续排队、顺序执行
- **文生视频**：提示词生成视频，支持同步直出与异步任务轮询，可设尺寸/时长
- **图生图**：上传参考图 + 提示词，走 `/images/edits` 重绘
- **AI 提示词优化**：用对话模型把提示词扩写得更具体（图片/视频不同方向）
- **AI 对话**：可**独立选择接口与模型**（与出图分组分开）、对话历史自动保存、上传图片（视觉模型）/ 文本文件、Markdown 渲染、停止生成、导出 Markdown
- **多接口管理**：保存多个中转接口（各自地址 / Key / 图片·视频·对话模型 / 尺寸），一键「设为当前」，模型可从接口的 `/models` 下拉选择或手动输入
- **画廊**：浏览本地已保存的图片与视频，按类型筛选
- **用量统计**：累计图片/视频/优化/对话次数、成功率、近 7 天、按模型 Top
- **中转额度**：查询并常显当前接口余额（左下角 + 统计页），可设**低额度预警**（定时检查 + 系统通知）
- **运行日志**：每次请求的状态与**接口原始返回**，排查失败一目了然
- **主题**：海盐 / 晴绿 / 曜夜 + 自定义取色，自动记忆
- **托盘运行**：关闭可选「最小化到托盘 / 退出」，托盘图标随时恢复

---

## 运行环境

- Node.js 18+（开发用）
- 一个 OpenAI 兼容的中转 / 代理接口（地址通常以 `/v1` 结尾）

## 开发运行

```bash
npm install
npm run dev
```

> 国内网络若 `npm install` 后报 `Error: Electron uninstall`（Electron 二进制没下下来），用镜像重下：
>
> ```bash
> # PowerShell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; node node_modules/electron/install.js
> ```

## 打包成 .exe

```bash
npm run dist:win
```

产物在 `release/`（NSIS 安装包，可自定义安装路径、桌面快捷方式）。

> electron-builder 首次打包会下载工具链，国内可设镜像：
> `$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"`

---

## 配置说明

打开应用 →「设置 → 接口配置」，「新增接口」可保存多个中转，每个接口字段：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 接口名称 | 自定义备注 | `中转接口` / `gpt` |
| Base URL | OpenAI 兼容地址，通常以 `/v1` 结尾 | `https://kiro.apimf.top/v1` |
| API Key | 接口密钥 | `sk-...` |
| 图片模型 | 文生图模型 | `grok-imagine-image` / `flux` |
| 视频模型 | 文生视频模型（留空则不支持出片） | `grok-imagine-video` |
| 优化模型 | 对话模型，用于「AI 优化提示词」 | `gpt-4o-mini` / `grok-3-mini` |
| 图片/视频尺寸、时长 | 可选 | `1024x1024` / `1280x720` / `5` |
| 高级 · 接口路径 | 图生图 `/images/edits`、出片 `/videos/generations`，按平台改 | |

- 模型框可**从接口的 `/models` 下拉选择**（自动按图片/视频/对话筛选），也可切「手动输入」。
- 点接口左侧圆点或「设为当前」即生效（立即保存）。
- **对话页可单独选接口/模型**：比如出图用 A 中转、聊天用 B 中转的 GPT 分组，互不影响。

请求端点：出图 `…/images/generations`、出片 `…/videos/generations`、图生图 `…/images/edits`、对话/优化 `…/chat/completions`、模型列表 `…/models`、额度 `…/usage` 或 `…/dashboard/billing`。

---

## 额度与预警

- 进「统计」页或看侧栏左下角，会自动查询并显示当前接口**剩余额度**（每分钟刷新）。
- 设置 →「额度预警」：开启后每 60 秒检查余额，**跌破阈值弹提示 + 系统通知**（最小化到托盘也能收到）。
- 不同中转余额接口不一；查不到说明该中转用了别的端点。

## 数据存储位置

应用数据都在系统的用户数据目录（Windows 约为 `%APPDATA%/RawPhotos`）：

- `settings.json` 设置 · `rawphotos-chats.json` 对话历史 · `rawphotos-usage.json` 用量 · `rawphotos.log` 运行日志
- 生成的图片/视频默认存「图片/RawPhotos」，可在设置里改目录
- API Key 仅保存在本机，请求由主进程发起，不经浏览器、无跨域

---

## 技术栈

- Electron 42 + electron-vite
- Vue 3 + Vite（`<script setup>`）、`marked`（对话 Markdown）
- electron-builder（Windows NSIS 打包）

## 目录结构

```
src/
├── main/index.js       主进程：窗口/托盘、IPC、调接口、设置/历史/用量/日志、rawmedia 协议
├── preload/index.js    预加载：contextBridge 暴露 window.api
└── renderer/           Vue 渲染层
    ├── index.html
    └── src/
        ├── App.vue          外壳（导航 + 主题 + 余额 + 关闭弹窗 + 预警）
        ├── store.js         设置 + 会话结果 + 主题
        ├── components/      生成/对话/画廊/统计/日志/设置/关于 + 媒体卡/灯箱/下拉/图标/Toast
        └── composables/
```

> 给 AI 助手的工程记忆见 `AGENTS.md`。
