# Content 内部总线与事件说明
最后更新：2026-05-06

这份文档总结当前 content script 内部的消息总线结构、事件列表，以及几条最重要事件链的触发顺序和内在逻辑。

## 1. 总体结构

content 内部现在分成四层：

| 层 | 作用 | 典型 API |
| --- | --- | --- |
| 跨上下文消息 | popup、background、injected script、MAIN world 之间通信 | `chrome.runtime.sendMessage`、`chrome.runtime.onMessage`、`window.postMessage` |
| CommandBus | 表达“现在去做某件事” | `app.commands.register`、`app.commands.execute` |
| EventBus | 表达“某个业务事实已经发生” | `app.bus.on`、`app.bus.emit` |
| Store / UI Registry | 保存共享状态快照和当前 UI 实例引用 | `app.store`、`app.ui` |

当前核心文件：

- `src/content/app/index.ts`
- `src/content/app/commandBus.ts`
- `src/content/app/eventBus.ts`
- `src/content/app/store.ts`
- `src/content/app/types.ts`
- `src/content.ts`
- `src/content/messageHandler.ts`
- `src/content/segmentSubmission.ts`
- `src/content/skipScheduler.ts`
- `src/content/skipUIManager.ts`
- `src/content/previewBarManager.ts`
- `src/content/videoListeners.ts`
- `src/utils/video.ts`

## 2. 使用规则

推荐边界如下：

| 用什么 | 什么时候用 |
| --- | --- |
| Command | 调用方有明确意图，希望立刻执行一个动作 |
| Event | 某个稳定的业务事实已经成立，而且可能有多个监听方 |
| Store | 需要长期读取的共享状态，而不是一次性通知 |
| 浏览器消息 API | 需要跨 popup、background、MAIN world 等上下文 |

当前默认约定：

- 动作走 command
- 事实走 event
- 持续值走 store
- 跨上下文协议继续留在边界层

## 3. 事件列表

状态说明：

- `active`：当前已经 `emit`，并且至少有一个内部订阅方
- `emit-only`：当前已经 `emit`，但还没有内部订阅方

| 事件 | 业务语义 | 主要发射方 | 主要订阅方 | 状态 |
| --- | --- | --- | --- | --- |
| `app/pageReady` | 页面已真正 ready，可以开始 content 逻辑 | `src/content/state.ts` | 暂无 | emit-only |
| `page/contextChanged` | SPA 路由上下文已变化，`pageType` / URL 已更新 | `src/utils/video.ts` | `src/content.ts` | active |
| `video/resetRequested` | 视频上下文准备切换，content 侧需要先清理 | `src/utils/video.ts` | `src/content.ts` | active |
| `video/idChanged` | 当前 canonical videoID 已变化，或需要同 ID refresh | `src/utils/video.ts` | `src/content.ts` | active |
| `video/elementChanged` | 真实绑定的 `HTMLVideoElement` 已变化 | `src/utils/video.ts` | `src/content.ts` | active |
| `video/channelResolved` | uploader/channel ID 解析完成 | `src/utils/video.ts` | `src/content.ts` | active |
| `channel/whitelistChanged` | 当前视频的频道白名单状态已变化 | `src/content/messageHandler.ts`、`src/content.ts` | `src/content.ts` | active |
| `config/changed` | 本地配置同步监听发现一批配置变化 | `src/content/messageHandler.ts` | 暂无 | emit-only |
| `segments/loaded` | 当前视频的正式分段快照已更新完成 | `src/content/segmentSubmission.ts` | `src/content/previewBarManager.ts`、`src/content/skipScheduler.ts`、`src/content/segmentSubmission.ts` | active |
| `segments/submittingChanged` | 当前视频的本地草稿分段集合已变化 | `src/content/segmentSubmission.ts` | `src/content/previewBarManager.ts`、`src/content/skipScheduler.ts`、`src/content/segmentSubmission.ts` | active |
| `segment/updated` | 某个已存在 segment 的局部字段发生了业务更新 | `src/content/messageHandler.ts`、`src/content/segmentSubmission.ts` | `src/content/previewBarManager.ts`、`src/content/segmentSubmission.ts` | active |
| `skip/executed` | 一次真实 skip 或 mute 已经执行完成 | `src/content/skipScheduler.ts` | 暂无 | emit-only |
| `skip/noticeRequested` | 当前需要展示 skip notice 或 advance notice | `src/content/skipScheduler.ts` | `src/content/skipUIManager.ts` | active |
| `skip/buttonStateChanged` | skip button 需要启用或禁用，并绑定某个 segment | `src/content/skipScheduler.ts`、`src/content/segmentSubmission.ts` | `src/content/skipUIManager.ts` | active |
| `player/timeUpdated` | 当前时间投影已更新 | `src/content/previewBarManager.ts` | 暂无 | emit-only |
| `player/videoReady` | video 已 ready，可以挂载 UI | `src/content/videoListeners.ts` | `src/content/previewBarManager.ts` | active |
| `player/durationChanged` | duration 变化 | `src/content/videoListeners.ts` | `src/content/previewBarManager.ts` | active |
| `player/play` | 原始 play 事件 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `player/playing` | 原始 playing 事件 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `player/seeking` | 原始 seeking 事件 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `player/pause` | 原始 pause 事件 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `player/waiting` | 原始 waiting 事件 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `player/rateChanged` | 播放速率变化 | `src/content/videoListeners.ts` | `src/content/skipScheduler.ts` | active |
| `ui/popupClosed` | 内嵌 popup iframe 已关闭 | `src/content/segmentSubmission.ts` | 暂无 | emit-only |

