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

页面框架就绪与播放器 UI 就绪是不同条件。媒体事件由 [videoListeners.ts](../src/content/videoListeners.ts) 绑定，依赖控制栏的 UI 通过 [waitForPlayerUiReady()](../src/content/playerUi.ts) 等待宿主节点稳定。

## 片段和配置事件

[segmentSubmission.ts](../src/content/segmentSubmission.ts) 发布片段快照。`segments/loaded` 对应正式片段，`segments/submittingChanged` 对应草稿，`segment/updated` 对应局部修改。

草稿写入命令包括 `segments/updateSubmitting`、`segments/addSubmitting`、`segments/replaceSubmitting`、`segments/removeSubmitting` 和 `segments/clearSubmitting`。处理函数更新 `contentState.sponsorTimesSubmitting`，按需要保存 `Config.local.unsubmittedSegments`，同步 store，再发布事件。

[previewBarManager.ts](../src/content/previewBarManager.ts) 订阅片段变化并刷新进度条。`segmentSubmission` 的订阅方更新提交界面和相关查询。当前播放引擎也订阅这些事件并重新判断。

[messageHandler.ts](../src/content/messageHandler.ts) 将配置同步通知发布为 `config/changed`。频道白名单通过 `channel/whitelistChanged` 发布。经典调度器、经典倍速管理、规则 runtime 和跳过 UI 各自处理相关字段。

## 两种播放引擎的事件入口

经典模式中，[skipScheduler.ts](../src/content/skipScheduler.ts) 订阅 `player/play`、`player/playing`、`player/seeking`、`player/pause`、`player/waiting`、`player/rateChanged` 及时间更新事件。[speedUpManager.ts](../src/content/speedUpManager.ts) 维护经典模式的倍速和恢复状态。

规则模式中，[SkipRulesRuntime](../src/content/skipRules/runtime.ts) 直接监听当前 video 的媒体事件，并订阅配置、片段、白名单和视频生命周期事件。经典入口通过 `isRuleEngineEnabled()` 退出或转交。注册着两套监听器不代表两套引擎同时执行播放操作。

`player/videoReady` 和 `player/durationChanged` 也用于进度条初始化和更新。播放器 UI 的就绪不会替代规则 runtime 对当前位置的判断。

## 播放结果与 UI

`skip/noticeRequested` 请求展示或更新卡片。`skip/buttonStateChanged` 请求启用或停用播放器跳过按钮。两者由 [skipUIManager.ts](../src/content/skipUIManager.ts) 接收。

经典调度器与规则 runtime 都使用上述 UI 事件。规则请求额外携带 `ruleCard`。`skipUIManager` 管理 notice 的创建、更新、移除和可见卡片的快捷键目标。

`speedup/stateChanged` 表达当前是否快进及是否存在暂停上下文，由经典倍速管理或规则 runtime 发布。`skip/executed` 由经典执行链发布。规则 runtime 使用 `applied` 反馈和注入的统计回调，不依赖该总线事件确认完成。

`skip/closeNotices` 是批量关闭展示的命令。用户主动排除片段的语义由操作入口传递给引擎，卡片自然到期和视频清理不等于用户取消。

## 调用追踪

[trace.ts](../src/content/app/trace.ts) 记录开发构建中的命令和事件摘要。`lifecycleDebug` 控制控制台输出。数组和 DOM 对象在摘要中压缩显示，不是完整业务状态。

规则决定另外通过 `[SB Rules]` 日志记录。该日志包含规则编号和执行计划，使用方法见[定位一条错误的决定](skip-rules-implementation.md#定位一条错误的决定)。
