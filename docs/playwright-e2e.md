# Playwright 页面集成测试

这套测试使用 Playwright 自带的 Chromium 和独立临时用户目录加载 `dist/` 中的 MV3 扩展。

默认测试不访问 Bilibili 或 SponsorBlock 后端：

- 选项页测试直接打开 `chrome-extension://.../options/options.html`。
- 内容脚本测试仍访问 `https://www.bilibili.com/video/...`，但用 `page.route()` 返回本地播放器骨架和一段 120 秒的轻量 WebM。因此 Chrome 会按真实 manifest 匹配规则注入内容脚本，扩展也能读到真实的媒体元数据，又不会受 Bilibili 网络、登录状态或风控影响。
- 本地页面不会直接伪造 `pageReady` 消息，而是设置真实的 `#app.__vue_app__`，由扩展的 MAIN-world 脚本检测 Vue3 hydration，再通知 ISOLATED-world 内容脚本。
- `https://www.bsbsb.top/**` 默认返回按端点构造的本地响应，避免后台接口让页面测试变得不稳定；单个用例可以覆盖默认响应，例如为跳过测试返回指定片段。
- 每条测试使用独立的 Chromium 用户目录。fixture 会处理 MV3 service worker 重启、首次安装帮助页和固定测试用户，防止标签页及存储状态在用例之间泄漏。
- 标有 `@real` 的用例单独访问真实 Bilibili，只用于人工或定时冒烟检查，不应作为提交合并的稳定门禁。
- 标有 `@local-server` 的用例还会把扩展切换到 `config.json` 的 `testingServerAddress`，向预先启动的本地测试服务真实提交数据。

## 当前覆盖

`npm run test:e2e` 当前运行 26 条稳定用例：

| 区域 | 覆盖的常规场景 |
| --- | --- |
| 选项页 | 标签切换与刷新、主题开关、数字和下拉配置、分类跳过策略、快捷键编辑、白名单删除和清空 |
| 播放器控件 | 开始/结束录制、取消录制、打开提交编辑器、默认键盘快捷键、本地未提交片段持久化 |
| 内嵌弹窗 | 打开/关闭、启停跳过、导入片段、录制并提交、频道白名单添加/移除 |
| 视频跳过 | 赞助片段自动跳过、撤销/重做、自我推广手动跳过、全局禁用跳过、高光点前后 seek 时按钮显示/隐藏 |
| 内容与提交 | manifest 内容脚本注入、BV/CID 识别、提交编辑器的动作类型切换 |
| Vue hydration | hydration 前不挂载插件、Vue3 mount 信号、SSR 控件被 hydration 替换后挂载到新控件、`pageReady → playerUI → playerButtons` 顺序 |
| 缩略图标签 | hydration 前不写入 DOM、原生页面与顶部弹层、Bewly 各页面、延迟 Shadow Root、容器替换及卡片复用恢复 |

这些用例验证构建后的真实扩展包和真实 Chrome 扩展 API，不是对页面函数的直接单元调用。

`npm run test:e2e:real` 当前运行 8 条真实 Bilibili 冒烟用例：

- 检查真实页面发出 Vue mount 信号（兼容 Bilibili 灰度期间的 Vue2/Vue3），且没有走 30 秒超时 fallback。
- 检查扩展按钮只在 `pageReady` 和播放器 UI ready 之后挂载到真实的 `.bpx-player-control-bottom-right`，并实际打开内嵌弹窗。
- 在真实播放器上导入片段、打开提交编辑器并切换动作类型。
- 在 `BV1hUvpewEYD` 的真实播放器上验证 34.8 秒高光标记，以及 seek 到高光之后隐藏、seek 回高光之前恢复的按钮状态。
- 点击真实推荐视频完成同一 document 的 SPA 路由切换，验证离开时清空高光，浏览器返回时恢复高光，并且扩展控件没有重复挂载。
- 在真实首页、视频推荐、搜索和空间页 mock videoLabel 返回，验证现网缩略图选择器、BV 提取和标签渲染。

真实用例会把完整扩展生命周期保存到 `bilibili-extension-lifecycle` 或 `highlight-spa-diagnostics` 附件，方便区分 hydration、播放器未就绪、控件选择器变化和 SPA 状态覆盖。

