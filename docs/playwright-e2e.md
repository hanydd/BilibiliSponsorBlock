# 运行 Playwright 页面集成测试

用本指南验证构建后的 Chromium 扩展。规则引擎的测试选择见[规则引擎开发与验证](skip-rules-implementation.md#开发与验证)。

## 准备浏览器与构建

1. 如果仓库没有 `config.json`，从 `config.json.example` 复制一份。
2. 安装依赖。

```bash
npm ci
```

3. 安装测试使用的 Chromium。

```bash
npx playwright install --with-deps --no-shell chromium
```

4. 构建当前工作区的扩展。

```bash
npm run build:dev
```

测试从 `dist/` 加载 MV3 扩展。每个用例使用独立的临时用户目录。不要将日常浏览器的用户数据目录交给测试。

## 运行离线回归

运行以下命令，先构建，再执行排除了 `@real` 和 `@local-server` 的用例。

```bash
npm run test:e2e
```

如果已经构建当前代码，直接选择需要验证的文件。

```bash
npx playwright test e2e/skip-rules.spec.ts e2e/rule-settings.spec.ts
```

查看当前用例清单和数量，不依赖文档中的历史测试结果。

```bash
npx playwright test --list --grep-invert '@real|@local-server'
```

离线用例使用真实扩展 API，以及本地播放器页面、WebM 和接口响应。页面保留 Bilibili URL，让 Chrome 按 manifest 注入内容脚本。Vue 就绪信号经过实际 MAIN-world 检测链，播放器 DOM 和媒体事件由 fixture 提供。

## 检查真实 Bilibili 页面

运行真实页面冒烟用例。

```bash
npm run test:e2e:real
```

如果只检查新规则引擎的相邻片段衔接，使用固定片段快照运行对应文件。

```bash
BSB_E2E_SKIP_ENGINE=rules npx playwright test e2e/notice-adjacent.real.spec.ts
```

上述环境变量只由相邻片段用例读取，不是所有测试的引擎切换开关。其他用例在测试初始化中指定配置。

真实页面不等于真实后端。fixture 默认拦截 SponsorBlock API，各用例可提供自己的片段或标签数据。如果需要访问线上后端，显式设置 `BSB_E2E_LIVE_API=1`。

如果需要查看当前真实用例清单，运行以下命令。

```bash
npx playwright test --list --grep '@real' --grep-invert '@local-server'
```

## 验证向本地服务提交片段

此用例会在测试数据库中新建片段。先在 `config.json` 的 `testingServerAddress` 启动 SponsorBlockServer，再运行以下命令。

```bash
npm run test:e2e:local-server
```

用例在真实播放器中录制片段、打开编辑器、预览并提交。测试随后通过 `/api/segmentInfo` 回查提交结果。提交使用独立 E2E 用户，不写入 `serverAddress` 指向的线上服务。

## 调整浏览器和代理

如果需要观察页面，设置 `BSB_E2E_HEADED=1`。如果需要检查另一份构建，设置 `BSB_E2E_EXTENSION_PATH`，默认目录是 `dist/`。

如果需要使用指定的 Chromium 可执行文件，设置 `BSB_E2E_EXECUTABLE_PATH`。检查旧版浏览器时，同时设置 `BSB_E2E_HEADED=1`。Chromium 构建声明的最低版本见 [manifest/chrome-manifest-extra.json](../manifest/chrome-manifest-extra.json)。

真实视频冒烟入口可通过 `BSB_E2E_REAL_VIDEO_URL` 指定视频。固定场景用例保留自己的视频和片段快照。

如果系统代理影响真实页面连接，设置 `BSB_E2E_DIRECT=1`，让 Chromium 使用 `--no-proxy-server`。如果必须使用代理，设置 `BSB_E2E_PROXY_SERVER`。需要绕过代理的域名通过 `BSB_E2E_PROXY_BYPASS` 指定，用逗号分隔。

不要同时设置 `BSB_E2E_DIRECT` 和 `BSB_E2E_PROXY_SERVER`。PowerShell 中可以这样运行有界面的直连检查。

```powershell
$env:BSB_E2E_HEADED = "1"
$env:BSB_E2E_DIRECT = "1"
npm run test:e2e:real
```

## 排查失败

1. 打开 `test-results/` 中失败用例的截图和错误上下文。
2. 查看同目录的录像。
3. 打开 trace，核对失败前后的输入、页面状态和网络请求。

```bash
npx playwright show-trace test-results/<失败用例目录>/trace.zip
```

CI 失败时，从工作流的 **Test Results** 附件下载这些文件。真实页面用例还会附带生命周期或页面诊断数据，具体附件由用例决定。

如果真实页面被 Bilibili 风控拦截，先核对诊断附件。检测到 HTTP 412 风控页的用例会标记为跳过，并说明原因。代理连接错误、页面结构变化和扩展回归仍会失败。

如果怀疑全局代理，使用直连配置从本地网络复查。不要用延长超时或反复重试代替对错误原因的定位。日常提交验证使用离线回归，真实页面检查用于核对宿主网站行为。