## 4. Command 命名空间

虽然事件总线已经承接了很多解耦职责，但 command 仍然是主动作入口。

| 命名空间 | 作用 |
| --- | --- |
| `segment/*` | 创建、取消、预览、提交、投票、submission notice 控制 |
| `segments/*` | 拉取正式分段、更新草稿快照、统一修改草稿、导入分段、选中 segment |
| `skip/*` | skip 调度、skip 执行、preview time、virtual time、skip notice 关闭相关逻辑 |
| `ui/*` | preview bar、player buttons、pill、active segment 投影 |
| `popup/*` | 打开和关闭内嵌 popup |
| `port/*` | port-video 提交、投票、刷新 |
| `config/*` | 基于配置触发的 UI 副作用 |

`segments/*` 里有一组专门用于本地草稿 segment 的写入口：

- `segments/updateSubmitting`：从 `Config.local.unsubmittedSegments` 和 URL hash 重新加载当前视频草稿。
- `segments/addSubmitting`：追加一个草稿 segment。
- `segments/replaceSubmitting`：替换当前草稿集合。
- `segments/removeSubmitting`：按 index 删除一个草稿 segment。
- `segments/clearSubmitting`：清空当前视频草稿，并删除对应 local config。

这些 command 最终都收口到 `src/content/segmentSubmission.ts` 内部的提交 helper。它们统一负责：

1. 更新 `contentState.sponsorTimesSubmitting`。
2. 写入或删除 `Config.local.unsubmittedSegments[videoID]`。
3. 同步 `app.store`。
4. 发出 `segments/submittingChanged`。

组件和其他入口不应再直接 `push`、`splice`、`sort` 或赋值 `sponsorTimesSubmitting`，也不应绕过这组入口直接维护当前视频的 `unsubmittedSegments`。

## 5. 核心事件链

下面是当前最重要的几条事件链。

### 5.1 SPA 页面上下文生命周期

触发顺序：

1. `src/utils/video.ts` 从初始 URL、Navigation API、background `update` 或 MAIN world 消息中发现当前路由。
2. 它先把 URL 解析成稳定的 `PageType`，更新 page context。
3. 如果 `pageType` 或 URL 变化，发 `page/contextChanged`。
4. `src/content.ts` 订阅后把 `pageType` 和 `pageUrl` 投影进 `contentState` / store，并触发页面级缩略图刷新。
5. 后续视频 ID 检测只读取已更新的 page context，不再在视频 reset 中清空 `pageType`。

内在逻辑：

- `pageType` 是 URL / 路由状态，不是视频实例状态。
- SPA 路由变化可以不伴随视频 ID 变化，例如视频页到首页、动态页、搜索页。
- 视频页内部短暂解析不到 ID 不能清空当前视频；只有 page context 确认离开支持视频 ID 的页面时，才允许清空 video context。

### 5.2 视频切换生命周期

触发顺序：

