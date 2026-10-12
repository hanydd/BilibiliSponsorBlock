# Content 内部总线与事件

本文描述 content script 的通信接口。规则引擎的计算、执行和扩展方式见[跳过规则引擎技术设计与开发](skip-rules-implementation.md)。

## 接口与类型

[createContentApp()](../src/content/app/index.ts) 创建当前 content 上下文的公共对象。`getContentApp()` 返回该对象，初始化之前调用会抛错。

| 成员 | 职责 | 定义 |
| --- | --- | --- |
| `app.commands` | 注册并调用具名动作 | [CommandBus](../src/content/app/commandBus.ts) |
| `app.bus` | 发布事件并通知订阅方 | [EventBus](../src/content/app/eventBus.ts) |
| `app.store` | 保存共享业务状态快照 | [ContentStore](../src/content/app/store.ts) |
| `app.ui` | 保存当前 UI 实例引用 | [ContentUIRegistry](../src/content/app/uiRegistry.ts) |

事件常量集中在 [events.ts](../src/content/app/events.ts)。`ContentEventMap`、`ContentCommandMap` 和 `ContentAppState` 的完整字段定义在 [types.ts](../src/content/app/types.ts)。

`CommandBus.register()` 为一个命令设置一个处理函数，并返回注销函数。重复注册替换原处理函数。`execute()` 直接调用处理函数，返回其结果或 Promise。未注册的命令会抛错。

`EventBus.on()` 返回取消订阅函数。`emit()` 同步通知当前订阅方，不等待异步处理完成，也不保存供后续订阅方重放的事件。元数据包含 `source` 和 `timestamp`，默认来源为 `unknown`。

总线只用于当前 content 上下文。popup、background 和 MAIN world 的跨上下文通信仍通过浏览器消息 API 或 `window.postMessage`。

## 页面和视频生命周期

[src/utils/video.ts](../src/utils/video.ts) 负责检测页面与视频身份，[src/content.ts](../src/content.ts) 负责调用其他 content 模块。

`page/contextChanged` 表达路由上下文变化。页面类型与视频实例状态分开保存，切换视频不会清空页面类型。

视频身份切换先发送 `video/resetRequested`，再更新身份并发送 `video/idChanged`。前者触发旧视频清理，后者触发片段查询、草稿恢复和 UI 更新。`video/elementChanged` 表达实际 video 节点变化，`video/channelResolved` 表达频道解析完成。

页面框架就绪由 [pageReadiness.ts](../src/content/pageReadiness.ts) 统一管理。MAIN world 在 [pageMount.ts](../src/document/pageMount.ts) 检查 Vue 挂载或 Next.js 已提交的 React root hydration 状态，再通过消息桥发布 `app/pageReady`。SSR 数据、`router.isReady` 和 DOM 可见都不能证明 hydration 已完成。已就绪的 MAIN 会响应重放请求，避免较晚注入的 content 漏掉信号。

页面组件、缩略图、动态和评论过滤器调用 `waitForPageReady()`，不再各自轮询或设置 hydration 超时。晚到的调用从当前状态立即返回。调用方可以传入自己的超时或 AbortSignal，取消一个等待不会影响其他组件。已知框架根节点即使等待超过 30 秒也保持关闭注入；只有没有受支持框架根节点的页面才使用 document complete 兜底。

首页、动态流、搜索、空间和 opus 等无播放器页面只等待 `app/pageReady`，页面功能不依赖 `player/uiReady`。动态过滤器在 hydration 后扫描已有卡片，并通过 DOM 变化发现晚到或替换的列表；评论过滤器同时保留对各层 shadow root 后续渲染的观察。MAIN world 的动态作者 ID 提取也在挂载确认后启动，先填充已有卡片的 ID，再发送页面就绪信号供白名单判断使用。没有动态列表时不启动超时轮询，扩展清理会取消 content 中未完成的页面等待和观察器。查询 `getVideo()` 在没有主播放器 video 时直接返回，不请求帧率或等待媒体节点；主播放器出现后由宿主变化重新触发绑定，卡片预览不参与绑定。

播放器宿主就绪由 [playerUi.ts](../src/content/playerUi.ts) 和 [PlayerUiLifecycle](../src/content/playerUiLifecycle.ts) 管理。它订阅页面、视频身份、视频节点和媒体状态事件，通过 DOM 观察器和 ResizeObserver 监听宿主及纯 CSS 尺寸变化，同时处理页面可见性与窗口尺寸变化。hydration、媒体元数据、宿主连接和布局都满足条件，且 video、左右控制区和进度条节点稳定 150 毫秒后，才发布 `player/uiReady`。

| 事件 | 消费方与用途 |
| --- | --- |
| `player/uiReady` | 提交模块挂载或迁移按钮、跳过按钮与页面组件；进度条模块创建或恢复标记 |
| `player/uiInvalidated` | 进度条模块检查已移除或已换主的宿主 |
| `player/timelineChanged` | 进度条模块重算标记位置和跳过后的时长 |

`waitForPlayerUiReady()` 使用同一个生命周期实例，保存稳定宿主快照供后续调用读取。每个等待有独立截止时间，清理时取消观察器、订阅、定时器与未完成等待。视频身份变化会重新确认宿主，即使 B 站复用了 video。宿主子节点被重写也会恢复扩展实例，不依赖固定的多组延迟补查。

