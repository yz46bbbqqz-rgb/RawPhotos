# RawPhotos · 工程记忆（AI 助手专用）

> 给在本项目里写代码的 AI（Cursor / Claude / Codex 等）看的长期记忆。人看的使用说明在 `README.md`。
> 本文件侧重「整体结构 / 为什么这么设计 / 改代码要注意什么」。

## 一句话

Electron + Vue 3 桌面应用：通过任意 **OpenAI 兼容的中转 / 代理接口** 做 **文生图 / 文生视频 / 图生图 / AI 对话**，并带 **多接口管理、用量统计、中转额度、运行日志、主题**。
**面向中转/聚合代理（不是本机服务）**——写文案/默认值别默认「本地」，用「中转接口」这类中性措辞。
所有网络与文件操作都在**主进程**，渲染层只通过 `window.api`（preload 暴露）调用，**绝不**在渲染层直连接口或读写磁盘。

## 技术栈 / 命令 / 风格

- Electron 42 · electron-vite · Vue 3.5（`<script setup>`）· electron-builder 26 · `marked`(对话 Markdown)。Node 18+。
- 开发 `npm run dev`（electron-vite dev：改主/预加载会**自动重启**主进程，改渲染层是 HMR）；构建校验 `npm run build`；打包 `npm run dist:win`。
- 代码风格：**2 空格、单引号、不写分号**，跟现有文件一致。
- 改了主进程（`src/main` / `src/preload`）需要重启 dev 才生效（一般自动重启）；纯渲染层热更新。

## 进程 / 文件地图

```
src/main/index.js      主进程：设置读写+迁移、全部 IPC、调接口(图/视频/图生图/对话/优化)、
                       额度/用量/日志/对话历史、托盘、通知、rawmedia 协议、窗口
src/preload/index.js   contextBridge 暴露 window.api（含纯函数 mediaUrl）
src/renderer/src/
  store.js             reactive：settings + 本次会话 results；THEMES/applyTheme/setTheme/setCustomColor
  App.vue              外壳：侧栏导航(生成/对话/画廊/统计/日志/设置/关于) + 主题色点 + 左下角余额 +
                       状态卡 + 关闭弹窗(托盘/退出) + 额度预警检查(定时器)
  components/
    GenerateView.vue   图片/视频切换 + 接口下拉 + 模型下拉(自动匹配/手动) + 提示词 + AI优化 +
                       图生图参考图 + 生成队列(顺序执行) + 结果网格
    ChatView.vue       AI 对话：左历史会话列表 + 右对话；底部独立「接口」「模型」下拉；
                       图片/文本上传、Markdown 渲染、停止、清空、导出 md、复制
    GalleryView.vue    本地图片(dataUrl)+视频(rawmedia://) 网格 + 全部/图片/视频筛选 + 另存为
    StatsView.vue      中转额度卡 + 本地累计用量(byKind/byModel/byDay) + 成功率 + 7天柱状（60s 定时刷新）
    LogsView.vue       运行日志（出图/出片/优化/测试/对话 + 原始返回，可清空/打开文件）
    SettingsView.vue   多接口增删改/设为当前(即时持久化)/测试连接 + 外观主题(含自定义色) +
                       通用(数量/目录) + 额度预警(开关+阈值)
    AboutView.vue      关于（版本 app:version + 网站链接 + QQ 群 1105572960 复制 + 功能一览）
    MediaCard.vue      会话结果卡（图片<img>/视频<video>，保存/另存为/复制提示词）
    Lightbox.vue       放大预览（图片或 controls 视频，按 kind）
    Dropdown.vue       themed 下拉（替代原生 select；下方空间不足自动向上弹；options 支持 string[]/{value,label}[]）
    Icon.vue           内置 SVG path 图标库（加图标进 PATHS；填充图标进 FILLED）
    TitleBar.vue       无边框标题栏（品牌 + 网站链接 + 最小化/最大化/关闭(emit close-request)）
    ToastHost.vue      全局 toast
  composables/useToast.js
```

## 持久化文件（都在 `app.getPath('userData')`）

| 文件 | 内容 |
| --- | --- |
| `settings.json` | 全部设置（见下） |
| `rawphotos.log` | 运行日志（**JSONL**，每行一个完整 entry，启动读回 ≤300 行） |
| `rawphotos-usage.json` | 累计用量（byKind/byModel/byDay/ok/fail/firstAt，长期累计） |
| `rawphotos-chats.json` | 对话历史（每会话含完整 messages，≤80 个；**立即落盘**不 debounce） |