`npm run test:e2e:local-server` 额外运行一条完整提交主流程：

- 在 `BV1hUvpewEYD` 的真实播放器上使用插件控件记录一个动态时间段。
- 打开提交编辑器、预览片段并点击提交。
- 验证扩展向 `testingServerAddress` 发出真实的 `POST /api/skipSegments`，服务端返回 UUID，客户端清空本地草稿。
- 通过本地服务的 `/api/segmentInfo` 回查 PostgreSQL 中的 BV、CID、时间、分类、动作类型和客户端版本。

该用例会在本地测试数据库中新增一条使用独立 E2E 用户 ID 的 `sponsor/skip` 片段，不连接或写入 `serverAddress` 指向的线上服务。

## 首次安装

```bash
npm ci
npx playwright install chromium
```

构建前还需要 `config.json`。本地没有该文件时，从 `config.json.example` 复制一份。

## 运行

```bash
# 构建扩展并运行稳定、离线的页面集成测试
npm run test:e2e

# 单独运行真实 Bilibili 冒烟测试
npm run test:e2e:real

# SponsorBlockServer 已在 testingServerAddress 启动后，运行真实提交联调
npm run test:e2e:local-server

# 已经构建过 dist/ 时，直接选择用例迭代
npx playwright test --grep-invert "@real|@local-server"
```

失败时会在 `test-results/` 中保留截图、录像和 trace。可用下面的命令打开 trace：

```bash
npx playwright show-trace path/to/trace.zip
```

## 浏览器、代理和风控

默认使用支持扩展的新无头 Chromium。需要观察页面时设置 `BSB_E2E_HEADED=1`。

真实 Bilibili 测试支持以下环境变量：

| 变量 | 作用 |
| --- | --- |
| `BSB_E2E_REAL_VIDEO_URL` | 替换真实冒烟测试的视频 URL |
| `BSB_E2E_DIRECT=1` | 向 Chromium 传入 `--no-proxy-server`，不使用系统代理 |
| `BSB_E2E_PROXY_SERVER` | 显式指定 HTTP 或 SOCKS 代理，例如 `http://127.0.0.1:7890` |
| `BSB_E2E_PROXY_BYPASS` | 使用显式代理时指定逗号分隔的直连域名 |
| `BSB_E2E_LIVE_API=1` | 不 mock SponsorBlock 后端，用于专门的线上联调 |

`BSB_E2E_DIRECT` 和 `BSB_E2E_PROXY_SERVER` 不能同时设置。

Bilibili 没有公开 HTTP 412/“请求被拦截”的稳定判定规则。出口 IP、请求频率、共享代理和浏览器环境都可能与服务端风控结果相关，因此伪造 User-Agent 不能作为稳定解法，也不应在 CI 中反复重试真实站点。推荐顺序是：

1. 日常和 CI 使用默认离线用例。
2. 真实冒烟失败时先查看 `bilibili-page-diagnostics` 附件和 trace。
3. 若使用全局代理，先用 `BSB_E2E_DIRECT=1` 从可信本地网络重试。
4. 必须走代理时，使用 `BSB_E2E_PROXY_SERVER` 明确代理，并让 Bilibili 相关域名通过 `BSB_E2E_PROXY_BYPASS` 直连。

真实用例检测到 412 风控页时会显示为 skipped，并给出原因；代理连接错误、页面结构变化或扩展功能回归仍会正常失败。不要复用日常 Chrome 的用户数据目录来规避风控：这会污染真实浏览数据，也不受 Playwright 支持。

本地验证时，真实视频页在默认网络和 `BSB_E2E_DIRECT=1` 下都曾返回 HTTP 200；但这只能说明当时的出口未触发风控，不能保证 CI、共享代理或其他 IP 的结果。当前全新 Chromium 用户目录拿到的页面可能报告 Vue2，其他账号或灰度批次可能报告 Vue3，所以真实用例接受两者；延迟 Vue3 hydration 的精确时序由稳定用例强制覆盖。稳定门禁仍以本地可控页面为准。

PowerShell 示例：

```powershell
$env:BSB_E2E_HEADED = "1"
$env:BSB_E2E_DIRECT = "1"
npm run test:e2e:real
```