content 启动入口统一等待 `Config.ready`，页面 hydration 信号的监听在此之前建立，配置较慢时不会遗漏页面就绪。媒体绑定不再单独轮询配置或设置超时。就绪事件中的宿主快照直接传给按钮；其他入口共享一次就绪等待。React 按钮通过提交回调确认渲染并应用最新草稿，宿主在渲染期间替换时直接迁移同一个 root。原生时长控件可以晚于其他控制栏出现：生命周期观察它的到达或替换，跳过按钮按新快照挂载，不在组件中等待旧节点；挂载前收到的启用、停用状态也会保留。

时间轴长度由 [getPlayerTimelineDuration()](../src/utils/playerDuration.ts) 从当前播放器读取。大会员和充电试看可能只有几分钟媒体，但原生进度条显示整片时长；标记和剩余时长使用整片时间轴。原生刻度也可能短于媒体或接口时长，不能取两者的最大值。普通视频保留媒体的小数精度，原生标签的一秒取整差异不会改变时间轴。媒体 durationchange 或原生时长文本变化都由生命周期层转为 `player/timelineChanged`，渲染模块不再单独监听时长文本。

[#326](https://github.com/hanydd/BilibiliSponsorBlock/issues/326) 中的媒体时长在加载后重新计算，标记跟随最终的原生刻度。跨越末尾的区间裁剪，完全超出刻度的区间和点隐藏；原始片段时间保留，刻度恢复时可以重新显示。YouTube 匹配继续用媒体时长做源校验，与显示刻度分开。标记覆盖层不接收鼠标事件，原生进度条继续处理悬停预览和点击跳转。

媒体事件由 [videoListeners.ts](../src/content/videoListeners.ts) 绑定。视频身份模块订阅媒体就绪事实，在复用 video 的 Next.js 页面上于新元数据到达后重新读取 manifest，处理路由先变化、manifest 后变化的情况。

## 片段和配置事件

[segmentSubmission.ts](../src/content/segmentSubmission.ts) 发布片段快照。`segments/loaded` 对应正式片段，`segments/submittingChanged` 对应草稿，`segment/updated` 对应局部修改。

草稿写入命令包括 `segments/updateSubmitting`、`segments/addSubmitting`、`segments/replaceSubmitting`、`segments/removeSubmitting` 和 `segments/clearSubmitting`。处理函数更新 `contentState.sponsorTimesSubmitting`，按需要保存 `Config.local.unsubmittedSegments`，同步 store，再发布事件。

[previewBarManager.ts](../src/content/previewBarManager.ts) 订阅片段变化并刷新进度条。`segmentSubmission` 的订阅方更新提交界面和相关查询。当前播放引擎也订阅这些事件并重新判断。

[messageHandler.ts](../src/content/messageHandler.ts) 将配置同步通知发布为 `config/changed`。频道白名单通过 `channel/whitelistChanged` 发布。经典调度器、经典倍速管理、规则 runtime 和跳过 UI 各自处理相关字段。

## 两种播放引擎的事件入口

经典模式中，[skipScheduler.ts](../src/content/skipScheduler.ts) 订阅 `player/play`、`player/playing`、`player/seeking`、`player/pause`、`player/waiting`、`player/rateChanged` 及时间更新事件。[speedUpManager.ts](../src/content/speedUpManager.ts) 维护经典模式的倍速和恢复状态。

规则模式中，[SkipRulesRuntime](../src/content/skipRules/runtime.ts) 直接监听当前 video 的媒体事件，并订阅配置、片段、白名单和视频生命周期事件。经典入口通过 `isRuleEngineEnabled()` 退出或转交。注册着两套监听器不代表两套引擎同时执行播放操作。

`player/videoReady` 和 `player/durationChanged` 是媒体事实，由播放器生命周期层派生出 UI 就绪和时间轴变化。它们继续保留播放引擎原有的语义；播放器 UI 的就绪不会替代规则 runtime 对当前位置的判断。

## 播放结果与 UI

`skip/noticeRequested` 请求展示或更新卡片。`skip/buttonStateChanged` 请求启用或停用播放器跳过按钮。两者由 [skipUIManager.ts](../src/content/skipUIManager.ts) 接收。

经典调度器与规则 runtime 都使用上述 UI 事件。规则请求额外携带 `ruleCard`。`skipUIManager` 管理 notice 的创建、更新、移除和可见卡片的快捷键目标。

`speedup/stateChanged` 表达当前是否快进及是否存在暂停上下文，由经典倍速管理或规则 runtime 发布。`skip/executed` 由经典执行链发布。规则 runtime 使用 `applied` 反馈和注入的统计回调，不依赖该总线事件确认完成。

`skip/closeNotices` 是批量关闭展示的命令。用户主动排除片段的语义由操作入口传递给引擎，卡片自然到期和视频清理不等于用户取消。

## 调用追踪

[trace.ts](../src/content/app/trace.ts) 记录开发构建中的命令和事件摘要。`lifecycleDebug` 控制控制台输出。数组和 DOM 对象在摘要中压缩显示，不是完整业务状态。

规则决定另外通过 `[SB Rules]` 日志记录。该日志包含规则编号和执行计划，使用方法见[定位一条错误的决定](skip-rules-implementation.md#定位一条错误的决定)。