## 设置数据结构（settings.json）

```js
{
  providers: [{
    id, name, baseUrl, apiKey,
    imageModel, videoModel, optimizeModel,   // 三类模型分开
    imageSize, videoSize, videoSeconds,
    editPath: '/images/edits',               // 高级：图生图端点
    videoPath: '/videos/generations',        // 高级：出片端点
    videoPollPath: ''                        // 高级：异步出片轮询（{id} 占位）
  }],
  activeProviderId,        // 生成页用的当前接口
  chatProviderId,          // 对话页用的接口（可与生成不同分组！）
  chatModel,               // 对话模型
  defaultCount,            // 默认出图数量
  saveDir,                 // 图片/视频保存目录（空=图片/RawPhotos）
  theme,                   // 'sky'(默认) | 'green' | 'dark' | 'custom'
  customColor,             // 自定义主题强调色 hex
  closeAction,             // 'ask'(默认) | 'tray' | 'quit'
  alertEnabled, alertThreshold  // 额度预警
}
```

- `migrate()`（主进程）：旧扁平配置→provider；补全字段；非法 theme→sky；历史「本地 CLIProxyAPI」名→「中转接口」；`grok-2-image`→`grok-imagine-image`；空 videoModel→`grok-imagine-video`。
- 改设置统一 `settings:set`（renderer 传完整字段，主进程 `writeSettings` 合并+再 migrate）。`persistSettings(patch)` 只传变化字段，其余保留。

## IPC 一览（preload → 主进程）

| window.api | channel | 说明 |
| --- | --- | --- |
| getSettings/saveSettings | settings:get / :set | 读写设置（含迁移） |
| testConnection(provider) | connection:test | 测 `/models`（会记日志） |
| listModels(provider) | models:list | 静默拉 `/models`（不记日志，给下拉填充） |
| generateImage / editImage | image:generate / image:edit | 文生图(JSON) / 图生图(multipart `/images/edits`) |
| generateVideo | video:generate | `videoPath`，同步抽取或异步轮询 |
| optimizePrompt({prompt,mode}) | prompt:optimize | 用 `optimizeModel` 扩写提示词（按 mode 切系统提示） |
| chatSend({providerId,model,messages}) | chat:send | 对话，转发完整 messages（vision content 数组）；可被 chat:abort 停止 |
| chatAbort | chat:abort | 停止当前对话（`activeChatAbort`；requestJson 支持外部 signal） |
| chatsList/Get/Save/Delete | chats:* | 对话历史 CRUD（立即落盘） |
| saveMedia/saveMediaAs | media:save / :saveAs | 保存图片/视频（payload 支持 b64/url/path） |
| saveTextFile | file:saveText | 保存文本（对话导出 md） |
| listGallery | gallery:list | 画廊：图片 dataUrl + 视频 path |
| mediaUrl(absPath) | （纯函数） | 转 `rawmedia://media/?p=<encodeURIComponent(path)>` |
| getUsage/resetUsage | usage:get / :reset | 累计用量 |
| getQuota(provider?) | quota:get | 中转额度（见下）；**失败返回 `{error}` 不抛异常**（防控制台刷屏） |
| getLogs/clearLogs/openLogFile · onLog | logs:* | 运行日志 |
| openExternal/quitApp/getVersion/notify | app:* | 外链/退出/版本/系统通知 |
| pickDir/openPath/defaultSaveDir | app:* | 目录 |
| window.* | window:* | 最小化/最大化/隐藏(=收起托盘)/状态 |

## 关键设计 / 约束（改前必读）