1. `src/utils/video.ts` 在当前 page context 下检测到视频切换或需要 refresh。
2. 它先发 `video/resetRequested`。
3. `src/content.ts` 订阅后执行 content 侧 `resetValues()`，清理 scheduler、submission、notice、preview 相关状态。
4. 随后 `src/utils/video.ts` 更新 videoID，并发 `video/idChanged`。
5. `src/content.ts` 订阅后执行 `videoIDChange()`，触发 `segments/lookup`、恢复草稿、刷新 player 相关 UI。
6. 当真实 video DOM 变化时，`src/utils/video.ts` 发 `video/elementChanged`。
7. `src/content.ts` 订阅后安装 video listeners、skip button、pill，并检查 preview bar。
8. 当 uploader 解析完成时，`src/utils/video.ts` 发 `video/channelResolved`。
9. `src/content.ts` 再根据频道解析结果决定是否发 `channel/whitelistChanged`。

内在逻辑：

- `src/utils/video.ts` 只负责检测页面和播放器状态。
- `src/content.ts` 负责把生命周期 fan-out 到 content 内部模块。
- `video/idChanged` 不表示“所有数据已完成”，它只表示“应该开始加载新视频上下文了”。
- `video/resetRequested` 只清理视频上下文，不应清理 page context。

### 5.3 `channel/whitelistChanged`

这个事件现在承接了白名单变化的单一订阅链。

事件来源：

- popup 手动切换白名单：`src/content/messageHandler.ts`
- channel 自动解析命中白名单：`src/content.ts`

payload：

- `videoID`
- `whitelisted`
- `reason: "popupToggle" | "channelResolved"`

触发顺序：

1. 某个入口更新 `contentState.channelWhitelisted`。
2. 同步最新状态到 store。
3. 发出 `channel/whitelistChanged`。
4. `src/content.ts` 统一作为订阅方接收这个事件。
5. 如果 `reason === "popupToggle"`，执行 `segments/lookup`。
6. 如果 `reason === "channelResolved"`，并且 `forceChannelCheck` 开启、当前已存在正式 segments，则执行 `skip/checkStartSponsors`。

内在逻辑：

- 发射方只表达“白名单状态变了”。
- 后续到底是重拉 segments，还是重算 skip，由统一订阅链负责。
- `resetValues()` 不会额外发这个事件，避免 reset 期间误触发拉取或调度。

### 5.4 `segments/loaded`

这是正式分段快照的主事件。

上游来源：

- `sponsorsLookup()`
- `sendSubmitMessage()` 成功路径

触发顺序：

1. 先更新 `contentState.sponsorTimes` 和 `contentState.lastResponseStatus`。
2. `emitSegmentsLoaded()` 先把快照同步进 `app.store`。
3. 然后发出 `segments/loaded`。
4. `previewBarManager` 收到后刷新 preview bar。
5. `skipScheduler` 收到后重建 skip schedule。
6. `segmentSubmission` 自己作为 bridge 收到后，负责 `infoUpdated` 和 VIP locked categories 查询。

内在逻辑：

- 分段拉取模块不再知道 preview bar、skip、popup 分别怎么刷新。
- payload 带 `videoID`，用来避免异步结果污染新视频状态。

### 5.5 `segments/submittingChanged`

这是本地草稿快照的主事件。

上游来源：

- `segments/updateSubmitting`
- `segments/addSubmitting`
- `segments/replaceSubmitting`
- `segments/removeSubmitting`
- `segments/clearSubmitting`
- `segments/import`
- `sendSubmitMessage()` 成功后草稿清空

触发顺序：

1. 调用方通过 `segments/*` command 或 `segmentSubmission` 内部 helper 请求草稿变化。
2. `segmentSubmission` 统一 clone 并提交下一版草稿数组。
3. 如果需要持久化，同步写入或删除 `Config.local.unsubmittedSegments[videoID]`。
4. 更新 `contentState.sponsorTimesSubmitting`。
5. `emitSubmittingChanged()` 先同步 store。
6. 然后发出 `segments/submittingChanged`。
7. `previewBarManager` 刷新 preview bar。
8. `skipScheduler` 重新评估 schedule。
9. `segmentSubmission` 作为 UI bridge，刷新 player buttons 和当前 submission notice。

内在逻辑：

- “草稿变化”被视为稳定业务事实，而不是一串 UI 直调。
- 发射方不需要知道有哪些 UI 会跟着刷新。
- 当前草稿数组的 mutation 入口只有 `segmentSubmission` 内部 helper；组件通过 `skipNoticeContentContainer` 的窄 facade 调 command。
- `skipNoticeContentContainer` 只保留 React notice 组件确实需要的 command facade 和渲染快照，不再暴露 notice registry、UI 实例或未使用的 contentState 快照。