1. **接口返回格式很杂，统一 `pickMediaItems(json)` 抽取**媒体（data[].b64_json/url、url/video_url/output/result.url…）。新增供应商优先扩展它。
2. **JSON 请求收口在 `requestJson`**（超时/鉴权/错误清洗/外部 signal）；**multipart（图生图）走 `requestMultipart`**；两者失败都把 `err.status`+`err.responseText`（原始返回前 2000 字）挂到 error 上，供日志展示。
3. **视频可能异步**：`video:generate` 先同步抽取，抽不到找任务ID(`id/task_id/request_id`)走 `pollVideoJob`（≤10 分钟，`videoPollPath` 可覆盖，终态词 `TERMINAL_OK/BAD`）。
4. **本地视频走 `rawmedia://` 协议**流式读取（`registerSchemesAsPrivileged` 在 ready 前；`protocol.handle` 里 `net.fetch(pathToFileURL(p))`，支持 `<video>` range）。图片仍内联 dataUrl。
5. **安全**：`contextIsolation:true` + `nodeIntegration:false` + preload 白名单。对话 Markdown 用 `marked` + 简单 sanitize（去 `<script>`/`on*`/`javascript:`）；链接点击拦截走 openExternal。
6. **会话结果 vs 画廊 vs 历史**：`store.results`=本次生成（未必落盘）；画廊=saveDir 已落盘文件；对话历史=`rawphotos-chats.json`。三者形态不同别混。
7. **生成队列**：GenerateView 点生成=入队（`queue`），`runQueue` 顺序执行（图/视频/图生图）。每个任务有 pending/running/error。
8. **模型下拉过滤**：生成页按 IMG_RE/VID_RE 筛图/视频模型并自动选当前接口默认；对话页 CHAT_FILTER 排除 image/video 类。都带「手动输入」兜底。

## 中转额度（quota:get）

依次试：`{baseUrl}/usage`（`remaining`/`balance`/`quota.remaining` + `unit`）→ `/dashboard/billing/subscription`+`/usage` → `/dashboard/billing/credit_grants`。都没有返回 `{error}`。**自动用当前/对话接口，无需单独配置**。不同中转额度接口不一，接新的就在这里加分支。
- 展示位：StatsView 顶部卡（剩余/总/已用+进度条，60s 刷新）+ 侧栏左下角（剩余，60s 刷新）。
- **额度预警**：`alertEnabled`+`alertThreshold`，App.vue 余额定时器里 `checkAlert`：低于阈值 toast + 系统通知 `app:notify`；`belowAlerted` 标志保证每次跌破只提醒一次。

## 主题系统

- `sky`(海盐·浅白天青，**默认**) / `green`(晴绿·浅白青绿) / `dark`(曜夜·柔和深色青绿) / `custom`(自定义)。清单在 `store.js` 的 `THEMES`（custom 不在数组、在 `THEME_IDS` 白名单）。
- `:root` = green 基色；`sky`/`dark`/`custom` 用 `[data-theme]` 覆盖。`custom` 中性浅底 + `applyTheme` 按 `customColor` 内联注入 `--accent` 等（非 custom 时清除内联）。
- 组件**只用 `var(--token)`**。新增主题=加 `[data-theme]` 块 + `THEMES` 一项。`main.js` 挂载前读 localStorage 防闪。

## 窗口 / 托盘 / 退出

- 标题栏 **X** `emit('close-request')` → App `onCloseRequest` 按 `settings.closeAction`：tray 收起 / quit 退出 / ask 弹窗（可记住）。「—」普通最小化。
- 系统托盘 `createTray`：左键/双击恢复；右键菜单 显示/退出。收起托盘=`window:close`(hide)，退出=`app:quit`。

## 命名 / 品牌位置（改名看这里）

标题栏品牌名→`TitleBar.vue .tb-name`；网站链接→`TitleBar.vue SITE`(当前 https://nexus.apimf.top)；窗口标题→`main` BrowserWindow `title`；HTML 标题→`renderer/index.html`；安装包/快捷方式/appId→`electron-builder.yml`；包名→`package.json`；默认目录/文件名前缀→`main` `defaultSaveDir()`/`media:save`；QQ 群→`AboutView.vue QQ_GROUP`。

## 待确认 / 已知假设

- **视频接口**无统一标准：默认 `/videos/generations`（可在设置高级改），同步/异步都兼容；具体视频模型名需用户填。
- **图生图**默认 `/images/edits`（multipart，OpenAI/Grok 通用），路径可改。
- **额度接口**各家不一，已试 `/usage` + `/dashboard/billing`；新中转格式不同需加分支。
- **/models 可能列出账号组不支持的模型**（对话选到会 404）——属中转侧问题，提示用户换模型即可。
- 用户参考接口：`POST https://kiro.apimf.top/v1/images/generations { model:"flux", ... }`；额度 `GET {baseUrl}/v1/usage`（remaining/balance/unit）。