### 5.6 `segment/updated`

这是局部 segment 更新事件。

事件来源：

- popup hide segment：`src/content/messageHandler.ts`
- vote 成功后本地 segment 变更：`src/content/segmentSubmission.ts`

payload：

- `videoID`
- `UUID`
- `segment`
- `reason: "popupHide" | "voteDown" | "voteUp" | "categoryVote"`

触发顺序：

1. 某个入口先修改本地 `segment.hidden` 或 `segment.category`。
2. 同步最新 `contentState.sponsorTimes` 到 store。
3. 发出 `segment/updated`。
4. `previewBarManager` 收到后按当前视频刷新 preview bar。
5. `segmentSubmission` 作为 bridge 收到后，复用既有规则判断是否要发 `skip/buttonStateChanged(enabled: false)`。

内在逻辑：

- 局部 segment 变更不再直接扇出到 preview bar。
- 事件 reason 是业务语义，而不是 UI 行为语义。
- 这条链只处理内容脚本内部联动，不修改 popup/background 现有协议。

### 5.7 player playback scheduling

播放器事实事件现在也是 skip 调度的主要入口。

事件来源：

- `src/content/videoListeners.ts`

订阅方：

- `src/content/skipScheduler.ts`

触发顺序：

1. `videoListeners` 只绑定 DOM video listener，并发出 `player/play`、`player/playing`、`player/seeking`、`player/pause`、`player/waiting`、`player/rateChanged`。
2. `skipScheduler` 订阅这些事件，并维护播放调度相关状态，例如 last check time、waiting 状态、paused-at-zero 状态。
3. `play` / `playing` / `rateChanged` 会更新 virtual time，并在需要时重建 schedule。
4. 播放中的 `seeking` 会按当前 seek 规则重建 schedule；暂停中的 `seeking` 只刷新 active segment。
5. `pause` / `waiting` 会更新 last-known time、waiting time，并取消当前 schedule。

内在逻辑：

- `videoListeners` 是播放器事实适配器，不再直接执行 playback scheduling 业务逻辑。
- `skipScheduler` 是播放调度状态机的归属方。
- `setupVideoListeners()` 末尾仍保留一次初始 `skip/startSchedule` direct command，用来在 listener 安装后启动初始调度；它不是 play/pause/seek 事件响应。

### 5.8 `skip/noticeRequested` 与 `skip/buttonStateChanged`

这两条事件现在是 skip UI 的边界。

触发顺序：

1. `skipScheduler` 负责做 skip 决策。
2. 当需要展示 advance notice 或 skip notice 时，发 `skip/noticeRequested`。
3. `skipUIManager` 收到后创建或更新 `advanceSkipNotice` / `SkipNotice`，并维护 notice registry 的添加、移除和批量关闭。
4. 当 skip button 需要启用或禁用时，发 `skip/buttonStateChanged`。
5. `skipUIManager` 收到后启用或禁用 `SkipButtonControlBar`，并维护 `activeSkipKeybindElement`。

内在逻辑：

- `skipScheduler` 负责决策，不直接 new UI。
- `skipUIManager` 负责实际 UI 创建、notice 生命周期和状态投影。
- `skip/closeNotices` 是关闭 skip notice 的 command 入口。视频 reset 使用 `includeAdvance: true` 同时关闭 advance notice；关闭 notice 快捷键使用 `includeAdvance: false`，保持只关闭普通 skip notice 的行为。

## 6. 仍适合继续观察的候选

目前仍然保留为候选，而没有纳入事件层的内容：

- `lockedCategories/loaded`
- `port/videoUpdated`
- `submission/menuOpened`
- `submission/menuClosed`

原因：

- 要么即时订阅收益还不够明显
- 要么更偏 UI 生命周期
- 要么仍然缺少稳定、清晰的下游消费者

## 7. 后续维护建议

继续扩展时，优先按下面的顺序判断：

1. 如果调用方是在表达“去做一件事”，优先放 command。
2. 如果多个模块都应该在某个业务事实成立后响应，优先放 event。
3. 如果这个值需要被长期读取，优先放 store。
4. 如果通信要跨 popup、background、MAIN world，就继续留在浏览器消息边界。

几个额外建议：

- 异步结果型事件尽量带上 `videoID`。
- 高频事件如 `player/timeUpdated` 不要挂重逻辑。
- UI 创建逻辑尽量留在 UI 订阅方，不要再回流到 scheduler 或数据拉取模块里。
